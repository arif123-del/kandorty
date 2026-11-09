import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planLegacyAdminTransition as plan,LegacyPolicyError} from './legacy-status-policy.mjs';

// Synthetic fixtures ONLY. No Firebase or Stripe credentials, network requests,
// production order data, or actual historical customer records are used.
const at='2026-11-09T07:00:00.000Z',id='KD-12345678';
const fixture=(changes={})=>({
  orderId:id,
  order:{id,status:'new',payment:'cod',paymentStatus:'unverified_legacy',total:3500,
    items:[{id:'p1',qty:3}],...changes},
  tracking:{id,status:changes.status||'new'},
  ledger:null,target:'preparing',at,policyApproved:true
});
const snapshot=value=>structuredClone(value);
const rejects=(args,code)=>assert.throws(()=>plan(args),e=>e instanceof LegacyPolicyError&&e.code===code);
test('legacy management proposal is disabled by default for 99 representative legacy fixtures; zero mutation',()=>{
  // The fixture size reflects a past read-only aggregate, not a new live audit.
  const fixtures=Array.from({length:99},(_,n)=>fixture({payment:n<86?'cod':'card'}));
  const before=snapshot(fixtures);
  for(const x of fixtures)rejects({...x,policyApproved:false},'legacy_policy_not_approved');
  assert.deepEqual(fixtures,before);
});
test('cannot process a new ledger-backed order or an unknown ledger state',()=>{
  const a=fixture();rejects({...a,ledger:{orderId:id}},'trusted_ledger_presence_not_verified_or_new_order');
  rejects({...a,ledger:undefined},'trusted_ledger_presence_not_verified_or_new_order');
});
test('status-only approved design yields bounded patches without product, inventory, money or refund writes',()=>{
  const a=fixture(),before=snapshot(a),p=plan(a);
  assert.deepEqual(p.orderPatch,{status:'preparing',cancellationLockedAt:at});
  assert.deepEqual(p.trackingPatch,{status:'preparing',cancellationLockedAt:at});
  assert.equal(p.needsPaymentReview,false);
  assert.equal(p.auditPlan.kind,'legacy_admin_status_only');
  assert.deepEqual(a,before);
  const prohibited=['stock','totalStock','stockDebits','payment','paymentStatus','refundStatus','refundedAmount','items','total','order_lifecycle'];
  for(const key of prohibited){assert.equal(Object.hasOwn(p.orderPatch,key),false);assert.equal(Object.hasOwn(p.trackingPatch,key),false);}
});
test('historical card cancellation triggers review flag but never assumes a refund or inventory restoration',()=>{
  const a=fixture({payment:'card',paymentStatus:'paid'});
  const p=plan({...a,target:'cancelled'});
  assert.equal(p.needsPaymentReview,true);
  assert.deepEqual(p.orderPatch,{status:'cancelled',cancelledBy:'admin'});
  assert.deepEqual(p.trackingPatch,{status:'cancelled'});
  assert.equal(p.auditPlan.from,'new');
});
test('customer cancellation request blocks preparation; an already cancelled order is never resurrected',()=>{
  const pending=fixture({customerEdit:{cancelRequestedAt:'2026-11-08T01:00:00Z'}});
  rejects(pending,'legacy_pending_cancel_requires_manual_review');
  rejects({...pending,target:'cancelled'},'legacy_pending_cancel_requires_manual_review');
  const cancelled=fixture({status:'cancelled'});
  rejects({...cancelled,target:'preparing'},'legacy_transition_locked');
});
test('lifecycle transitions are forward-only and processing locks cancellation',()=>{
  const preparing=fixture({status:'preparing',cancellationLockedAt:at});
  assert.equal(plan({...preparing,target:'shipping'}).orderPatch.status,'shipping');
  rejects({...preparing,target:'cancelled'},'legacy_transition_locked');
  rejects({...preparing,target:'new'},'legacy_transition_locked');
  const shipping=fixture({status:'shipping',cancellationLockedAt:at});
  assert.equal(plan({...shipping,target:'delivered'}).orderPatch.status,'delivered');
  rejects({...shipping,target:'preparing'},'legacy_transition_locked');
  const delivered=fixture({status:'delivered'});
  rejects({...delivered,target:'cancelled'},'legacy_transition_locked');
});
test('unknown status, order/tracking disagreement, missing order proof and old cancellation lock fail closed',()=>{
  rejects(fixture({status:'unknown'}),'unknown_legacy_status');
  rejects({...fixture(),tracking:{id,status:'preparing'}},'order_tracking_disagree');
  rejects({...fixture(),tracking:null},'missing_legacy_order_or_tracking');
  rejects({...fixture(),orderId:'../../evil'},'invalid_order_id');
  rejects({...fixture(),order:{...fixture().order,id:'KD-DIFFERENT'}},'order_id_mismatch');
  rejects({...fixture(),tracking:{id:'KD-DIFFERENT',status:'new'}},'tracking_id_mismatch');
  rejects({...fixture(),target:'paid'},'invalid_target');
  rejects({...fixture(),at:'not-an-iso-time'},'invalid_audit_time');
  rejects(fixture({status:'new',cancellationLockedAt:at}),'legacy_lock_conflict');
});
test('repeat same-status request is a no-op and produces no audit or writes',()=>{
  const a=fixture({status:'preparing',cancellationLockedAt:at});
  assert.deepEqual(plan({...a,target:'preparing'}),{
    noop:true,orderPatch:null,trackingPatch:null,auditPlan:null,needsPaymentReview:false
  });
});

test('unknown historical payment method is never silently treated as COD',()=>{
 const a=fixture({payment:'unknown_legacy_payment'});
 rejects(a,'unknown_legacy_payment');
 rejects({...a,target:'cancelled'},'unknown_legacy_payment');
});
test('99 synthetic legacy records remain untouched by no-op previews',()=>{
 const records=Array.from({length:99},(_,n)=>fixture({
  status:n<78?'new':n<80?'preparing':n<82?'shipping':n<85?'delivered':'cancelled',
  payment:n<86?'cod':'card'
 }));
 const before=snapshot(records);
 for(const rec of records){
  const r=plan({...rec,target:rec.order.status,tracking:{id,status:rec.order.status}});
  assert.equal(r.noop,true);
 }
 assert.deepEqual(records,before);
});
