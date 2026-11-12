import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stripeCheckoutClient} from './browser-client.mjs';
test('browser return reads server receipt, never trusts URL paid/session flags or supplied prices',async()=>{
 const saved=new Map(),calls=[];
 const storage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
 const c=stripeCheckoutClient({endpoint:'https://kandorty-stripe-release.aliyajan200011.workers.dev',storage,net:async(url,opts)=>{
  calls.push({url,opts});return Response.json(url.endsWith('/checkout/status')?{paid:true,order:{id:'KD-12345678',paymentStatus:'paid'}}:{orderId:'KD-12345678',receipt:'signed-receipt',url:'https://checkout.stripe.com/test'});
 }});
 const request={customer:{name:'TEST',phone:'000000',city:'TEST',location:'TEST'},items:[{id:'p1',qty:1,price:0,paymentStatus:'paid'}]};
 await c.start(request);await c.start(request);
 const a=JSON.parse(calls[0].opts.body),b=JSON.parse(calls[1].opts.body);assert.equal(a.checkoutToken,b.checkoutToken);assert.deepEqual(a.items,[{id:'p1',qty:1,imageIndex:0}]);
 const status=await c.status();assert.equal(calls[2].opts.headers.Authorization,'Bearer signed-receipt');assert.deepEqual(JSON.parse(calls[2].opts.body),{});
 assert.throws(()=>c.archiveConfirmed({id:'KD-12345678',paymentStatus:'unpaid'}));
 c.archiveConfirmed(status.order);assert.equal(saved.get('kandorty_stripe_receipt_KD-12345678'),'signed-receipt');
});
test('changed cart does not silently replace a pending payment receipt',async()=>{
 const state=new Map();const storage={getItem:k=>state.get(k),setItem:(k,v)=>state.set(k,v)};
 const c=stripeCheckoutClient({endpoint:'https://kandorty-stripe-release.aliyajan200011.workers.dev',storage,net:async()=>Response.json({receipt:'receipt',orderId:'KD-12345678'})});
 await c.start({customer:{},items:[{id:'p1',qty:1}]});
 await assert.rejects(c.start({customer:{},items:[{id:'p1',qty:2}]}),/pending_checkout_changed/);
});
test('deployed test browser adapter is identical to reviewed client',async()=>{
 const fs=await import('node:fs/promises');assert.equal(await fs.readFile(new URL('./public/browser-client.mjs',import.meta.url),'utf8'),await fs.readFile(new URL('./browser-client.mjs',import.meta.url),'utf8'));
});

test('Stage 5 COD rejects malformed server acknowledgements without losing retry authority',async()=>{
 const cases=[
  {order:{id:'KD-12345678',payment:'card'},receipt:'signed',manageToken:'manage'},
  {order:{id:'KD-12345678',payment:'cod'},receipt:'',manageToken:'manage'},
  {order:{id:'KD-12345678',payment:'cod'},receipt:'signed',manageToken:''},
  {order:{id:'invalid-order-id',payment:'cod'},receipt:'signed',manageToken:'manage'},
  {receipt:'signed',manageToken:'manage'}
 ];
 for(const reply of cases){
  const data=new Map(),calls=[];
  const storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  const client=stripeCheckoutClient({endpoint:'https://kandorty-stripe-release-test.aliyajan200011.workers.dev',storage,
   net:async(url,opts)=>{calls.push(JSON.parse(opts.body));return Response.json(reply);}
  });
  await assert.rejects(client.startCod({customer:{name:'TEST'},items:[{id:'p',qty:1}]}),/invalid_cod_response/);
  assert.ok(data.get('kandorty_server_stripe_v1_cod'),'keep the same retry token');
  assert.equal(calls.length,1);
  assert.equal(data.has('kandorty_stripe_receipt_KD-12345678'),false);
  assert.equal(data.has('kandorty_order_manage_KD-12345678'),false);
  assert.equal(data.has('kandorty_stripe_receipt_undefined'),false);
 }
});

test('Stage 5 card checkout rejects missing signed receipt or server order ID before redirect',async()=>{
 for(const reply of [{orderId:'KD-12345678',receipt:''},{orderId:'wrong',receipt:'signed'},{receipt:'signed'}]){
  const data=new Map(),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  const client=stripeCheckoutClient({endpoint:'https://kandorty-stripe-release-test.aliyajan200011.workers.dev',storage,
   net:async()=>Response.json(reply)});
  await assert.rejects(client.start({customer:{},items:[{id:'p',qty:1}]}),/invalid_checkout_response/);
  const pending=JSON.parse(data.get('kandorty_server_stripe_v1'));
  assert.ok(pending.checkoutToken,'retain idempotent retry');
  assert.equal(pending.receipt,undefined,'do not persist an unverified receipt');
 }
});

test('Stage 5 cannot display cancellation of a different server order as success',async()=>{
 const data=new Map([
  ['kandorty_stripe_receipt_KD-12345678','signed'],
  ['kandorty_order_manage_KD-12345678','manage']
 ]);
 const storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 const c=stripeCheckoutClient({endpoint:'https://kandorty-stripe-release-test.aliyajan200011.workers.dev',storage,
  net:async()=>Response.json({order:{id:'KD-87654321',status:'cancelled'}})});
 await assert.rejects(c.cancel('KD-12345678'),/invalid_cancellation_response/);
 assert.equal(data.get('kandorty_stripe_receipt_KD-12345678'),'signed');
});
