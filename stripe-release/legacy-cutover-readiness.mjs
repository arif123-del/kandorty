// READ-ONLY cutover risk inventory for the 98 pre-cutover Kandorty orders.
// This is an intentionally conservative, offline diagnostic. No customer data,
// Firebase/Stripe API access, credential lookup, or production changes.
// A clean code scan is NOT a release approval: device/client acceptance is required.
export const LEGACY_CLIENT_GATES=Object.freeze([
  'historical_order_admin_status',
  'historical_customer_cancellation',
  'historical_guest_tracking',
  'old_browser_and_android_compatibility',
  'backwards_compatible_rules',
  'reviewed_stock_and_payment_history',
  'owner_approved_migration_and_rollback'
]);
const has=(s,re)=>re.test(s);
export function legacyCutoverReadiness({
  storefront,admin,rules,acceptance={}
}={}){
  if(typeof storefront!=='string'||typeof admin!=='string'||typeof rules!=='string')
    throw new TypeError('source_text_required');
  // These are code-pattern indicators, not parsed call graphs. They deliberately
  // err toward BLOCKED until explicit reviewed fixture and device verification.
  const indicators=Object.freeze({
    browserCheckoutWrites:has(storefront,/async\s+function\s+saveOrderWithStock\s*\(/)&&
      has(storefront,/db\.runTransaction\s*\(/),
    browserCustomerCancellationWrites:has(storefront,/async\s+function\s+requestOrderCancellation\s*\(/)&&
      has(storefront,/await\s+orderRef\.update\s*\(\{\s*customerEdit/),
    adminStatusWrites:has(admin,/async\s+function\s+updateOrderStatus\s*\(/)&&
      has(admin,/db\.runTransaction\s*\(/),
    adminCustomerCancellationWrites:has(admin,/async\s+function\s+finalizeCustomerCancellation\s*\(/)&&
      has(admin,/tx\.update\s*\(orderRef/),
    adminRestocksFromLegacyQuantities:has(admin,/async\s+function\s+restoreCustomerCancelledStock\s*\(/)&&
      has(admin,/qtyById/) && has(admin,/tx\.update\s*\(ref,\s*\{\s*stock/),
    candidateDeniesLegacyOrderTrackingWrites:
      has(rules,/match\s+\/orders\/\{(?:id|orderId|orderID)\}\s*\{[\s\S]{0,500}allow\s+create,\s*update,\s*delete:\s*if\s+false/)&&
      has(rules,/match\s+\/tracking\/\{(?:id|orderId|orderID)\}\s*\{[\s\S]{0,500}allow\s+create,\s*update,\s*delete:\s*if\s+false/)
  });
  const missingAcceptance=LEGACY_CLIENT_GATES.filter(k=>acceptance[k]!==true);
  // Critical: accepting seven booleans in this diagnostic is NEVER sufficient
  // to authorize production. The real go/no-go needs authorized owner consent
  // plus an independent release mechanism; we never return ready:true.
  const risks=Object.entries(indicators).filter(([,v])=>v===true).map(([k])=>k);
  return Object.freeze({
    currentLegacyReadiness:'NO_GO',
    // no production gate is derived from this report or caller-supplied flags
    deployAuthorized:false,
    codeRiskIndicators:Object.freeze(risks),
    acceptanceStillNeeded:Object.freeze(missingAcceptance),
    requiresIndependentOwnerApproval:true
  });
}
