import {releaseConfig} from './configuration.mjs';
import {createStore} from './firestore.mjs';
import {stripeClient} from './stripe.mjs';
import {createService} from './service.mjs';
import {verifyWebhook,issueReceipt,readReceipt,rawBody} from './signatures.mjs';
import {Fault,hash} from '../cod-staging/security.mjs';
import {CodFault} from '../stripe-live-candidate/cod.mjs';
import {CheckoutFault} from '../stripe-live-candidate/fulfillment.mjs';
export function handler(factories={}){return async(request,env)=>{
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Vary':'Origin'};
 const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
 try{
  const cfg=releaseConfig(env),url=new URL(request.url),origin=request.headers.get('Origin');
  if(url.protocol!=='https:'||url.hostname!==cfg.host||url.search)throw new Fault('invalid_endpoint',403);
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
  const store=(factories.store||createStore)(env),stripe=(factories.stripe||stripeClient)(cfg),service=createService(cfg,store,stripe);
  if(isWebhook){
   if(!['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(body.type))return reply({received:true,ignored:true});
   if(body.livemode!==cfg.live)throw new Fault('event_mode_mismatch',400);
   const session=body.data?.object;
   if(session?.metadata?.integration!=='kandorty-stripe-v1')return reply({received:true,ignored:true});
   if(!/^[a-f0-9]{64}$/.test(session.metadata?.checkout_id||''))throw new Fault('invalid_checkout',400);
   await service.fulfill(session.metadata.checkout_id,session.id);
   return reply({received:true});
  }
  if(url.pathname==='/create-checkout-session'){
   if(!body||Array.isArray(body))throw new Fault('invalid_request');
   const {turnstileToken,...input}=body;
   if(cfg.live){
    if(typeof turnstileToken!=='string'||turnstileToken.length>2048)throw new Fault('anti_bot_required',403);
    const r=await (factories.net||fetch)('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',redirect:'manual',body:new URLSearchParams({secret:env.TURNSTILE_SECRET_KEY,response:turnstileToken}),signal:AbortSignal.timeout(15000)});
    const proof=await r.json();if(!r.ok||proof.success!==true||!['kandorty.online','www.kandorty.online'].includes(proof.hostname)||proof.action!=='checkout')throw new Fault('anti_bot_failed',403);
   }
   const r=await service.create(input);
   return reply({orderId:r.snapshot.orderId,url:r.url||null,complete:r.complete,receipt:await issueReceipt(env.STRIPE_RECEIPT_SECRET,cfg,r.snapshot)});
  }
  if(url.pathname==='/checkout/status'){
   if(!body||Object.keys(body).length!==0)throw new Fault('invalid_request');
   const claims=await readReceipt(env.STRIPE_RECEIPT_SECRET,cfg,request.headers.get('Authorization')?.replace(/^Bearer /,''));
   return reply(await service.status(claims));
  }
  throw new Fault('not_found',404);
 }catch(e){
  if(e instanceof Fault)return reply({error:e.message},e.status);
  if(e instanceof CodFault||e instanceof CheckoutFault)return reply({error:e.code},409);
  return reply({error:'service_unavailable'},503);
 }
};}
export default {fetch:handler(),async scheduled(event,env){const cfg=releaseConfig(env);const result=await createService(cfg,createStore(env),stripeClient(cfg)).reconcile();if(result.failed)throw new Error('stripe_reconciliation_retry_required');}};
