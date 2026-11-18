// Private operator report: aggregate counts and alert flags ONLY.
// Never print customer data, order identifiers, credentials or guest receipts.
import {releaseConfig} from './configuration.mjs';
import {createStore} from './firestore.mjs';
export async function operationalReport(store,now=Date.now()){
 const [pending,reviews,refunds]=await Promise.all([
  store.pending(),store.reviews(),store.refundPending()
 ]);
 // Missing/bad timestamps must not hide records requiring manual attention.
 const overdue=records=>records.filter(x=>{
  const t=Date.parse(x.createdAt||'');
  return !Number.isFinite(t)||now-t>45*60*1000;
 });
 const expiredPending=overdue(pending).length;
 const overdueRefunds=overdue(refunds).length;
 const scanLimitReached=[pending,reviews,refunds].some(list=>list.length>=50);
 return {
  pendingSample:pending.length,
  reviewSample:reviews.length,
  refundPendingSample:refunds.length,
  overduePendingCount:expiredPending,
  overdueRefundCount:overdueRefunds,
  scanLimitReached,
  requiresAttention:expiredPending>0||reviews.length>0||refunds.length>0||scanLimitReached
 };
}
if(process.argv[1]?.endsWith('/operations.mjs')){
 releaseConfig(process.env);
 const report=await operationalReport(createStore(process.env));
 console.log(JSON.stringify(report));
 if(report.requiresAttention)process.exitCode=2;
}
