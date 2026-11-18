// Strictly offline, aggregate-only snapshot comparator for Kandorty historical COD self-tests.
// This is NOT an order-ID reconciliation, financial proof or rollout authorization.
// Never returns document IDs, customer data, financial references or inventory values.
export const BASELINE=Object.freeze({
  orders:99,
  distinct:18,
  categories:Object.freeze({
    processingLocks:4,pendingCancellation:3,previousRestockMarker:3,unknownCancellationActor:11
  })
});
const okId=id=>typeof id==='string'&&/^KD-?[A-Za-z0-9_-]{4,40}$/.test(id);
const truthy=x=>x!==null&&x!==undefined&&x!==''&&x!==false;
// Firestore Timestamp values may be distinct objects representing the same
// instant. Reference inequality would wrongly report a lock mismatch.
function equalLock(a,b){
  if(!truthy(a)||!truthy(b))return false;
  if(typeof a==='string'||typeof b==='string')return typeof a==='string'&&a===b;
  if(a instanceof Date||b instanceof Date)
    return a instanceof Date&&b instanceof Date&&Number.isFinite(a.getTime())&&a.getTime()===b.getTime();
  if(a&&typeof a.isEqual==='function')return a.isEqual(b)===true;
  if(a&&b&&Number.isSafeInteger(a.seconds)&&Number.isSafeInteger(a.nanoseconds)&&
    Number.isSafeInteger(b.seconds)&&Number.isSafeInteger(b.nanoseconds))
    return a.seconds===b.seconds&&a.nanoseconds===b.nanoseconds;
  return false; // Unknown historical lock types: no unverified equivalence.
}
function checkRows(name,rows){
  if(!Array.isArray(rows)||rows.length>500)throw Error('invalid_'+name+'_size');
  const map=new Map();
  for(const row of rows){
    if(!row||!okId(row.id)||!row.data||typeof row.data!=='object'||
       Array.isArray(row.data)||map.has(row.id))
      throw Error('invalid_'+name+'_record');
    map.set(row.id,row.data);
  }
  return map;
}
export function aggregateOwnerDeclaredCodRisk(orders,tracking){
  const om=checkRows('orders',orders), tm=checkRows('tracking',tracking);
  const c={processingLocks:0,pendingCancellation:0,previousRestockMarker:0,
           unknownCancellationActor:0};
  let flagged=0,cod=0,card=0,otherPayment=0,
      missingTracking=0,mismatchedTracking=0;
  for(const [id,v] of om){
    const t=tm.get(id);
    if(!t){missingTracking++;continue;}
    if(v.status!==t.status){mismatchedTracking++;continue;}
    const pending=Boolean(v.customerEdit?.cancelRequestedAt||
       t.customerEdit?.cancelRequestedAt||v.cancelRequestedAt||t.cancelRequestedAt);
    const lock=v.status==='preparing'||v.status==='shipping'||v.status==='delivered';
    const hasLockProblem=lock&&!equalLock(v.cancellationLockedAt,t.cancellationLockedAt);
    const previousRestock=truthy(v.cancelStockRestoredAt);
    const unknownActor=v.status==='cancelled'&&
      v.cancelledBy!=='admin'&&v.cancelledBy!=='customer';
    const flags=[hasLockProblem,pending,previousRestock,unknownActor];
    if(flags.some(Boolean)){
      flagged++;
      for(const [i,key] of Object.keys(c).entries())if(flags[i])c[key]++;
      if(v.payment==='cod')cod++;
      else if(v.payment==='card')card++;
      else otherPayment++;
    }
  }
  const unmatchedTracking=[...tm.keys()].filter(id=>!om.has(id)).length;
  const comparable=missingTracking===0&&mismatchedTracking===0&&
    unmatchedTracking===0&&om.size===BASELINE.orders&&tm.size===BASELINE.orders;
  const categoryMatches=Object.entries(BASELINE.categories).every(
    ([k,v])=>c[k]===v);
  return Object.freeze({
    inspectedOrders:om.size,
    trackingStatusConsistent:comparable,
    currentFlaggedOrders:flagged,
    currentFlaggedCodLabels:cod,
    currentFlaggedCardLabels:card,
    currentFlaggedUnknownPaymentLabels:otherPayment,
    currentCategoryCounts:Object.freeze(c),
    // ONLY a coarse, changing live-data aggregate compared with the owner's
    // previously encrypted local snapshot. Cannot identify the same 18 IDs.
    aggregateResemblesEncryptedBaseline:comparable&&
       flagged===BASELINE.distinct&&categoryMatches,
    currentAllFlaggedLabeledCod:flagged===BASELINE.distinct&&
       cod===BASELINE.distinct&&card===0&&otherPayment===0,
    same18IndividualOrdersVerified:false,
    testTransactionStockEffectsVerified:false,
    customerPaymentsOrRefundsVerified:false,
    allProductionDataRecoveryVerified:false,
    stage4ReleaseAuthorized:false
  });
}
