import {test} from 'node:test';
import assert from 'node:assert/strict';
import {preparePaidFulfillment,validatePaidSession,CheckoutFault} from './fulfillment.mjs';

const when='2026-10-27T12:00:00.000Z';
const version='2026-10-27T11:59:00.000000Z';
function fixture(){
 const snapshot={
  checkoutId:'b'.repeat(64),orderId:'KD-12345678',sessionId:'cs_live_example1',
  createdAt:'2026-10-27T11:30:00.000Z',note:'TEST',totalFils:7500,
  customer:{name:'TEST USER',phone:'+971501234567',city:'Dubai',location:'TEST ADDRESS'},
  items:[
   {id:'p1',qty:2,unitAmount:1000,imageIndex:0,name:'Dress'},
   {id:'p1',qty:1,unitAmount:1000,imageIndex:1,name:'Dress'},
   {id:'p2',qty:1,unitAmount:2000,imageIndex:0,name:'Abaya'}
  ]
 };
 const session={id:snapshot.sessionId,livemode:true,mode:'payment',
  status:'complete',payment_status:'paid',currency:'aed',amount_total:7500,
  client_reference_id:snapshot.orderId,
  metadata:{checkout_id:snapshot.checkoutId,order_id:snapshot.orderId}};
 const products={
  p1:{data:{stock:4,totalStock:5,nameAr:'Dress'},updateTime:version},
  p2:{data:{stock:2,totalStock:2,nameAr:'Abaya'},updateTime:version}
 };
 return {session,snapshot,products,projectId:'kandorty-production-fixture',snapshotVersion:version,
  editToken:'c'.repeat(48),accessKey:'d'.repeat(64),nowISO:when};
}
const plan=(patch={})=>preparePaidFulfillment({...fixture(),...patch});
function expectFault(patch,code){
 assert.throws(()=>plan(patch),err=>err instanceof CheckoutFault&&err.code===code);
}
test('LIVE paid validated Stripe amount exactly; delivery charged once',()=>{
 const p=plan();
 assert.equal(p.replay,false);
 assert.equal(p.order.total,75);
 assert.equal(p.order.subtotal,50);
 assert.equal(p.order.deliveryFee,25);
 assert.equal(p.order.paymentStatus,'paid');
 assert.equal(p.order.status,'new');
 assert.equal(p.order.inventoryStatus,'debited');
});
test('atomic commit includes exactly one order, tracking, edit rights, marker, stock updates',()=>{
 const p=plan();
 assert.equal(p.writes.length,7);
 assert.deepEqual(p.writes.map(x=>x.update.name.split('/documents/')[1].split('/')[0]),
  ['orders','tracking','order_edits','order_access','stripe_checkout_sessions','products','products']);
 for(let i=0;i<4;i++)assert.deepEqual(p.writes[i].currentDocument,{exists:false});
 assert.deepEqual(p.writes[4].currentDocument,{updateTime:version});
 assert.deepEqual(p.writes[5].currentDocument,{updateTime:version});
 assert.deepEqual(p.writes[6].currentDocument,{updateTime:version});
 assert.deepEqual(p.writes[5].updateMask.fieldPaths,['stock','totalStock','updatedAt']);
 assert.equal(p.writes[5].update.fields.stock.integerValue,'1');
 assert.equal(p.writes[6].update.fields.stock.integerValue,'1');
 assert.deepEqual(p.stockDebits,{p1:3,p2:1});
});
test('replayed webhook creates no writes or repeated stock decrement',()=>{
 const first=plan(),existingOrder={...first.order};
 const next=plan({existingOrder});assert.equal(next.replay,true);
 assert.deepEqual(next.writes,[]);assert.equal(next.order.id,first.order.id);
});
test('replay with different Stripe session or unpaid order fails closed',()=>{
 const f=fixture();
 expectFault({existingOrder:{id:f.snapshot.orderId,stripeSessionId:'cs_live_else',paymentStatus:'paid'}},'existing_order_conflict');
 expectFault({existingOrder:{id:f.snapshot.orderId,stripeSessionId:f.session.id,paymentStatus:'unpaid'}},'existing_order_conflict');
});
test('two product images aggregate to one inventory debit; never silently drop unknown product',()=>{
 const p=plan();
 assert.equal(p.stockDebits.p1,3);
 const f=fixture();delete f.products.p2;
 const result=preparePaidFulfillment(f);
 assert.equal(result.inventoryStatus,'needs_review');
 assert.equal(result.writes.length,5);
 assert.deepEqual(result.order.stockDebits,{});
 assert.equal(result.order.stockDebited,false);
 assert.equal(result.order.paymentStatus,'paid');
});
test('out of stock after paid Checkout records paid needs_review without inventory changes',()=>{
 const f=fixture();f.products.p1.data.stock=2;
 const p=preparePaidFulfillment(f);
 assert.equal(p.inventoryStatus,'needs_review');
 assert.equal(p.writes.length,5);
 assert.equal(p.order.paymentStatus,'paid');
 assert.equal(p.order.stockDebited,false);
});
test('invalid managed stock state does not overdraw and still records paid review',()=>{
 const f=fixture();f.products.p1.data.stock=-1;
 const p=preparePaidFulfillment(f);
 assert.equal(p.inventoryStatus,'needs_review');
});
test('unmanaged stock never changes, managed debits are recorded accurately',()=>{
 const f=fixture();delete f.products.p2.data.stock;
 const p=preparePaidFulfillment(f);
 assert.deepEqual(p.order.stockDebits,{p1:3});
 assert.equal(p.writes.length,6);
});
test('wrong amount, currency, mode, test checkout or replay of unpaid checkout rejected',()=>{
 const f=fixture();
 for(const [name,val,code] of [
  ['amount_total',7501,'paid_amount_mismatch'],
  ['currency','usd','paid_amount_mismatch'],
  ['livemode',false,'payment_not_verified'],
  ['payment_status','unpaid','payment_not_verified'],
  ['mode','setup','payment_not_verified'],
  ['status','open','payment_not_verified'],
  ['id','cs_test_nope','not_live_session'],
  ['client_reference_id','KD-00000001','checkout_binding_mismatch']
 ])expectFault({session:{...f.session,[name]:val}},code);
});
test('client-changed cart prices or total fail frozen snapshot checks',()=>{
 const f=fixture();
 expectFault({snapshot:{...f.snapshot,totalFils:1000}},'paid_amount_mismatch');
 expectFault({snapshot:{...f.snapshot,items:[{...f.snapshot.items[0],unitAmount:500},...f.snapshot.items.slice(1)]}},'snapshot_total_mismatch');
});
test('do not copy unverified client UID into order ownership',()=>{
 const f=fixture();f.snapshot.customerUid='untrusted-attacker-id';
 let p=preparePaidFulfillment(f);
 assert.equal(Object.hasOwn(p.order,'customerUid'),false);
 f.snapshot.verifiedCustomerUid='verifiedAccount1';f.snapshot.customerUidVerifiedByServer=true;
 p=preparePaidFulfillment(f);
 assert.equal(p.order.customerUid,'verifiedAccount1');
});
test('missing precondition timestamps fail before a commit is constructed',()=>{
 const f=fixture();
 expectFault({snapshotVersion:''},'missing_snapshot_version');
 f.products.p1.updateTime='';
 assert.throws(()=>preparePaidFulfillment(f),/missing_product_version/);
});
test('duplicate cart variant or quantity overflow fails before any stock mutation',()=>{
 const f=fixture();f.snapshot.items.push({...f.snapshot.items[0]});
 f.snapshot.totalFils=9500;
 assert.throws(()=>preparePaidFulfillment({...f,session:{...f.session,amount_total:9500}}),/duplicate_line_item/);
});
test('TEST project cannot be accidentally used as LIVE destination',()=>{
 expectFault({projectId:'kandorty-stripe-test-5f8af'},'test_project_not_live');
});
