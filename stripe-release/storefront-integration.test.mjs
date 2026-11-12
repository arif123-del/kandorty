import {test} from 'node:test';import assert from 'node:assert/strict';
import {createStorefrontStripe} from './storefront-integration.mjs';
function setup(){const m=new Map(),calls=[],render=[],redirects=[];let paid=false;const storage={getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};const flow=createStorefrontStripe({storage,redirect:x=>redirects.push(x),confirmed:o=>render.push(o),getTurnstileToken:async()=>'proof',net:async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body)});return Response.json(url.endsWith('/checkout/status')?{paid,...(paid?{order:{id:'KD-12345678',paymentStatus:'paid',inventoryStatus:'debited'}}:{})}:{receipt:'signed',orderId:'KD-12345678',url:'https://checkout.stripe.com/c/pay/cs_live_fixture'});}});return {flow,calls,render,redirects,m,pay:()=>paid=true};}
test('storefront saves receipt before redirect, never registers order on unpaid return, archives after server confirmation',async()=>{
 const f=setup();await f.flow.start({customer:{name:'TEST'},items:[{id:'p1',qty:1,price:0}],notes:''});assert.equal(f.redirects.length,1);assert.ok(f.m.get('kandorty_server_stripe_v1'));assert.equal(f.calls[0].body.turnstileToken,'proof');assert.equal(f.calls[0].body.items[0].price,undefined);
 assert.deepEqual(await f.flow.finish(),{paid:false});assert.equal(f.render.length,0);f.pay();await f.flow.finish();assert.equal(f.render.length,1);assert.equal(f.m.get('kandorty_server_stripe_v1'),undefined);assert.equal(f.flow.ownsReceipt('KD-12345678'),true);assert.equal((await f.flow.track('KD-12345678')).id,'KD-12345678');await assert.rejects(f.flow.track('KD-00000000'),/missing_checkout_receipt/);
});


test('guest COD retains server receipt and authorizes tracking and cancellation without browser prices',async()=>{
 const m=new Map(),calls=[],render=[];
 const storage={
  getItem:k=>m.get(k)||null,
  setItem:(k,v)=>m.set(k,v),
  removeItem:k=>m.delete(k)
 };
 const order={id:'KD-30204050',payment:'cod',paymentStatus:'unpaid',status:'new',
  total:35,deliveryFee:25,items:[{id:'p1',name:'TEST ONLY',qty:1,price:10}]};
 const receipt='synthetic-server-cod-receipt',manageToken='synthetic-server-cod-manage';
 const flow=createStorefrontStripe({
  storage,getTurnstileToken:async()=>'synthetic-turnstile-pass',
  redirect:()=>assert.fail('COD must never redirect to hosted card payment'),
  confirmed:o=>render.push(o),
  net:async(url,opts)=>{
   const body=JSON.parse(opts.body);calls.push({url,body,auth:opts.headers.Authorization||null});
   if(url.endsWith('/cod/orders'))return Response.json({order,receipt,manageToken});
   if(url.endsWith('/checkout/status'))return Response.json({registered:true,paid:false,order});
   if(url.endsWith('/orders/cancel'))return Response.json({order:{...order,status:'cancelled'}});
   throw Error('unexpected_mock_route');
  }
 });
 const r=await flow.startCod({
  customer:{name:'SYNTHETIC',phone:'+971500000000',city:'Dubai',location:'TEST'},
  items:[{id:'p1',qty:1,imageIndex:0,price:0,stock:9000}],
  notes:''
 });
 assert.equal(r.order.id,order.id);
 assert.deepEqual(render,[order],'COD confirmation must render only server response');
 assert.equal(calls.length,1);
 assert.ok(calls[0].url.endsWith('/cod/orders'));
 assert.equal(calls[0].body.items[0].price,undefined,'never send price from untrusted cart');
 assert.equal(calls[0].body.items[0].stock,undefined,'never send stock from untrusted cart');
 assert.equal(calls[0].body.turnstileToken,'synthetic-turnstile-pass');
 assert.equal(m.get('kandorty_stripe_receipt_'+order.id),receipt);
 assert.equal(m.get('kandorty_order_manage_'+order.id),manageToken);
 assert.equal(m.has('kandorty_server_stripe_v1_cod'),false);
 assert.equal(flow.ownsReceipt(order.id),true);
 assert.deepEqual(await flow.track(order.id),order,'guest tracking must read server status');
 assert.equal(calls[1].auth,'Bearer '+receipt);
 await assert.rejects(flow.track('KD-99999999'),/missing_checkout_receipt/);
 const cancelled=await flow.cancel(order.id);
 assert.equal(cancelled.order.status,'cancelled');
 assert.equal(calls[2].auth,'Bearer '+receipt);
 assert.deepEqual(calls[2].body,{orderId:order.id,manageToken});
});

test('unknown legacy receipt cannot be tracked or cancelled by new server adapter',async()=>{
 const storage={getItem:()=>null,setItem:()=>assert.fail('no writes')};
 let networkCalls=0;
 const flow=createStorefrontStripe({
  storage,getTurnstileToken:async()=>'proof',redirect:()=>{},
  confirmed:()=>{},
  net:async()=>{networkCalls++;throw Error('must not use server without receipt');}
 });
 assert.equal(flow.ownsReceipt('KD-09876543'),false);
 await assert.rejects(flow.track('KD-09876543'),/missing_checkout_receipt/);
 await assert.rejects(flow.cancel('KD-09876543'),/missing_manage_authority/);
 assert.equal(networkCalls,0,'no server call when guest has no verified order receipt');
});
