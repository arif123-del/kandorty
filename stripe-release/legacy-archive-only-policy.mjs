// Kandorty legacy order preservation policy: immutable, archive-only review.
// DRAFT, pure synchronous code; not a deployed route or Firebase security rule.
// Caller must independently authenticate and authorize all reads. This code
// MUST NOT authorize any write, restock, cancel, refund or Live checkout.
export const LEGACY_ARCHIVE_ONLY='ARCHIVE_READ_ONLY';
export class LegacyArchiveDenied extends Error{
  constructor(code){super(code);this.name='LegacyArchiveDenied';this.code=code;}
}
const statuses=new Set(['new','preparing','shipping','delivered','cancelled']);
const fail=code=>{throw new LegacyArchiveDenied(code);};
export function planLegacyArchiveAccess({
  operation,order,tracking,lifecycle,ownerDeclaresVirtualCod=false,
  ownerDeclaresVirtualTestOrder=false
}={}){
  // Explicitly treat every user-reported historic test label as descriptive
  // only. It must never confer mutation privileges.
  if(operation!=='read')fail('legacy_archive_write_forbidden');
  if(!order||typeof order!=='object'||Array.isArray(order)||
     !tracking||typeof tracking!=='object'||Array.isArray(tracking))
    fail('legacy_archive_record_missing');
  if(lifecycle!==null)fail('legacy_archive_ledger_not_proven_absent');
  if(!statuses.has(order.status)||order.status!==tracking.status)
    fail('legacy_archive_tracking_inconsistent');
  if(!['cod','card'].includes(order.payment))
    fail('legacy_archive_payment_label_unknown');
  return Object.freeze({
    access:LEGACY_ARCHIVE_ONLY,
    archivedStatus:order.status,
    // Owner assertion does not rewrite original payment, provenance or money.
    userReportedVirtualTestOrder:ownerDeclaresVirtualTestOrder===true || ownerDeclaresVirtualCod===true,
    userReportedVirtualCod:ownerDeclaresVirtualCod===true,
    sourcePaymentLabel:order.payment,
    canEdit:false,
    canCancel:false,
    canRestoreStock:false,
    canIssueRefund:false,
    canBackfillLifecycle:false,
    canActivateLive:false,
    trustedStockHistory:false,
    fullRecoveryProven:false,
    producerApproved:false
  });
}
