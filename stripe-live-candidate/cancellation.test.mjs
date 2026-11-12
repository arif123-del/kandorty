import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePaidCancellationRestock as run} from './cancellation.mjs';
const ver='2026-10-27T11:30:00.000001Z';
function sample(){
 return {
  projectId:'kandorty-prod-fixture',
  nowISO:'2026-10-27T12:00:00.000Z',orderUpdateTime:ver,
  order:{id:'KD-12345678',payment:'card',paymentStatus:'paid',
   status:'cancelled',cancelledBy:'customer',stockDebits:{p1:2,p2:1}},
  products:{p1:{data:{stock:2,totalStock:10},updateTime:ver},
    p2:{data:{stock:7},updateTime:ver}}
 };
}
test('return only stock actually debited by server; marker shares atomic commit',()=>{
 const p=run(sample());
 assert.equal(p.replay,false);
 assert.equal(p.writes.length,3);
 assert.deepEqual(p.restored,{p1:2,p2:1});
 assert.equal(p.writes[0].update.fields.cancelStockRestoredAt.stringValue,'2026-10-27T12:00:00.000Z');
 assert.deepEqual(p.writes[0].currentDocument,{updateTime:ver});
 assert.equal(p.writes[1].update.fields.stock.integerValue,'4');
 assert.equal(p.writes[2].update.fields.stock.integerValue,'8');
 for(const w of p.writes)assert.deepEqual(w.currentDocument,{updateTime:ver});
});
test('an already restored order is idempotent and makes no writes',()=>{
 const f=sample();f.order.cancelStockRestoredAt='2026-10-27T12:00:00.000Z';
 assert.deepEqual(run(f),{replay:true,writes:[],restored:{}});
});
test('review-only paid order with no inventory debits cannot invent stock',()=>{
 const f=sample();f.order.stockDebits={};f.order.stockDebited=false;
 const p=run(f);assert.equal(p.writes.length,1);
 assert.deepEqual(p.restored,{});
});
test('untrusted legacy orders without stockDebits are not automatically restocked',()=>{
 const f=sample();delete f.order.stockDebits;
 assert.throws(()=>run(f),/missing_server_stock_debits/);
});
test('status, actor and paid flag cannot be forged to restock',()=>{
 const f=sample();f.order.status='shipping';
 assert.throws(()=>run(f),/not_customer_canceled/);
 f.order.status='cancelled';f.order.cancelledBy='admin';
 assert.throws(()=>run(f),/not_customer_canceled/);
 f.order.cancelledBy='customer';f.order.paymentStatus='unpaid';
 assert.throws(()=>run(f),/not_paid_card_order/);
});
test('missing product versions and malformed quantities fail closed',()=>{
 const f=sample();delete f.products.p1;
 assert.throws(()=>run(f),/missing_product_version/);
 const f2=sample();f2.order.stockDebits.p1=-1;
 assert.throws(()=>run(f2),/invalid_stock_debit/);
});
test('order conflict preconditions and product version preconditions are required',()=>{
 const f=sample();f.orderUpdateTime='';
 assert.throws(()=>run(f),/missing_order_version/);
});
test('test project never mistaken for production destination',()=>{
 const f=sample();f.projectId='kandorty-stripe-test-5f8af';
 assert.throws(()=>run(f),/test_project_not_live/);
});
