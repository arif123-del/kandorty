import {pushKeys,enroll,sendOrderPush,requireOrderReader} from './order-push.mjs';
import {nativePushUserId,nativePushDevice,sendNativeOrderPush,sendNativeTestPush} from './native-push.mjs';
import {claimDirectOrderNotification,deliverClaimedOrderNotification} from './direct-order-push.mjs';
import {verifyAdmin} from './admin-auth.mjs';
import {runScheduledAlert} from './alert-scheduler.mjs';
import {sendOperatorEmail} from './operations-email.mjs';
import {auditResendDelivery} from './resend-delivery-audit.mjs';
import {lifecycle} from './lifecycle.mjs';
import {legacyStatusTestService} from './legacy-status-service.mjs';
import {codService} from './cod-service.mjs';
import {syncRefunds} from './refunds.mjs';
import {releaseConfig} from './configuration.mjs';
import {createStore} from './firestore.mjs';
import {stripeClient} from './stripe.mjs';
import {createService} from './service.mjs';
import {verifyWebhook,issueReceipt,readReceipt,rawBody} from './signatures.mjs';
import {STRIPE_CHECKOUT_EVENTS,STRIPE_REFUND_EVENTS} from './webhook-contract.mjs';
import {Fault,hash} from '../cod-staging/security.mjs';
import {CodFault} from '../stripe-live-candidate/cod.mjs';
import {CheckoutFault} from '../stripe-live-candidate/fulfillment.mjs';
export function handler(factories={}){return async(request,env,ctx)=>{
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Vary':'Origin'};
 const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
 try{
  const cfg=releaseConfig(env),url=new URL(request.url),origin=request.headers.get('Origin');
  if(url.protocol!=='https:'||url.hostname!==cfg.host)throw new Fault('invalid_endpoint',403);
  if(!cfg.live&&request.method==='GET'&&['/','/index.html','/browser-client.mjs'].includes(url.pathname)&&env.ASSETS){
   const response=await env.ASSETS.fetch(request);const h=new Headers(response.headers);h.set('Cache-Control','no-store');h.set('Referrer-Policy','no-referrer');h.set('X-Content-Type-Options','nosniff');return new Response(response.body,{status:response.status,headers:h});
  }
  if(url.search)throw new Fault('invalid_endpoint',403);
  if(!cfg.live&&url.pathname==='/health'){
   if(request.method==='HEAD')return new Response(null,{headers});
   if(request.method==='GET')return reply({ok:true});
  }
  const isWebhook=url.pathname==='/webhook';
  if(!isWebhook){
   if(!cfg.origins.includes(origin))throw new Fault('origin_forbidden',403);
   headers['Access-Control-Allow-Origin']=origin;
   if(request.method==='OPTIONS'){headers['Access-Control-Allow-Methods']='POST, OPTIONS';headers['Access-Control-Allow-Headers']='Content-Type, Authorization, X-Staging-Key';return new Response(null,{status:204,headers});}
   if(!cfg.live&&await hash(request.headers.get('X-Staging-Key')||'')!==await hash(env.STAGING_ACCESS_SECRET))throw new Fault('staging_access_required',401);
   if(!env.RATE_LIMITER||!(await env.RATE_LIMITER.limit({key:await hash(request.headers.get('CF-Connecting-IP')||'unknown')})).success)throw new Fault('rate_limited',429);
  }
  if(request.method!=='POST')throw new Fault('method_not_allowed',405);
  const raw=await rawBody(request,isWebhook?65536:16384);
  if(isWebhook)await verifyWebhook(raw,request.headers.get('Stripe-Signature'),String(env.STRIPE_WEBHOOK_SECRET).trim());
  let body;try{body=JSON.parse(raw);}catch{throw new Fault('invalid_json',400);}
  const store=(factories.store||createStore)(env);
  if(isWebhook&&!cfg.live&&body?.type==='charge.dispute.created'){
   if(body.livemode!==false)throw new Fault('event_mode_mismatch',400);
   if(typeof body.id!=='string'||!/^evt_[A-Za-z0-9]{1,100}$/.test(body.id))throw new Fault('invalid_event',400);
   const eventHash=await hash(body.id);
   const path='stripe_operator_alerts/dispute-'+eventHash;
   if(await store.get(path))return reply({received:true});
   const result=await sendOperatorEmail({
    subject:'[Kandorty TEST] Stripe dispute opened',
    text:'A dispute was opened in the Kandorty Stripe Sandbox. Review the Disputes page in the Sandbox dashboard.'
   },{...env,ALERT_EVENT_KEY:'kandorty-test-dispute-'+eventHash},factories.alertNet||fetch);
   if(result.status!=='accepted_by_provider_not_delivered')throw new Fault('alert_delivery_disabled',503);
   try{await store.commit([store.write(path,{status:'accepted'},{exists:false})]);}
   catch(e){if(e?.message!=='write_conflict'||!(await store.get(path)))throw e;}
   return reply({received:true});
  }
  if(cfg.live&&url.pathname==='/admin/order-push'){
   // A Firestore-permitted orders reader OR a server-verified active admin
   // can register Web Push. Both are independently authenticated; never
   // bypass authorization on a Firestore outage or any unexpected error.
   try{await requireOrderReader(request,cfg);}
   catch(error){
    if(error?.message!=='admin_authorization_required')throw error;
    await verifyAdmin(request.headers.get('Authorization')?.replace(/^Bearer /,''),cfg,store,factories.authNet||fetch);
   }
   if(body?.action==='key')return reply({publicKey:(await pushKeys(store)).publicKey});
   if(body?.action!=='subscribe'||typeof body.endpoint!=='string')throw new Fault('invalid_request');
   await enroll(store,body.endpoint);return reply({enabled:true});
  }
  // Separate, device-specific FCM registry. Do not expose it to guests,
  // TEST mode, or public checkout routes.
  if(cfg.live&&url.pathname==='/admin/native-push'){
   try{await requireOrderReader(request,cfg);}
   catch(error){
    if(error?.message!=='admin_authorization_required')throw error;
    await verifyAdmin(request.headers.get('Authorization')?.replace(/^Bearer /,''),cfg,store,factories.authNet||fetch);
   }
   const uid=nativePushUserId(request.headers.get('Authorization'),cfg);
   if(body?.action==='test' && typeof body?.token==='string')
    return reply(await sendNativeTestPush(store,env,uid,body.token,factories.nativePushNet||fetch));
   if(!['register','remove'].includes(body?.action)||typeof body?.token!=='string')
    throw new Fault('invalid_native_push_action',400);
   return reply(await nativePushDevice(store,uid,body.token,body.action));
  }
  // The public Kandorty checkout writes orders directly to Firestore; it
  // does not pass through /cod/orders or Stripe's onNewOrder callback. An
  // untrusted website may only request a notification by proving possession
  // of the saved order's random edit token, and the backend checks age and
  // deduplicates before it sends. Notifications contain no personal data.
  if(cfg.live&&url.pathname==='/orders/direct-push'){
   const claim=await claimDirectOrderNotification(store,body);
   const delivery=()=>deliverClaimedOrderNotification(store,claim,
     ()=>sendOrderPush(store,factories.pushNet||fetch),
     ()=>sendNativeOrderPush(store,env,factories.nativePushNet||fetch));
   if(claim.claimed&&ctx?.waitUntil){
    ctx.waitUntil(delivery().catch(e=>console.error('direct_order_push_failed',e?.message)));
    return reply({queued:true},202);
   }
   if(claim.claimed)return reply(await delivery(),202);
   return reply({queued:false,duplicate:true},200);
  }
  const onNewOrder=cfg.live&&ctx?()=>{
   ctx.waitUntil(sendOrderPush(store).catch(()=>console.error('order_push_failed')));
   ctx.waitUntil(sendNativeOrderPush(store,env,factories.nativePushNet||fetch).catch(()=>
     console.error('native_order_push_failed')));
  }:undefined;
  const stripe=(factories.stripe||stripeClient)(cfg),service=createService(cfg,store,stripe,onNewOrder);
  if(isWebhook){
   if(STRIPE_REFUND_EVENTS.includes(body.type)){
    if(body.livemode!==cfg.live)throw new Fault('event_mode_mismatch',400);
    const pi=body.data?.object?.payment_intent;if(typeof pi!=='string'||!/^pi_[A-Za-z0-9]+$/.test(pi))throw new Fault('invalid_payment_intent');
    const link=(await store.get('stripe_payment_intents/'+await hash(pi)))?.data;
    if(!link)return reply({received:true,ignored:true});
    const snapshot=(await store.get('stripe_checkout_sessions/'+link.checkoutId))?.data;
    if(!snapshot||snapshot.orderId!==link.orderId||snapshot.sessionId!==link.sessionId)throw new Fault('refund_binding_mismatch',409);
    await syncRefunds(store,stripe,snapshot);return reply({received:true});
   }
   if(!STRIPE_CHECKOUT_EVENTS.includes(body.type))return reply({received:true,ignored:true});
   if(body.livemode!==cfg.live)throw new Fault('event_mode_mismatch',400);
   const session=body.data?.object;
   if(session?.metadata?.integration!=='kandorty-stripe-v1')return reply({received:true,ignored:true});
   if(!/^[a-f0-9]{64}$/.test(session.metadata?.checkout_id||''))throw new Fault('invalid_checkout',400);
   const settled=await service.fulfill(session.metadata.checkout_id,session.id);
   await store.commit([store.write('stripe_webhook_receipts/'+session.metadata.checkout_id,{sessionId:session.id,paid:settled.paid,verifiedAt:new Date().toISOString()})]);
   return reply({received:true});
  }
  if(['/create-checkout-session','/cod/orders'].includes(url.pathname)){
   if(env.CHECKOUT_DISABLED==='true')throw new Fault('checkout_temporarily_disabled',503);
   if(!body||Array.isArray(body))throw new Fault('invalid_request');
   const {turnstileToken,...input}=body;
   if(cfg.live){
    if(typeof turnstileToken!=='string'||turnstileToken.length>2048)throw new Fault('anti_bot_required',403);
    const r=await (factories.net||fetch)('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',redirect:'manual',body:new URLSearchParams({secret:env.TURNSTILE_SECRET_KEY,response:turnstileToken}),signal:AbortSignal.timeout(15000)});
    const proof=await r.json();if(!r.ok||proof.success!==true||!['kandorty.online','www.kandorty.online'].includes(proof.hostname)||proof.action!=='checkout')throw new Fault('anti_bot_failed',403);
   }
   if(url.pathname==='/cod/orders'){
    const r=await codService(cfg,store,onNewOrder).create(input);return reply({...r, snapshot:undefined,receipt:await issueReceipt(env.STRIPE_RECEIPT_SECRET,cfg,r.snapshot)},r.replay?200:201);
   }
   const r=await service.create(input);
   return reply({orderId:r.snapshot.orderId,manageToken:r.snapshot.editToken,url:r.url||null,complete:r.complete,receipt:await issueReceipt(env.STRIPE_RECEIPT_SECRET,cfg,r.snapshot)});
  }
  if(url.pathname==='/checkout/status'){
   if(!body||Object.keys(body).length!==0)throw new Fault('invalid_request');
   const claims=await readReceipt(env.STRIPE_RECEIPT_SECRET,cfg,request.headers.get('Authorization')?.replace(/^Bearer /,''));
   const cod=(await store.get('cod_checkout_intents/'+claims.checkoutId))?.data;
   return reply(cod?.orderId===claims.orderId?await codService(cfg,store).status(claims):await service.status(claims));
  }
  if(url.pathname==='/orders/cancel'){
   if(!body||Object.keys(body).some(k=>!['orderId','manageToken'].includes(k))||!/^KD-\d{8}$/.test(body.orderId||'')||!/^[a-f0-9]{48}$/.test(body.manageToken||''))throw new Fault('invalid_request');
   const claims=await readReceipt(env.STRIPE_RECEIPT_SECRET,cfg,request.headers.get('Authorization')?.replace(/^Bearer /,''));
   if(claims.orderId!==body.orderId)throw new Fault('invalid_receipt',401);
   return reply({order:await lifecycle(cfg,store).change(body.orderId,'cancelled',{kind:'guest',checkoutId:claims.checkoutId,manageToken:body.manageToken})});
  }
  if(url.pathname==='/admin/legacy/orders/status'){
   // Explicit TEST-only, owner-controlled feature gate. Impossible to use in
   // Live even with a copied approval token. Do not route production legacy
   // admin operations here before a coordinated client migration.
   const legacy=legacyStatusTestService(cfg,store,env);
   const actor=await verifyAdmin(request.headers.get('Authorization')?.replace(/^Bearer /,''),cfg,store,factories.authNet||fetch);
   if(!body||Array.isArray(body)||Object.keys(body).some(k=>!['orderId','status'].includes(k)))
    throw new Fault('invalid_request',409);
   return reply({order:await legacy.change(body.orderId,body.status,{kind:'admin',uid:actor.uid})});
  }
  if(url.pathname==='/admin/orders/status'){
   const actor=await verifyAdmin(request.headers.get('Authorization')?.replace(/^Bearer /,''),cfg,store,factories.authNet||fetch);
   if(!body||Object.keys(body).some(k=>!['orderId','status'].includes(k)))throw new Fault('invalid_request');
   return reply({order:await lifecycle(cfg,store).change(body.orderId,body.status,{kind:'admin',uid:actor.uid})});
  }
  throw new Fault('not_found',404);
 }catch(e){
  if(e instanceof Fault)return reply({error:e.message},e.status);
  if(e instanceof CodFault||e instanceof CheckoutFault)return reply({error:e.code},409);
  return reply({error:'service_unavailable'},503);
 }
};}
export default {fetch:handler(),async scheduled(event,env,ctx){
 const cfg=releaseConfig(env),store=createStore(env);
 const result=await createService(cfg,store,stripeClient(cfg),cfg.live&&ctx?()=>ctx.waitUntil(sendOrderPush(store).catch(()=>console.error('order_push_failed'))):undefined).reconcile();
 // Alerts are OFF unless a private operator explicitly enables and configures
 // them. No emails are sent from default test/production deployments.
 if(env.ALERT_DELIVERY_ENABLED==='true'){
  await runScheduledAlert({store,env});
  // Read only Resend provider last-event metadata. A sending-only API key
  // may lack list permission; audit fails unverified without blocking checkout.
  // Resend domain-scoped Sending Access keys cannot GET sent-email status.
  // A separate, explicitly authorized read-capable credential is required.
  if(env.RESEND_READ_ACCESS_ENABLED==='true')await auditResendDelivery({store,env});
 }
 if(result.failed)throw new Error('stripe_reconciliation_retry_required');
}};
