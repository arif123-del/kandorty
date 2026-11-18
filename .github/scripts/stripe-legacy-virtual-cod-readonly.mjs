// Strictly read-only production AGGREGATE metadata check for the owner's
// statement that the 18 legacy risk cases are virtual COD test orders.
// Never print document IDs, customer information, private credentials, money,
// refund IDs, product data or account information. No production mutations.
import {initializeApp,cert,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {aggregateOwnerDeclaredCodRisk} from '../../stripe-release/legacy-virtual-cod-aggregate.mjs';
const PROJECT='kandorty-9378a';
const output=(key,val)=>console.log('OWNER_VIRTUAL_COD_AGGREGATE '+key+': '+val);
const expected={orders:['status','payment','cancellationLockedAt',
  'cancelStockRestoredAt','customerEdit.cancelRequestedAt','cancelRequestedAt','cancelledBy'],
 tracking:['status','cancellationLockedAt','customerEdit.cancelRequestedAt','cancelRequestedAt']};
let app;
try{
 const creds=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON||'');
 if(creds.type!=='service_account'||creds.project_id!==PROJECT)
   throw Error('unexpected_firebase_project');
 app=initializeApp({credential:cert(creds),projectId:PROJECT},'virtual-cod-stage4-readonly');
 const db=getFirestore(app), rows={};
 for(const kind of ['orders','tracking']){
   const snapshot=await db.collection(kind).select(...expected[kind]).limit(501).get();
   if(snapshot.size>=501)throw Error('bounded_query_limit');
   rows[kind]=snapshot.docs.map(doc=>({id:doc.id,data:doc.data()}));
 }
 const result=aggregateOwnerDeclaredCodRisk(rows.orders,rows.tracking);
 output('CURRENT_ORDER_COUNT',result.inspectedOrders);
 output('TRACKING_STATUS_CONSISTENT',result.trackingStatusConsistent?'YES':'NO');
 output('CURRENT_FLAGGED_UNIQUE',result.currentFlaggedOrders);
 output('CURRENT_FLAGGED_COD_LABELS',result.currentFlaggedCodLabels);
 output('CURRENT_FLAGGED_CARD_LABELS',result.currentFlaggedCardLabels);
 output('CURRENT_FLAGGED_UNKNOWN_PAYMENT_LABELS',result.currentFlaggedUnknownPaymentLabels);
 for(const [key,val] of Object.entries(result.currentCategoryCounts))
   output('CURRENT_'+key.toUpperCase(),val);
 output('CURRENT_AGGREGATE_RESEMBLES_ENCRYPTED_BASELINE',
   result.aggregateResemblesEncryptedBaseline?'YES':'NO');
 output('CURRENT_ALL_FLAGGED_COD_LABELS',
   result.currentAllFlaggedLabeledCod?'YES':'NO');
 output('EXACT_SAME_18_IDENTIFIERS_VERIFIED','NO — snapshot IDs never exported');
 output('HISTORICAL_INVENTORY_EFFECTS_VERIFIED','NO');
 output('PROVIDER_FINANCE_VERIFIED','NO');
 output('COMPLETE_FIREBASE_RECOVERY_VERIFIED','NO');
 output('PRODUCTION_WRITES','NONE');
 output('STAGE4_RELEASE_AUTHORIZED','NO');
}catch{
 output('READ_STATUS','BLOCKED_OR_FAILED_NO_PRIVATE_DETAILS');
 process.exitCode=2;
}finally{
 if(app)await deleteApp(app);
}
