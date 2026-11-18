// Draft-artifact-only defence: disable background legacy Firestore mutations
// in the unpublished admin HTML. Never edit the existing public admin.html.
// This does NOT make the candidate release-ready: old Android and customer
// clients, legacy status handling and all protected rollout gates still apply.
function exactlyOnce(source,anchor){
 if(source.split(anchor).length!==2)throw Error('unsafe_legacy_admin_anchor_drift');
}
export function guardLegacyAdminReviewArtifact(html){
 if(typeof html!=='string')throw TypeError('admin_html_required');
 const begin='async function finalizeCustomerCancellation(order){';
 const end='function startAdminOrdersListener(){';
 exactlyOnce(html,begin);
 exactlyOnce(html,end);
 const start=html.indexOf(begin),stop=html.indexOf(end);
 if(!(stop>start))throw Error('unsafe_legacy_admin_anchor_drift');
 const removed=html.slice(start,stop);
 for(const anchor of [
  'async function restoreCustomerCancelledStock(order){',
  "db.collection('products').doc(productId)",
  "tx.update(ref,{stock:next,totalStock:"
 ])if(!removed.includes(anchor))throw Error('unsafe_legacy_admin_anchor_drift');

 // Two old callbacks automatically cancel orders and restock products using
 // client-authored item quantities. Disable both, not just the UI buttons.
 let result=html.slice(0,start)+
  '// DRAFT REVIEW ONLY: historical customer-cancel auto-finalization and\n'+
  '// old client-quantity restocking removed; handle manually after review.\n'+
  html.slice(stop);
 const callbacks=[
  "docs.filter(o=>o.status==='new'&&isPendingCustomerCancellation(o)).forEach(o=>finalizeCustomerCancellation(o));",
  "docs.filter(o=>o.status==='cancelled'&&(o.cancelledBy==='customer'||isPendingCustomerCancellation(o))).forEach(o=>restoreCustomerCancelledStock(o));",
  'ensureCustomerEditForOldOrders(orders).catch(console.warn);',
  'syncOrdersToTracking(orders);'
 ];
 for(const anchor of callbacks){
  exactlyOnce(result,anchor);
  result=result.replace(anchor,'/* DRAFT REVIEW: legacy auto-write deliberately disabled pending safe server migration */');
 }
 // The published/admin source also runs an automatic baseline migration
 // on login/product sync. It fabricates totalStock from the remaining stock and
 // writes updatedAt in the client without any trusted historic inventory ledger.
 // Do not silently mutate even the one stock-tracked item during a cutover.
 const baselineBegin='async function ensureProductTotalStockBaselines(){';
 const baselineEnd="$('productForm').onsubmit=async e=>{";
 exactlyOnce(result,baselineBegin);
 exactlyOnce(result,baselineEnd);
 const bStart=result.indexOf(baselineBegin),bStop=result.indexOf(baselineEnd);
 if(!(bStop>bStart))throw Error('unsafe_legacy_stock_baseline_anchor_drift');
 const removedStockMigration=result.slice(bStart,bStop);
 for(const proof of ["db.batch()","batch.set(db.collection('products').doc(p.id)",
                     "await batch.commit();"])
  if(!removedStockMigration.includes(proof))
   throw Error('unsafe_legacy_stock_baseline_anchor_drift');
 result=result.slice(0,bStart)+
  '// DRAFT REVIEW ONLY: do not infer historical totalStock from client state.\n'+
  result.slice(bStop);
 const baselineCall='ensureProductTotalStockBaselines().catch(()=>{});';
 const baselineCallCount=result.split(baselineCall).length-1;
 if(baselineCallCount!==2)
  throw Error('unsafe_legacy_stock_baseline_anchor_drift');
 result=result.split(baselineCall).join(
  '/* DRAFT REVIEW: auto stock baseline migration disabled */');
 if(result.includes('ensureProductTotalStockBaselines('))
  throw Error('unsafe_legacy_stock_baseline_migration_survived');
 
 // Assert no live call sites or unsafe auto-cancellation bodies survive in the
 // generated HTML. Some unrelated admin actions remain and need separate review.
 for(const forbidden of [
  'async function finalizeCustomerCancellation(order){',
  'async function restoreCustomerCancelledStock(order){',
  'forEach(o=>finalizeCustomerCancellation(o))',
  'forEach(o=>restoreCustomerCancelledStock(o))',
  'ensureCustomerEditForOldOrders(orders).catch(console.warn)',
  'syncOrdersToTracking(orders);'
 ])if(result.includes(forbidden))throw Error('unsafe_legacy_auto_write_survived');
 return result;
}
