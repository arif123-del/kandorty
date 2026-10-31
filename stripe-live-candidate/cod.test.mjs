import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareCodOrder,normalizeCodRequest,CodFault} from './cod.mjs';
const when='2026-10-27T15:03:00.000Z',ver='2026-10-27T15:02:00.000001Z';
const sha=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');
async function fixture(){
 const request={
  checkoutToken:'a'.repeat(64),
  payment:'cod',
  customer:{name:' Test Customer ',phone:'+971 50 123 4567',city:'Dubai',location:'Office building'},
  items:[{id:'dressA',qty:1,imageIndex:0},{id:'dressA',qty:2,imageIndex:1},{id:'scarfB',qty:1}],
  note:'Hello'
 };
 const orderId='KD-12345678';
 return {
  request,orderId,editToken:'c'.repeat(48),
  accessKey:await sha(orderId+'|'+request.customer.phone.replace(/\D/g,'')),
  nowISO:when,projectId:'kandorty-production-shape',
  products:{
   dressA:{data:{stock:5,totalStock:10,price:10,nameAr:'Dress',active:true,images:['https://cdn.test/a','https://cdn.test/b']},updateTime:ver},
   scarfB:{data:{stock:4,price:12.5,nameAr:'Scarf',active:true},updateTime:ver}
  }
 };
}
const run=async patch=>prepareCodOrder({...await fixture(),...patch});
async function fault(patch,code){await assert.rejects(run(patch),e=>e instanceof CodFault&&e.code===code);}
test('COD computes catalog prices and AED 25 shipping; payment always unpaid',async()=>{
 const p=await run();
 assert.equal(p.order.payment,'cod');
 assert.equal(p.order.paymentStatus,'unpaid');
 assert.equal(p.order.subtotal,42.5);
 assert.equal(p.order.deliveryFee,25);
 assert.equal(p.order.total,67.5);
 assert.equal(p.order.customerName,'Test Customer');
 assert.equal(p.order.editToken,'c'.repeat(48));
 assert.equal(p.order.customerUid,undefined);
 assert.deepEqual(p.stockDebits,{dressA:3,scarfB:1});
});
test('atomic Firestore creates intent+order+tracking+edit/access and stock with version preconditions',async()=>{
 const p=await run();
 assert.equal(p.replay,false);
 assert.equal(p.writes.length,7);
 assert.deepEqual(p.writes.map(x=>x.update.name.split('/documents/')[1].split('/')[0]),
 ['cod_checkout_intents','orders','tracking','order_edits','order_access','products','products']);
 for(const w of p.writes.slice(0,5))assert.deepEqual(w.currentDocument,{exists:false});
 for(const w of p.writes.slice(5))assert.deepEqual(w.currentDocument,{updateTime:ver});
 assert.equal(p.writes[5].update.fields.stock.integerValue,'2');
 assert.equal(p.writes[6].update.fields.stock.integerValue,'3');
 assert.deepEqual(p.writes[5].updateMask.fieldPaths,['stock','totalStock','updatedAt']);
});
test('stable checkout id from secret token; same request only replays matching committed intent and order',async()=>{
 const f=await fixture();
 const p=await prepareCodOrder(f);
 assert.equal(p.checkoutId,await sha(f.request.checkoutToken));
 const intent={
  checkoutId:p.checkoutId,
  fingerprint:await sha(JSON.stringify(normalizeCodRequest(f.request))),
  orderId:p.order.id,fulfilled:true
 };
 const replay=await run({existingIntent:intent,existingOrder:p.order});
 assert.deepEqual(replay.writes,[]);
 assert.equal(replay.replay,true);
});
test('changed request with same checkout token cannot replay another order',async()=>{
 const f=await fixture(),p=await prepareCodOrder(f);
 const intent={checkoutId:p.checkoutId,fingerprint:await sha(JSON.stringify(normalizeCodRequest(f.request))),
  orderId:p.order.id,fulfilled:true};
 f.request.items[0].qty=2;
 await assert.rejects(prepareCodOrder({...f,existingIntent:intent,existingOrder:p.order}),/checkout_conflict/);
});
test('half existing commit or reused ID is an error; never repeat a stock debit',async()=>{
 const f=await fixture(),p=await prepareCodOrder(f);
 const intent={checkoutId:p.checkoutId,fingerprint:await sha(JSON.stringify(normalizeCodRequest(f.request))),
  orderId:p.order.id,fulfilled:true};
 await fault({existingIntent:intent},'partial_existing_order');
 await fault({existingOrder:p.order},'partial_existing_order');
});
test('fake payment status, amount and UID injected by user are rejected',async()=>{
 const f=await fixture();
 await fault({request:{...f.request,paymentStatus:'paid'}},'unsupported_client_fields');
 await fault({request:{...f.request,total:0.01}},'unsupported_client_fields');
 await fault({request:{...f.request,customerUid:'attacker'}},'unsupported_client_fields');
 await fault({request:{...f.request,payment:'card'}},'invalid_payment_mode');
});
test('forged per-item prices or stock claims cannot reach server',async()=>{
 const f=await fixture();
 f.request.items[0]={...f.request.items[0],price:0.01};
 await assert.rejects(prepareCodOrder(f),/invalid_items/);
});
test('sold out and nonexistent products fail with NO write plan',async()=>{
 const f=await fixture();f.products.dressA.data.stock=2;
 await assert.rejects(prepareCodOrder(f),/insufficient_stock/);
 const g=await fixture();delete g.products.dressA;
 await assert.rejects(prepareCodOrder(g),/unavailable_product/);
 const h=await fixture();h.products.dressA.data.active=false;
 await assert.rejects(prepareCodOrder(h),/unavailable_product/);
});
test('multiple variants of same product aggregate all quantities in one debit',async()=>{
 const p=await run();
 assert.equal(p.order.items.filter(i=>i.id==='dressA').length,2);
 assert.equal(p.stockDebits.dressA,3);
});
test('unmanaged product stock remains untouched, managed stock decrements only once',async()=>{
 const f=await fixture();delete f.products.scarfB.data.stock;
 const p=await prepareCodOrder(f);
 assert.deepEqual(p.stockDebits,{dressA:3});
 assert.equal(p.writes.length,6);
});
test('client cannot claim another phone account identity',async()=>{
 await fault({verifiedIdentity:{uid:'anotherUser',phoneNumber:'+971501234568'}},'unverified_customer_identity');
 const p=await run({verifiedIdentity:{uid:'verified1',phoneNumber:'+971501234567'}});
 assert.equal(p.order.customerUid,'verified1');
 assert.equal(p.order.authPhone,'+971501234567');
});
test('missing product version prevents unsafe inventory changes',async()=>{
 const f=await fixture();f.products.dressA.updateTime='';
 await assert.rejects(prepareCodOrder(f),/missing_product_version/);
});
test('no client-side unverified arbitrary access key accepted',async()=>{
 await fault({accessKey:'d'.repeat(64)},'invalid_server_access_key');
});
test('wrong note size or quantity cannot create an order',async()=>{
 const f=await fixture();f.request.note='n'.repeat(16);
 await assert.rejects(prepareCodOrder(f),/invalid_note/);
 const g=await fixture();g.request.items[0].qty=0;
 await assert.rejects(prepareCodOrder(g),/invalid_quantity/);
});
test('duplicate same image rows combine; different images remain separate',()=>{
 const n=normalizeCodRequest({checkoutToken:'b'.repeat(64),customer:{name:'A',phone:'123456789',city:'Dubai',location:'Street'},
 items:[{id:'abc',qty:2,imageIndex:0},{id:'abc',qty:1,imageIndex:0},{id:'abc',qty:1,imageIndex:1}]});
 assert.equal(n.items.length,2);
 assert.deepEqual(n.items.map(x=>x.qty),[3,1]);
});
test('test-project cannot accidentally become production COD target',async()=>{
 await fault({projectId:'kandorty-stripe-test-5f8af'},'invalid_project');
});
