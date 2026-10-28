import {lifecycle} from './lifecycle.mjs';
import {codService} from './cod-service.mjs';
import {syncRefunds} from './refunds.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {releaseConfig,TEST_PROJECT,LIVE_PROJECT} from './configuration.mjs';
import {createService} from './service.mjs';
import {handler} from './worker.mjs';
import {stripeClient} from './stripe.mjs';
import {createStore} from './firestore.mjs';
import {verifyWebhook,issueReceipt,readReceipt} from './signatures.mjs';
import {Fault,sign,random,hash} from '../cod-staging/security.mjs';
import {pack,unpack} from '../cod-staging/firestore.mjs';
const base='https://kandorty-stripe-release-test.aliyajan200011.workers.dev';
const environment=()=>({STRIPE_MODE:'test',FIREBASE_PROJECT_ID:TEST_PROJECT,STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',STRIPE_RECEIPT_SECRET:'b'.repeat(64),STAGING_ACCESS_SECRET:'a'.repeat(64),RATE_LIMITER:{limit:async()=>({success:true})}});
const input=()=>({checkoutToken:random(32),customer:{name:'TEST',phone:'+971500000000',city:'Dubai',location:'TEST'},items:[{id:'p1',qty:1}],note:''});
function fixture(stock=5,live=false){
 const env={...environment(),...(live?{STRIPE_MODE:'live',FIREBASE_PROJECT_ID:LIVE_PROJECT,STRIPE_SECRET_KEY:'sk_live_fixture',LIVE_RELEASE_APPROVAL:'KANDORTY_STRIPE_V1_APPROVED',TURNSTILE_SECRET_KEY:'fixture'}:{})},cfg=releaseConfig(env),root=`projects/${cfg.projectId}/databases/(default)/documents`,rows=new Map();let v=0;
 const put=(path,data)=>rows.set(path,{data,version:'2026-10-28T00:00:00.'+String(++v).padStart(6,'0')+'Z'});
 put('products/p1',{nameAr:'Dress',price:10,stock,totalStock:stock});
 const store={root,rows,put,get:async p=>structuredClone(rows.get(p)||null),write:(path,data,currentDocument)=>({update:{name:root+'/'+path,fields:pack(data).mapValue.fields},currentDocument}),pending:async()=>[...rows].filter(([p,v])=>p.startsWith('stripe_checkout_sessions/')&&v.data.reconcilePending).map(([,v])=>structuredClone(v.data)),commit:async writes=>{
  for(const w of writes){const p=w.update.name.split('/documents/')[1],old=rows.get(p),c=w.currentDocument||{};if(c.exists===false&&old||c.updateTime&&c.updateTime!==old?.version)throw new Fault('write_conflict',409);}
  for(const w of writes){const p=w.update.name.split('/documents/')[1],data=unpack({mapValue:{fields:w.update.fields}});put(p,w.updateMask?{...rows.get(p).data,...data}:data);}
 }};
 const sessions=new Map();
 const stripe={create:async s=>{
  const id=(cfg.live?'cs_live_':'cs_test_')+s.checkoutId;
  if(!sessions.has(id))sessions.set(id,{id,livemode:cfg.live,mode:'payment',status:'open',payment_status:'unpaid',amount_total:s.totalFils,currency:'aed',client_reference_id:s.orderId,metadata:{checkout_id:s.checkoutId,order_id:s.orderId,integration:'kandorty-stripe-v1'},url:'https://checkout.stripe.com/c/pay/'+id});
  return structuredClone(sessions.get(id));
 },retrieve:async id=>{if(!sessions.has(id))throw new Fault('stripe_unavailable',503);return structuredClone(sessions.get(id));}};
 const service=createService(cfg,store,stripe),run=handler({store:()=>store,stripe:()=>stripe});
 const pay=s=>Object.assign(sessions.get(s.sessionId),{status:'complete',payment_status:'paid'});
 const http=(path,body,headers={})=>new Request('https://'+cfg.host+path,{method:'POST',headers:{Origin:cfg.base,'Content-Type':'application/json','X-Staging-Key':env.STAGING_ACCESS_SECRET,...headers},body:typeof body==='string'?body:JSON.stringify(body)});
 return {env,cfg,store,rows,sessions,stripe,service,run,http,pay};
}
async function signedEvent(f,s,patch={}){
 const raw=JSON.stringify({type:'checkout.session.completed',livemode:false,data:{object:f.sessions.get(s.sessionId)},...patch});
 const t=Math.floor(Date.now()/1000),signature='t='+t+',v1='+await sign(f.env.STRIPE_WEBHOOK_SECRET,t+'.'+raw);
 return f.http('/webhook',raw,{'Stripe-Signature':signature});
}
test('configuration cannot mix test/live keys or projects and Live stays blocked without explicit gate',()=>{
 const e=environment();assert.equal(releaseConfig(e).live,false);
 for(const patch of [{STRIPE_MODE:'disabled'},{STRIPE_SECRET_KEY:'sk_live_fixture'},{FIREBASE_PROJECT_ID:LIVE_PROJECT},{STRIPE_MODE:'live',FIREBASE_PROJECT_ID:LIVE_PROJECT,STRIPE_SECRET_KEY:'sk_live_fixture'}])assert.throws(()=>releaseConfig({...e,...patch}));
 const live={...e,STRIPE_MODE:'live',FIREBASE_PROJECT_ID:LIVE_PROJECT,STRIPE_SECRET_KEY:'sk_live_fixture',LIVE_RELEASE_APPROVAL:'KANDORTY_STRIPE_V1_APPROVED',TURNSTILE_SECRET_KEY:'fixture'};
 assert.equal(releaseConfig(live).live,true);assert.throws(()=>releaseConfig({...live,STRIPE_SECRET_KEY:'sk_test_fixture'}));
});
test('server creates immutable priced snapshot, 25 AED shipping once, idempotent Checkout, changed retry rejected',async()=>{
 const f=fixture(),req=input();const a=await f.service.create(req),b=await f.service.create(req);
 assert.equal(a.snapshot.totalFils,3500);assert.equal(a.snapshot.sessionId,b.snapshot.sessionId);assert.equal(f.sessions.size,1);assert.equal(f.rows.get('products/p1').data.stock,5);
 await assert.rejects(f.service.create({...req,note:'changed'}),/checkout_conflict/);
 await assert.rejects(f.service.create({...input(),total:1}),/unsupported_client_fields/);
});
test('concurrent create binds one Checkout without overwriting frozen data',async()=>{
 const f=fixture(),req=input();const rs=await Promise.all([f.service.create(req),f.service.create(req)]);
 assert.equal(rs[0].snapshot.sessionId,rs[1].snapshot.sessionId);assert.equal(f.sessions.size,1);
});
test('signed webhook alone registers paid order and stock without browser return; duplicate deliveries are idempotent',async()=>{
 const f=fixture(),{snapshot:s}=await f.service.create(input());f.pay(s);
 const rs=await Promise.all([f.run(await signedEvent(f,s),f.env),f.run(await signedEvent(f,s),f.env)]);
 assert.ok(rs.every(r=>r.status===200));assert.equal(f.rows.get('products/p1').data.stock,4);
 assert.equal(f.rows.get('orders/'+s.orderId).data.paymentStatus,'paid');assert.equal([...f.rows.keys()].filter(p=>p.startsWith('orders/')).length,1);
 assert.equal([...f.rows.keys()].filter(p=>p.startsWith('stripe_payment_claims/')).length,1);
 assert.equal(f.rows.get('stripe_checkout_sessions/'+s.checkoutId).data.reconcilePending,false);
});
test('raw signature rejects body tampering, wrong secret, missing header and old/future timestamp; rotation signature works',async()=>{
 const raw='{"a": 1}',secret='whsec_test',now=Date.now(),t=Math.floor(now/1000),sig=await sign(secret,t+'.'+raw);
 assert.equal(await verifyWebhook(raw,'t='+t+',v1='+'0'.repeat(64)+',v1='+sig,secret,now),true);
 for(const [b,h,k] of [[raw+' ','t='+t+',v1='+sig,secret],[raw,'t='+t+',v1='+sig,'whsec_wrong'],[raw,null,secret]])await assert.rejects(verifyWebhook(b,h,k,now),/invalid_signature/);
 for(const stamp of [t-301,t+301])await assert.rejects(verifyWebhook(raw,'t='+stamp+',v1='+await sign(secret,stamp+'.'+raw),secret,now),/invalid_signature/);
});
test('signed event is not payment proof: re-retrieved unpaid, wrong amount and wrong metadata never fulfill',async()=>{
 for(const patch of [{payment_status:'unpaid'},{amount_total:1},{metadata:{integration:'kandorty-stripe-v1',checkout_id:'c'.repeat(64),order_id:'KD-00000000'}}]){
  const f=fixture(),{snapshot:s}=await f.service.create(input());f.pay(s);Object.assign(f.sessions.get(s.sessionId),patch);
  try{await f.service.fulfill(s.checkoutId,s.sessionId);}catch{}
  assert.equal(f.rows.get('products/p1').data.stock,5);assert.equal(f.rows.has('orders/'+s.orderId),false);
 }
});
test('forged or opposite-mode webhook cannot access order fulfillment; unrelated integration events ignored',async()=>{
 const f=fixture(),{snapshot:s}=await f.service.create(input());
 assert.equal((await f.run(f.http('/webhook',{}),f.env)).status,400);
 assert.equal((await f.run(await signedEvent(f,s,{livemode:true}),f.env)).status,400);
 const event=await signedEvent(f,s,{data:{object:{metadata:{integration:'another-app'}}}});
 assert.equal((await f.run(event,f.env)).status,200);assert.equal(f.rows.get('products/p1').data.stock,5);
});
test('two paid buyers competing for last stock produce one debit and durable manual-review queue',async()=>{
 const f=fixture(1),a=(await f.service.create(input())).snapshot,b=(await f.service.create(input())).snapshot;f.pay(a);f.pay(b);
 const rs=await Promise.all([f.service.fulfill(a.checkoutId,a.sessionId),f.service.fulfill(b.checkoutId,b.sessionId)]);
 assert.equal(f.rows.get('products/p1').data.stock,0);assert.equal(rs.filter(r=>r.order.inventoryStatus==='needs_review').length,1);
 assert.equal([...f.rows.keys()].filter(k=>k.startsWith('stripe_review_queue/')).length,1);
 for(const r of rs)assert.equal(r.order.paymentStatus,'paid');
});
test('disabled product after payment cannot silently fulfill; no inventory reduction',async()=>{
 const f=fixture(),s=(await f.service.create(input())).snapshot;f.pay(s);f.store.put('products/p1',{stock:5,price:10,active:false});
 const r=await f.service.fulfill(s.checkoutId,s.sessionId);assert.equal(r.order.inventoryStatus,'needs_review');assert.equal(f.rows.get('products/p1').data.stock,5);
});
test('guest receipt bound to mode/order/checkout; status returns no PII or edit token',async()=>{
 const f=fixture(),s=(await f.service.create(input())).snapshot,receipt=await issueReceipt(f.env.STRIPE_RECEIPT_SECRET,f.cfg,s);f.pay(s);
 const r=await f.run(f.http('/checkout/status',{}, {Authorization:'Bearer '+receipt}),f.env);assert.equal(r.status,200);
 const text=await r.text();assert.ok(text.includes('paid'));for(const k of ['phone','customer','editToken','accessKey'])assert.ok(!text.includes(k));
 await assert.rejects(readReceipt(f.env.STRIPE_RECEIPT_SECRET,{mode:'live'},receipt),/invalid_receipt/);
 assert.equal((await f.run(f.http('/checkout/status',{}, {Authorization:'Bearer '+receipt.slice(0,-1)+'z'}),f.env)).status,401);
});
test('reconciliation recovers a paid checkout with missed webhook',async()=>{
 const f=fixture(),s=(await f.service.create(input())).snapshot;f.pay(s);assert.deepEqual(await f.service.reconcile(),{paid:1,pending:0,failed:0});
 assert.equal(f.rows.get('products/p1').data.stock,4);assert.deepEqual(await f.service.reconcile(),{paid:0,pending:0,failed:0});
});
test('expired sessions stop consuming reconciliation slots; uncertain creation is queued for manual review',async()=>{
 const f=fixture(),s=(await f.service.create(input())).snapshot;f.sessions.get(s.sessionId).status='expired';await f.service.reconcile();assert.equal((await f.store.pending()).length,0);
 const orphan={...s,checkoutId:'f'.repeat(64),sessionId:'',fulfilled:false,reconcilePending:true,createdAt:new Date(Date.now()-1900000).toISOString()};
 f.store.put('stripe_checkout_sessions/'+orphan.checkoutId,orphan);await f.service.reconcile();assert.ok(f.rows.has('stripe_review_queue/pending_'+orphan.checkoutId));
});
test('database failure before commit yields retriable webhook error; successful retry debits once',async()=>{
 const f=fixture(),s=(await f.service.create(input())).snapshot;f.pay(s);const commit=f.store.commit;let fail=true;
 f.store.commit=async w=>{if(fail){fail=false;throw new Error('outage');}return commit(w);};
 assert.equal((await f.run(await signedEvent(f,s),f.env)).status,503);assert.equal(f.rows.get('products/p1').data.stock,5);
 assert.equal((await f.run(await signedEvent(f,s),f.env)).status,200);assert.equal(f.rows.get('products/p1').data.stock,4);
});
test('ambiguous commit response recovers without a second stock debit',async()=>{
 const f=fixture(),s=(await f.service.create(input())).snapshot;f.pay(s);const commit=f.store.commit;let once=true;
 f.store.commit=async w=>{await commit(w);if(once){once=false;throw new Error('lost response');}};
 await assert.rejects(f.service.fulfill(s.checkoutId,s.sessionId));assert.equal((await f.service.fulfill(s.checkoutId,s.sessionId)).replay,true);assert.equal(f.rows.get('products/p1').data.stock,4);
});
test('origin, staging gate, rate limiting and body bounds are enforced',async()=>{
 const f=fixture();assert.equal((await f.run(f.http('/create-checkout-session',input(),{Origin:'https://evil.example'}),f.env)).status,403);
 assert.equal((await f.run(f.http('/create-checkout-session',input(),{'X-Staging-Key':''}),f.env)).status,401);
 assert.equal((await f.run(f.http('/create-checkout-session',input()),{...f.env,RATE_LIMITER:null})).status,429);
 assert.equal((await f.run(f.http('/create-checkout-session',{note:'x'.repeat(17000)}),f.env)).status,413);
});
test('Stripe HTTP adapter pins origin, idempotency, metadata and 25 AED shipping; redirects fail closed',async()=>{
 const f=fixture(),s=(await f.service.create(input())).snapshot;let called=false;
 const client=stripeClient(f.cfg,async(url,opts)=>{called=true;assert.equal(url,'https://api.stripe.com/v1/checkout/sessions');assert.equal(opts.redirect,'manual');assert.equal(opts.headers['Idempotency-Key'],'kandorty-test-'+s.checkoutId);assert.equal(opts.body.get('line_items[1][price_data][unit_amount]'),'2500');assert.equal(opts.body.get('metadata[integration]'),'kandorty-stripe-v1');return Response.json({id:s.sessionId});});
 await client.create(s);assert.equal(called,true);
 await assert.rejects(stripeClient(f.cfg,async()=>new Response('',{status:302})).retrieve(s.sessionId),/stripe_unavailable/);
});
test('production Firestore credential cannot be paired with test release configuration',()=>{
 assert.throws(()=>createStore({...environment(),FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:LIVE_PROJECT})}),/isolated_test_project_required/);
});
test('LIVE-mode branch is exercised only against mock services with strict live session/amount binding',async()=>{
 const f=fixture(2,true),s=(await f.service.create(input())).snapshot;assert.ok(s.sessionId.startsWith('cs_live_'));f.pay(s);
 const result=await f.service.fulfill(s.checkoutId,s.sessionId);assert.equal(result.order.paymentStatus,'paid');assert.equal(f.rows.get('products/p1').data.stock,1);
 f.sessions.get(s.sessionId).livemode=false;await assert.rejects(f.service.fulfill(s.checkoutId,s.sessionId),/session_mode_mismatch/);
});
test('LIVE checkout fails closed without verified Turnstile and cannot use a test staging bypass',async()=>{
 const f=fixture(5,true);const res=await f.run(f.http('/create-checkout-session',input()),f.env);assert.equal(res.status,403);assert.equal(f.sessions.size,0);
});
test('test storefront assets are isolated; Live never serves private staging UI',async()=>{
 const f=fixture();f.env.ASSETS={fetch:async()=>new Response('TEST ONLY')};
 const r=await f.run(new Request(base+'/?stripe=success'),f.env);assert.equal(r.status,200);assert.equal(await r.text(),'TEST ONLY');assert.equal(r.headers.get('Cache-Control'),'no-store');
 const live=fixture(5,true);live.env.ASSETS=f.env.ASSETS;
 assert.notEqual((await live.run(new Request('https://'+live.cfg.host+'/'),live.env)).status,200);
});
test('emergency stop disables new Checkout but preserves verified webhook and guest status',async()=>{
 const f=fixture(),{snapshot:s}=await f.service.create(input());f.pay(s);f.env.CHECKOUT_DISABLED='true';
 assert.equal((await f.run(f.http('/create-checkout-session',input()),f.env)).status,503);
 assert.equal((await f.run(await signedEvent(f,s),f.env)).status,200);
 const receipt=await issueReceipt(f.env.STRIPE_RECEIPT_SECRET,f.cfg,s);
 const r=await f.run(f.http('/checkout/status',{}, {Authorization:'Bearer '+receipt}),f.env);assert.equal(r.status,200);assert.equal((await r.json()).paid,true);
});

