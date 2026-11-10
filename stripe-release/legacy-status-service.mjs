// Isolated TEST-only demonstration of a future legacy-admin status service.
// NEVER authorizes production order changes. Do not use for client cancellations,
// stock restoration, paid flags, receipts, Stripe refunds or order migration.
import {Fault} from '../cod-staging/security.mjs';
import {planLegacyAdminTransition,LegacyPolicyError} from './legacy-status-policy.mjs';

const TEST_PROJECT='kandorty-stripe-test-5f8af';
const ORDER=/^KD-?[A-Za-z0-9_-]{4,40}$/;
const ADMIN=/^[A-Za-z0-9_-]{1,128}$/;
const TEST_GATE='KANDORTY_LEGACY_TEST_ONLY_APPROVED';
const validStore=store=>store&&typeof store.beginTransaction==='function'&&
 typeof store.getInTransaction==='function'&&
 typeof store.commitTransaction==='function'&&
 typeof store.rollbackTransaction==='function'&&typeof store.write==='function'&&
 typeof store.writePatch==='function';

export function legacyStatusTestService(cfg,store,env){
 // Explicitly reject LIVE even if a caller copied all TEST approval flags
 // into the production configuration. The owner has NOT approved any rollout.
 if(cfg?.mode!=='test'||cfg.projectId!==TEST_PROJECT||
    store?.root!==`projects/${TEST_PROJECT}/databases/(default)/documents`)
  throw new Fault('legacy_production_disabled',503);
 if(env?.LEGACY_STATUS_TEST_ENABLED!=='true'||
    env.LEGACY_STATUS_TEST_APPROVAL!==TEST_GATE)
  throw new Fault('legacy_test_only_disabled',503);
 if(!validStore(store))throw new Fault('legacy_atomic_store_required',503);

 return {
  async change(orderId,target,actor){
   if(!ORDER.test(orderId||'')||
      !['preparing','shipping','delivered','cancelled'].includes(target))
    throw new Fault('legacy_invalid_transition',409);
   if(actor?.kind!=='admin'||!ADMIN.test(actor.uid||''))
    throw new Fault('admin_authorization_required',403);

   for(let attempt=0;attempt<4;attempt++){
    const transaction=await store.beginTransaction();
    let committed=false;
    try{
     // All three reads occur in the SAME Firestore read-write transaction.
     // In particular, a missing ledger is part of the transaction read set.
     const row=await store.getInTransaction('orders/'+orderId,transaction);
     const tracking=await store.getInTransaction('tracking/'+orderId,transaction);
     const ledger=await store.getInTransaction('order_lifecycle/'+orderId,transaction);
     if(!row||!tracking||!row.version||!tracking.version)
      throw new Fault('legacy_missing_order_or_tracking',409);
     const at=new Date().toISOString();
     const planned=planLegacyAdminTransition({
      orderId,order:row.data,tracking:tracking.data,
      ledger:ledger?.data??null,target,at,policyApproved:true
     });
     if(planned.noop){
      await store.rollbackTransaction(transaction);
      return Object.freeze({id:orderId,status:target,unchanged:true});
     }
     // Preserve *all* unrelated historical Firestore types/fields with
     // updateMask. Never round-trip the entire old order via unpack()/pack().
     const orderPatch={...planned.orderPatch,updatedAt:at};
     const trackingPatch={...planned.trackingPatch,updatedAt:at};
     const auditPath='legacy_admin_status_audit/'+orderId+'_'+target;
     const writes=[
      store.writePatch('orders/'+orderId,orderPatch,{updateTime:row.version}),
      store.writePatch('tracking/'+orderId,trackingPatch,{updateTime:tracking.version}),
      store.write(auditPath,{
       orderId,from:planned.auditPlan.from,to:target,at,
       actorUid:actor.uid,kind:'legacy_admin_status_only',
       needsPaymentReview:planned.needsPaymentReview,
       // Not evidence of refund/payment; record only a manual review flag.
       moneyOrStockChanged:false
      },{exists:false})
     ];
     await store.commitTransaction(transaction,writes);
     committed=true;
     return Object.freeze({
      id:orderId,status:target,unchanged:false,
      needsPaymentReview:planned.needsPaymentReview
     });
    }catch(e){
     if(!committed)await store.rollbackTransaction(transaction).catch(()=>{});
     if(e?.message==='write_conflict'){
      // Re-read the entire transaction: never reuse stale order, tracking,
      // ledger absence or audit state in the face of another writer.
      continue;
     }
     if(e instanceof LegacyPolicyError)
      throw new Fault(e.code,409);
     throw e;
    }
   }
   throw new Fault('legacy_transaction_busy',503);
  }
 };
}
