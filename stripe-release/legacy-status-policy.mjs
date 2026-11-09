// DRAFT ONLY: pure, offline policy planner for pre-cutover legacy orders.
// NOT connected to the Worker, production endpoints, Firebase, or any deployed UI.
// The future caller MUST authenticate an authorized admin, read the order/tracking
// and check for the lifecycle ledger on the server, then use Firestore atomic
// version preconditions for all writes and an immutable audited operator identity.
// Never call this as an alternative to the trusted new-order lifecycle service.
export class LegacyPolicyError extends Error {
  constructor(code){ super(code); this.name='LegacyPolicyError'; this.code=code; }
}
const fail=(condition,code)=>{if(!condition)throw new LegacyPolicyError(code);};
const transitions=Object.freeze({
  new:['preparing','cancelled'],
  preparing:['shipping'],
  shipping:['delivered'],
  delivered:[],
  cancelled:[]
});
const allowedPatchFields=['status','cancellationLockedAt','cancelledBy'];
export function planLegacyAdminTransition({
  orderId,order,tracking,ledger,target,at,policyApproved=false
}={}){
  // This flag is only a testable design gate, NOT operator auth or release approval.
  // The module is intentionally not wired into any runtime route.
  fail(policyApproved===true,'legacy_policy_not_approved');
  fail(typeof orderId==='string'&&/^KD-?[A-Za-z0-9_-]{4,40}$/.test(orderId),'invalid_order_id');
  fail(ledger===null,'trusted_ledger_presence_not_verified_or_new_order');
  fail(order&&typeof order==='object'&&tracking&&typeof tracking==='object','missing_legacy_order_or_tracking');
  fail(!order.id||order.id===orderId,'order_id_mismatch');
  fail(!tracking.id||tracking.id===orderId,'tracking_id_mismatch');
  fail(typeof at==='string'&&Number.isFinite(Date.parse(at))&&new Date(at).toISOString()===at,'invalid_audit_time');
  const current=order.status;
  fail(Object.hasOwn(transitions,current),'unknown_legacy_status');
  fail(current===tracking.status,'order_tracking_disagree');
  fail(Object.hasOwn(transitions,target),'invalid_target');
  if(current===target)return Object.freeze({noop:true,orderPatch:null,trackingPatch:null,auditPlan:null,needsPaymentReview:false});
  fail(transitions[current].includes(target),'legacy_transition_locked');
  const pendingCancellation=Boolean(order.customerEdit?.cancelRequestedAt);
  // Existing browser-admin customer-cancel listeners may independently restock
  // untrusted quantities. No status mutation is safe while that path is active.
  fail(!pendingCancellation,'legacy_pending_cancel_requires_manual_review');
  // An apparently-new order with a previously set lock is inconsistent.
  // Do not resurrect its cancellation option or silently advance it.
  if(current==='new')fail(!order.cancellationLockedAt&&!tracking.cancellationLockedAt,'legacy_lock_conflict');
  const lock=target==='preparing'?(order.cancellationLockedAt||at):null;
  const orderPatch={status:target};
  const trackingPatch={status:target};
  if(lock){orderPatch.cancellationLockedAt=lock;trackingPatch.cancellationLockedAt=lock;}
  // Mark admin cancellation explicitly so the old admin's customer-cancel
  // listener cannot reconstruct stock from untrusted historical item counts.
  if(target==='cancelled')orderPatch.cancelledBy='admin';
  fail(Object.keys(orderPatch).every(x=>allowedPatchFields.includes(x)),'unexpected_order_patch');
  fail(Object.keys(trackingPatch).every(x=>x==='status'||x==='cancellationLockedAt'),'unexpected_tracking_patch');
  const auditPlan={orderId,from:current,to:target,at,kind:'legacy_admin_status_only'};
  return Object.freeze({
    noop:false,
    orderPatch:Object.freeze(orderPatch),
    trackingPatch:Object.freeze(trackingPatch),
    auditPlan:Object.freeze(auditPlan),
    needsPaymentReview:target==='cancelled'&&order.payment==='card'
  });
}
