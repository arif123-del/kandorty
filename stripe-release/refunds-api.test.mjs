import {test} from 'node:test';import assert from 'node:assert/strict';import {stripeClient} from './stripe.mjs';
const snapshot={sessionId:'cs_test_fixture',checkoutId:'a'.repeat(64),orderId:'KD-12345678',totalFils:3500};
const session=()=>({id:snapshot.sessionId,livemode:false,client_reference_id:snapshot.orderId,amount_total:3500,currency:'aed',payment_status:'paid',metadata:{checkout_id:snapshot.checkoutId,order_id:snapshot.orderId,integration:'kandorty-stripe-v1'},payment_intent:{id:'pi_fixture',livemode:false,currency:'aed',amount_received:3500}});
test('Stripe refund adapter binds provider, order and currency and distinguishes pending/failed/partial/full without initiating refunds',async()=>{
 let s=session(),refunds=[];const client=stripeClient({live:false,key:'sk_test_fixture'},async(url,opts)=>{assert.equal(opts.method,'GET');assert.equal(opts.redirect,'manual');assert.ok(url.startsWith('https://api.stripe.com/v1/'));return Response.json(url.includes('/refunds?')?{data:refunds,has_more:false}:s);});
 const check=async(status,amount,want)=>{refunds=[{id:'re_fixture',payment_intent:'pi_fixture',currency:'aed',amount,status}];assert.deepEqual(await client.refundState(s.id,snapshot),want);};
 await check('pending',3500,{amount:0,status:'pending'});await check('failed',3500,{amount:0,status:'failed'});await check('succeeded',1000,{amount:1000,status:'partial'});await check('succeeded',3500,{amount:3500,status:'full'});
 refunds[0].currency='usd';await assert.rejects(client.refundState(s.id,snapshot),/refund_binding_mismatch/);refunds=[];
 s.payment_intent.livemode=true;await assert.rejects(client.refundState(s.id,snapshot),/refund_payment_mismatch/);s=session();s.metadata.order_id='KD-00000000';await assert.rejects(client.refundState(s.id,snapshot),/refund_binding_mismatch/);
});
