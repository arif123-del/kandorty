// Read-only static candidate Rules cutover blocker. No code execution from
// storefront/admin, no Firestore credentials, no production publish.
const has=(text,x)=>typeof text==='string'&&text.includes(x);
export function assessLegacyClientCutover({storefront,admin,proposedRules}={}){
 if([storefront,admin,proposedRules].some(x=>typeof x!=='string'||!x))
  throw Error('missing_source_for_cutover_audit');
 const checks=Object.freeze({
  storefrontDirectOrderWrite:has(storefront,'await saveOrderWithStock(order);'),
  storefrontDirectTrackingWrite:has(storefront,"db.collection('tracking').doc(order.id).set("),
  storefrontClientCancellationRestock:has(storefront,'async function restoreCustomerCancelledStock(order){'),
  adminDirectOrderBatch:has(admin,"orders.forEach(order=>batch.set(db.collection('orders').doc(order.id),order))"),
  adminAutomaticTrackingBackfill:has(admin,'async function syncOrdersToTracking(orderList){'),
  adminAutomaticStockBaseline:has(admin,'async function ensureProductTotalStockBaselines(){'),
  adminLegacyClientRestock:has(admin,'async function restoreCustomerCancelledStock(order){'),
  candidateRulesBlockBrowserOrderWrites:
   /match \/orders\/\{orderId\}[\s\S]*?allow create, update, delete: if false;/.test(proposedRules),
  candidateRulesBlockBrowserTrackingWrites:
   /match \/tracking\/\{orderId\}[\s\S]*?allow create, update, delete: if false;/.test(proposedRules)
 });
 const direct=[checks.storefrontDirectOrderWrite,checks.storefrontDirectTrackingWrite,
  checks.storefrontClientCancellationRestock,checks.adminDirectOrderBatch,
  checks.adminAutomaticTrackingBackfill,checks.adminAutomaticStockBaseline,
  checks.adminLegacyClientRestock].some(Boolean);
 return Object.freeze({
  checks,legacyDirectWritePathsPresent:direct,
  candidateRulesWouldRejectLegacyClientWrites:direct&&
    checks.candidateRulesBlockBrowserOrderWrites&&checks.candidateRulesBlockBrowserTrackingWrites,
  installedAndroidClientsValidated:false,
  browserAndAdminEndToEndAccepted:false,
  oldCustomerOrdersPreservedByStaticAudit:false,
  allowProductionRulesPublication:false,
  allowStripeLive:false
 });
}
