// Real Stripe Sandbox PaymentIntent + deployed private Worker + real isolated DB.
import assert from 'node:assert/strict';
import {createStore} from '../cod-staging/firestore.mjs';
import {random} from '../cod-staging/security.mjs';
import {pricedSnapshot,bindPayment} from './snapshot.mjs';
import {request} from './fixtures.mjs';
const env=process.env,store=createStore(env),base='https://kandorty-cod-orders-test.aliyajan200011.workers.dev';
assert.match(env.STRIPE_SECRET_KEY||'',/^sk_test_/);
async function stripe(path,body){
 const r=await fetch('https://api.stripe.com/v1/payment_intents'+path,{method:body?'POST':'GET',redirect:'manual',headers:{Authorization:'Bearer '+env.STRIPE_SECRET_KEY,'Content-Type':'application/x-www-form-urlencoded'},...(body?{body:new URLSearchParams(body)}:{}),signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw new Error('Stripe Sandbox API failed: HTTP '+r.status);return r.json();
}
async function call(path,body,extra={}){
 const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Staging-Key':env.STAGING_ACCESS_SECRET,...extra},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(30000)});
 return {status:r.status,body:await r.json()};
}
const id='joint-real-stripe-'+random(8);
await store.commit([store.write('products/'+id,{price:10,stock:2,totalStock:2,nameAr:'STRIPE SANDBOX TEST ONLY'},{exists:false})]);
const req=request(id),s=await pricedSnapshot(store,req,'stripe');
const p=await stripe('',{amount:String(s.totalFils),currency:'aed','payment_method_types[]':'card','metadata[checkout_id]':s.checkoutId,'metadata[order_id]':s.orderId});
assert.equal(p.livemode,false);await bindPayment(store,s,p);
const unpaid=await call('/payments/stripe/finalize',{checkoutToken:req.checkoutToken});
assert.equal(unpaid.status,409,'unpaid must not fulfill; safe error code='+String(unpaid.body.error||'none'));
assert.equal((await store.get('products/'+id)).data.stock,2);
const paid=await stripe('/'+p.id+'/confirm',{payment_method:'pm_card_visa'});
assert.equal(paid.livemode,false);assert.equal(paid.status,'succeeded');
const results=await Promise.all([call('/payments/stripe/finalize',{checkoutToken:req.checkoutToken}),call('/payments/stripe/finalize',{checkoutToken:req.checkoutToken}),call('/cod/orders',request(id))]);
assert.ok(results.every(r=>[200,201].includes(r.status)),'deployed shared settlement status');
assert.equal(results[0].body.order.id,results[1].body.order.id);assert.equal((await store.get('products/'+id)).data.stock,0);
const order=(await store.get('orders/'+s.orderId)).data;
assert.equal(order.verificationEvidence,'provider_api');assert.equal(order.paymentStatus,'paid');assert.deepEqual(order.stockDebits,{[id]:1});assert.equal(order.total,35);
const guest=await call('/guest/orders/'+s.orderId,null,{Authorization:'Bearer '+results[0].body.receiptToken});
assert.equal(guest.status,200);assert.equal(guest.body.order.paymentStatus,'paid');assert.equal(guest.body.order.customer,undefined);
assert.equal((await call('/payments/stripe/finalize',{checkoutToken:req.checkoutToken})).body.replay,true);
assert.equal((await store.get('products/'+id)).data.stock,0);
console.log('PASS: REAL Stripe Sandbox PaymentIntent (AED 35), unpaid rejection, server API verification, deployed concurrent Stripe/COD shared stock, replay and bound guest tracking.');
console.log('This checks PaymentIntent settlement, not a new hosted Checkout or signed webhook delivery. Existing Stripe Checkout Worker is unchanged.');