test('COD server route prices stock atomically, retries once, guest status stays private',async()=>{
 const f=fixture(1),req=input();const rs=await Promise.all([f.run(f.http('/cod/orders',req),f.env),f.run(f.http('/cod/orders',req),f.env)]);assert.ok(rs.every(r=>[200,201].includes(r.status)));const a=await rs[0].json();assert.equal(a.order.total,35);assert.equal(a.manageToken.length,48);assert.equal(a.order.customer,undefined);assert.equal(f.rows.get('products/p1').data.stock,0);
 const status=await f.run(f.http('/checkout/status',{}, {Authorization:'Bearer '+a.receipt}),f.env);assert.equal((await status.json()).registered,true);
 const cancel=()=>f.run(f.http('/orders/cancel',{orderId:a.order.id,manageToken:a.manageToken},{Authorization:'Bearer '+a.receipt}),f.env);
 const results=await Promise.all([cancel(),cancel()]);assert.ok(results.every(r=>r.status===200));assert.equal(f.rows.get('products/p1').data.stock,1);assert.equal(f.rows.get('orders/'+a.order.id).data.status,'cancelled');
 assert.equal((await f.run(f.http('/orders/cancel',{orderId:a.order.id,manageToken:'f'.repeat(48)},{Authorization:'Bearer '+a.receipt}),f.env)).status,409);
});
test('guest cannot cancel from tracking receipt alone or after admin begins preparation',async()=>{
 const f=fixture(),{snapshot:s}=await f.service.create(input());f.pay(s);await f.service.fulfill(s.checkoutId,s.sessionId);const manage=lifecycle(f.cfg,f.store);
 await assert.rejects(manage.change(s.orderId,'cancelled',{kind:'guest',checkoutId:s.checkoutId,manageToken:'wrong'}),/invalid_manage_token/);
 await manage.change(s.orderId,'preparing',{kind:'admin',uid:'admin'});
 await assert.rejects(manage.change(s.orderId,'cancelled',{kind:'guest',checkoutId:s.checkoutId,manageToken:s.editToken}),/order_state_locked/);
 assert.equal(f.rows.get('products/p1').data.stock,4);await assert.rejects(manage.change(s.orderId,'delivered',{kind:'admin',uid:'admin'}),/order_state_locked/);
});
test('concurrent cancellation and preparation cannot both win; stock restored at most once',async()=>{
 const f=fixture(1),{snapshot:s}=await f.service.create(input());f.pay(s);await f.service.fulfill(s.checkoutId,s.sessionId);const l=lifecycle(f.cfg,f.store);
 const rs=await Promise.allSettled([l.change(s.orderId,'cancelled',{kind:'guest',checkoutId:s.checkoutId,manageToken:s.editToken}),l.change(s.orderId,'preparing',{kind:'admin',uid:'admin'})]);assert.equal(rs.filter(r=>r.status==='fulfilled').length,1);
 const o=f.rows.get('orders/'+s.orderId).data;assert.equal(f.rows.get('products/p1').data.stock,o.status==='cancelled'?1:0);
 await f.service.fulfill(s.checkoutId,s.sessionId);assert.equal(f.rows.get('products/p1').data.stock,o.status==='cancelled'?1:0);
});
test('refund synchronization retains capture, exposes full/partial/pending truth and never restores stock',async()=>{
 const f=fixture(),{snapshot:s}=await f.service.create(input());f.pay(s);await f.service.fulfill(s.checkoutId,s.sessionId);
 let state={amount:1000,status:'partial'};const provider={refundState:async()=>state};
 await syncRefunds(f.store,provider,s);assert.equal(f.rows.get('orders/'+s.orderId).data.refundedAmount,10);
 state={amount:0,status:'none'};await syncRefunds(f.store,provider,s);assert.equal(f.rows.get('orders/'+s.orderId).data.refundedAmount,10);
 state={amount:3500,status:'full'};await syncRefunds(f.store,provider,s);const o=f.rows.get('orders/'+s.orderId).data;assert.equal(o.refundStatus,'full');assert.equal(o.paymentStatus,'paid');assert.equal(f.rows.get('products/p1').data.stock,4);
});
test('paid shortage cancellation restores zero and refund completion resolves review queues',async()=>{
 const f=fixture(1),{snapshot:s}=await f.service.create(input());f.rows.get('products/p1').data.stock=0;f.pay(s);await f.service.fulfill(s.checkoutId,s.sessionId);
 await lifecycle(f.cfg,f.store).change(s.orderId,'cancelled',{kind:'guest',checkoutId:s.checkoutId,manageToken:s.editToken});assert.equal(f.rows.get('products/p1').data.stock,0);assert.equal(f.rows.get('orders/'+s.orderId).data.refundStatus,'required');
 await syncRefunds(f.store,{refundState:async()=>({amount:3500,status:'full'})},s);assert.equal(f.rows.get('stripe_review_queue/'+s.orderId).data.resolved,true);assert.equal(f.rows.get('stripe_refund_queue/'+s.orderId).data.resolved,true);
});
test('admin HTTP route rejects guest staging gate without verified administrator token',async()=>{
 const f=fixture();const r=await f.run(f.http('/admin/orders/status',{orderId:'KD-12345678',status:'preparing'}),f.env);assert.equal(r.status,403);
});
test('signed refund webhook re-retrieves provider truth and updates the correct payment-bound order only',async()=>{
 const f=fixture(),{snapshot:s}=await f.service.create(input());f.sessions.get(s.sessionId).payment_intent='pi_fixture';f.pay(s);await f.service.fulfill(s.checkoutId,s.sessionId);
 f.stripe.refundState=async()=>({amount:3500,status:'full'});
 const event=await signedEvent(f,s,{type:'refund.updated',data:{object:{payment_intent:'pi_fixture',status:'failed'}}});
 assert.equal((await f.run(event,f.env)).status,200);assert.equal(f.rows.get('orders/'+s.orderId).data.refundStatus,'full');assert.equal(f.rows.get('products/p1').data.stock,4);
});
test('scheduled reconciliation recovers missed refund event for cancelled paid order',async()=>{
 const f=fixture(),{snapshot:s}=await f.service.create(input());f.pay(s);await f.service.fulfill(s.checkoutId,s.sessionId);
 await lifecycle(f.cfg,f.store).change(s.orderId,'cancelled',{kind:'guest',checkoutId:s.checkoutId,manageToken:s.editToken});
 f.store.refundPending=async()=>[{orderId:s.orderId,checkoutId:s.checkoutId}];f.stripe.refundState=async()=>({amount:3500,status:'full'});
 assert.equal((await f.service.reconcile()).failed,0);assert.equal(f.rows.get('orders/'+s.orderId).data.refundStatus,'full');assert.equal(f.rows.get('stripe_refund_queue/'+s.orderId).data.resolved,true);assert.equal(f.rows.get('products/p1').data.stock,5);
});
