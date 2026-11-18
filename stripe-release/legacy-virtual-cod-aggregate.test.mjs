import {test} from 'node:test';
import assert from 'node:assert/strict';
import {aggregateOwnerDeclaredCodRisk as audit,BASELINE}
  from './legacy-virtual-cod-aggregate.mjs';

// All 99 documents here are synthetic. No Firebase credentials or network.
function fixture(){
  const orders=Array.from({length:99},(_,i)=>({
    id:'KD-'+String(i).padStart(8,'0'),
    data:{status:'new',payment:i>=18&&i<30?'card':'cod',
      privatePhone:'SYNTHETIC_PHONE_NEVER_RETURN',items:[{qty:3}]}
  }));
  for(let i=0;i<4;i++)orders[i].data.status=i<2?'shipping':'delivered';
  for(let i=4;i<7;i++)orders[i].data.customerEdit={cancelRequestedAt:'2026-11-11T10:00:00Z'};
  for(let i=7;i<18;i++)orders[i].data.status='cancelled';
  for(let i=7;i<10;i++)orders[i].data.cancelStockRestoredAt='2026-11-11T10:00:00Z';
  const tracking=orders.map(({id,data})=>({id,data:{status:data.status}}));
  return {orders,tracking};
}
test('99 synthetic docs, 18 distinct COD risk cases with 21 overlapping flags',()=>{
  const {orders,tracking}=fixture();
  const before=structuredClone({orders,tracking});
  const r=audit(orders,tracking);
  assert.equal(r.inspectedOrders,99);
  assert.equal(r.currentFlaggedOrders,18);
  assert.equal(r.currentFlaggedCodLabels,18);
  assert.equal(r.currentFlaggedCardLabels,0);
  assert.equal(r.trackingStatusConsistent,true);
  assert.deepEqual(r.currentCategoryCounts,BASELINE.categories);
  assert.equal(r.aggregateResemblesEncryptedBaseline,true);
  assert.equal(r.currentAllFlaggedLabeledCod,true);
  assert.equal(r.same18IndividualOrdersVerified,false);
  assert.equal(r.stage4ReleaseAuthorized,false);
  assert.deepEqual({orders,tracking},before);
});
test('a card label among 18 flagged is not falsely declared all COD',()=>{
  const {orders,tracking}=fixture();
  orders[9].data.payment='card';
  const r=audit(orders,tracking);
  assert.equal(r.currentFlaggedCardLabels,1);
  assert.equal(r.currentFlaggedCodLabels,17);
  assert.equal(r.currentAllFlaggedLabeledCod,false);
  assert.equal(r.aggregateResemblesEncryptedBaseline,true);
  assert.equal(r.customerPaymentsOrRefundsVerified,false);
});
test('unknown payment label is never inferred as COD',()=>{
  const {orders,tracking}=fixture();
  orders[10].data.payment='unknown';
  const r=audit(orders,tracking);
  assert.equal(r.currentFlaggedUnknownPaymentLabels,1);
  assert.equal(r.currentAllFlaggedLabeledCod,false);
});
test('deleted/changed tracking or order count forbids matching an old backup',()=>{
  const base=fixture();
  const lost=audit(base.orders,base.tracking.slice(1));
  assert.equal(lost.aggregateResemblesEncryptedBaseline,false);
  assert.equal(lost.trackingStatusConsistent,false);
  const changed=fixture();
  changed.tracking[0].data.status='cancelled';
  const v=audit(changed.orders,changed.tracking);
  assert.equal(v.aggregateResemblesEncryptedBaseline,false);
  assert.equal(v.trackingStatusConsistent,false);
  assert.equal(v.stage4ReleaseAuthorized,false);
  const plus=fixture();
  plus.orders.push({id:'KD-00000100',data:{status:'new',payment:'cod'}});
  assert.equal(audit(plus.orders,plus.tracking).aggregateResemblesEncryptedBaseline,false);
});
test('matching timestamp locks reduce processing flag count',()=>{
 const f=fixture();
 const a={seconds:1794390000,nanoseconds:1234,isEqual(b){return b.seconds===this.seconds&&b.nanoseconds===this.nanoseconds;}};
 const b={seconds:1794390000,nanoseconds:1234};
 f.orders[0].data.cancellationLockedAt=a;
 f.tracking[0].data.cancellationLockedAt=b;
 const result=audit(f.orders,f.tracking);
 assert.equal(result.currentCategoryCounts.processingLocks,3);
 assert.equal(result.currentFlaggedOrders,17);
 assert.equal(result.stage4ReleaseAuthorized,false);
});
test('unknown, duplicate or malformed identifier fails closed',()=>{
  const {orders,tracking}=fixture();
  assert.throws(()=>audit([...orders,structuredClone(orders[0])],tracking),
    /invalid_orders_record/);
  assert.throws(()=>audit([{id:'../../evil',data:{}}],[]),/invalid_orders_record/);
  assert.throws(()=>audit('orders',[]),/invalid_orders_size/);
});
test('no customer identifiers or credentials leak into returned metrics',()=>{
  const {orders,tracking}=fixture();
  orders[0].data.customerEmail='secret-private-person@example.invalid';
  const result=audit(orders,tracking);
  const text=JSON.stringify(result);
  for(const value of ['KD-00000000','secret-private-person@example.invalid',
    'SYNTHETIC_PHONE_NEVER_RETURN','items','customerEmail']){
    assert.ok(!text.includes(value));
  }
  assert.equal(result.testTransactionStockEffectsVerified,false);
  assert.equal(result.allProductionDataRecoveryVerified,false);
  assert.equal(result.stage4ReleaseAuthorized,false);
});
