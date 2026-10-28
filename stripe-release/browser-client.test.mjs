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
