import {test} from 'node:test';
import assert from 'node:assert/strict';
import {memoryStore,request,evidence} from './fixtures.mjs';
import {pricedSnapshot,bindPayment} from './snapshot.mjs';
import {settle,PROJECT} from './settlement.mjs';
import {retrievePayment} from './providers.mjs';
import {handler} from '../cod-staging/worker.mjs';
import {hash,receipt} from '../cod-staging/security.mjs';
const env={COD_MODE:'test',STRIPE_TEST_PROJECT_ID:PROJECT,STAGING_ACCESS_SECRET:'a'.repeat(64),GUEST_RECEIPT_SECRET:'b'.repeat(64),IP_LIMITER:{limit:async()=>({success:true})},PHONE_LIMITER:{limit:async()=>({success:true})}};
const base='https://kandorty-cod-orders-test.aliyajan200011.workers.dev';
const http=(path,body,headers={})=>new Request(base+path,{method:body?'POST':'GET',headers:{'X-Staging-Key':env.STAGING_ACCESS_SECRET,'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});
async function setup(store,provider,req=request()){
 const draft=await pricedSnapshot(store,req,provider),payment=evidence(draft),snapshot=await bindPayment(store,draft,payment);
 return {snapshot,payment,req,run:()=>settle({env,store,checkoutId:snapshot.checkoutId,provider,fetchPayment:async()=>payment})};
}
test('three providers share one inventory; duplicate Stripe/Ziina settlement makes no extra debit',async()=>{
 const store=memoryStore(3),stripe=await setup(store,'stripe'),ziina=await setup(store,'ziina');
 const cod=handler(()=>store);
 const rs=await Promise.all([stripe.run(),stripe.run(),ziina.run(),ziina.run(),cod(http('/cod/orders',request()),env)]);
 assert.equal(rs[4].status,201);assert.equal(store.rows.get('products/p1').data.stock,0);
 assert.equal([...store.rows.keys()].filter(p=>p.startsWith('orders/')).length,3);
 assert.equal(rs[0].order.id,rs[1].order.id);assert.equal(rs[2].order.id,rs[3].order.id);
 for(const id of [stripe.snapshot.orderId,ziina.snapshot.orderId]){
  assert.equal(store.rows.get('orders/'+id).data.paymentStatus,'paid');assert.deepEqual(store.rows.get('orders/'+id).data.stockDebits,{p1:1});
 }
});
test('Stripe, Ziina and COD race for last unit: one debit; paid shortages are recorded for review',async()=>{
 const store=memoryStore(1),stripe=await setup(store,'stripe'),ziina=await setup(store,'ziina');
 const rs=await Promise.all([stripe.run(),ziina.run(),handler(()=>store)(http('/cod/orders',request()),env)]);
 assert.equal(store.rows.get('products/p1').data.stock,0);
 const orders=[...store.rows.entries()].filter(([k])=>k.startsWith('orders/')).map(([,v])=>v.data);
 assert.equal(orders.reduce((n,o)=>n+(o.stockDebits.p1||0),0),1);
 assert.equal(orders.filter(o=>o.paymentStatus==='paid').length,2);
 for(const o of orders.filter(o=>o.inventoryStatus==='needs_review'))assert.deepEqual(o.stockDebits,{});
 assert.ok([201,409].includes(rs[2].status));
});
test('unpaid, live, amount/currency/binding mismatch reject both providers without writes',async()=>{
 for(const provider of ['stripe','ziina']){
  const store=memoryStore(),s=await setup(store,provider),before=store.rows.size;
  const changes=provider==='stripe'?[{status:'processing'},{livemode:true},{amount:1},{amount_received:1},{currency:'usd'},{metadata:{}},{id:'pi_other'}]:[{status:'pending'},{test:false},{amount:1},{currency_code:'USD'},{tip_amount:1},{vat_amount:1},{account_id:'other'},{operation_id:'other'},{id:'other'}];
  for(const patch of changes)await assert.rejects(settle({env,store,checkoutId:s.snapshot.checkoutId,provider,fetchPayment:async()=>({...s.payment,...patch})}));
  assert.equal(store.rows.size,before);assert.equal(store.rows.get('products/p1').data.stock,5);
 }
});
test('same payment cannot back a second checkout or order',async()=>{
 const store=memoryStore(),z=await setup(store,'ziina');await z.run();
 const draft=await pricedSnapshot(store,request(),'ziina');const second=await bindPayment(store,draft,z.payment);
 await assert.rejects(settle({env,store,checkoutId:second.checkoutId,provider:'ziina',fetchPayment:async()=>z.payment}),/existing_payment_conflict/);
 assert.equal(store.rows.get('products/p1').data.stock,4);
});
test('both paid provider receipts use guest route; wrong receipt rejected and PII stays hidden',async()=>{
 const store=memoryStore();
 for(const provider of ['stripe','ziina']){
  const s=await setup(store,provider),r=await s.run(),token=await receipt(env.GUEST_RECEIPT_SECRET,r.order.id,s.snapshot.checkoutId);
  const res=await handler(()=>store)(http('/guest/orders/'+r.order.id,null,{Authorization:'Bearer '+token}),env);
  assert.equal(res.status,200);const text=await res.text();assert.ok(text.includes('paid'));
  for(const field of ['phone','customer','editToken','accessKey'])assert.ok(!text.includes(field));
 }
});
test('provider error and ambiguous commit failure safely retry without partial documents or duplicate debit',async()=>{
 const store=memoryStore(),s=await setup(store,'stripe');
 await assert.rejects(settle({env,store,checkoutId:s.snapshot.checkoutId,provider:'stripe',fetchPayment:async()=>{throw new Error('unavailable');}}));
 assert.equal(store.rows.get('products/p1').data.stock,5);
 const commit=store.commit;let first=true;store.commit=async w=>{await commit(w);if(first){first=false;throw new Error('lost response');}};
 await assert.rejects(s.run());assert.equal((await s.run()).replay,true);assert.equal(store.rows.get('products/p1').data.stock,4);
});
test('missing Ziina key, Stripe live key, provider redirects fail closed',async()=>{
 const store=memoryStore();
 for(const provider of ['stripe','ziina']){
  const s=await setup(store,provider);s.snapshot.verificationEvidence='provider_api';let calls=0;
  await assert.rejects(retrievePayment({STRIPE_SECRET_KEY:'sk_live_bad'},s.snapshot,async()=>{calls++;}),/key_required/);assert.equal(calls,0);
  await assert.rejects(retrievePayment({STRIPE_SECRET_KEY:'sk_test_example',ZIINA_TEST_API_KEY:'test'},s.snapshot,async(url,opts)=>{assert.equal(opts.redirect,'manual');return new Response('',{status:302});}),/provider_verification_unavailable/);
 }
});
test('production project or storage root cannot be used by shared settlement',async()=>{
 const store=memoryStore(),s=await setup(store,'stripe');
 await assert.rejects(settle({env:{...env,STRIPE_TEST_PROJECT_ID:'kandorty-9378a'},store,checkoutId:s.snapshot.checkoutId,provider:'stripe'}),/isolated_test_project_required/);
 await assert.rejects(settle({env,store:{...store,root:'projects/kandorty-9378a/databases/(default)/documents'},checkoutId:s.snapshot.checkoutId,provider:'stripe'}),/isolated_test_project_required/);
});
test('finalize API refuses client paid evidence and unknown checkout tokens',async()=>{
 const store=memoryStore(),run=handler(()=>store);
 assert.equal((await run(http('/payments/stripe/finalize',{checkoutToken:'c'.repeat(64),paymentStatus:'paid'}),env)).status,400);
 assert.equal((await run(http('/payments/stripe/finalize',{checkoutToken:'c'.repeat(64)}),env)).status,404);
});
