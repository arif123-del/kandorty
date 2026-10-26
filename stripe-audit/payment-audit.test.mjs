import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from './deployed-worker.mjs';
const env={STRIPE_SECRET_KEY:'sk_test_dummy_not_a_credential'};
const origin='https://kandorty.online';
function req(path,body,withOrigin=true){return new Request('https://worker.invalid'+path,{method:'POST',headers:{'Content-Type':'application/json',...(withOrigin?{Origin:origin}:{})},body:JSON.stringify(body)});}
const product={fields:{price:{integerValue:'100'},stock:{integerValue:'10'},active:{booleanValue:true}}};
function mock(){
 const calls=[];
 globalThis.fetch=async(url,opts={})=>{
  calls.push({url:String(url),...opts});
  if(String(url).startsWith('https://firestore.googleapis.com/'))return Response.json(product);
  return Response.json({id:'cs_test_fixture',url:'https://checkout.stripe.com/fixture',payment_status:'paid',status:'complete',currency:'aed',amount_total:12500,client_reference_id:'KD-audit123',livemode:false});
 };
 return calls;
}
// Characterization tests: passing means the weakness was reproduced, NOT fixed.
test('REPRODUCED: webhook without a browser Origin is rejected',async()=>{
 mock();const r=await worker.fetch(req('/webhook',{type:'checkout.session.completed'},false),env);
 assert.equal(r.status,403);
});
test('REPRODUCED: negative quantity silently becomes a payable quantity of one',async()=>{
 const calls=mock();const r=await worker.fetch(req('/create-checkout-session',{orderId:'KD-audit123',items:[{id:'p1',qty:-3}]}),env);
 assert.equal(r.status,200);const p=new URLSearchParams(calls.at(-1).body);
 assert.equal(p.get('line_items[0][quantity]'),'1');
});
test('REPRODUCED: repeated creation has no Stripe idempotency header',async()=>{
 const calls=mock();for(let i=0;i<2;i++)await worker.fetch(req('/create-checkout-session',{orderId:'KD-audit123',items:[{id:'p1',qty:1}]}),env);
 const writes=calls.filter(x=>x.method==='POST');assert.equal(writes.length,2);
 assert.ok(writes.every(x=>!new Headers(x.headers).has('Idempotency-Key')));
});
test('REPRODUCED: no sandbox guard rejects a Live key',async()=>{
 mock();const r=await worker.fetch(req('/create-checkout-session',{orderId:'KD-audit123',items:[{id:'p1',qty:1}]}),{STRIPE_SECRET_KEY:'sk_live_dummy_not_a_credential'});
 assert.equal(r.status,200);
});
test('REPRODUCED: paid verification performs no order database write',async()=>{
 const calls=mock();const r=await worker.fetch(req('/verify-checkout-session',{session_id:'cs_test_fixture'}),env);
 assert.equal((await r.json()).payment_status,'paid');assert.equal(calls.length,1);
 assert.match(calls[0].url,/api.stripe.com/);assert.equal(calls[0].method,undefined);
});
test('CONFIRMED: product price is server-read and delivery is 2500 fils exactly once',async()=>{
 const calls=mock();await worker.fetch(req('/create-checkout-session',{orderId:'KD-audit123',items:[{id:'p1',qty:2,price:1}]}),env);
 const p=new URLSearchParams(calls.at(-1).body);
 assert.equal(p.get('line_items[0][price_data][unit_amount]'),'10000');
 assert.equal(p.get('line_items[1][price_data][unit_amount]'),'2500');
 assert.equal(p.get('line_items[1][quantity]'),'1');
});
