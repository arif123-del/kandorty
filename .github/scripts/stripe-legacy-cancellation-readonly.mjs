// Additional Kandorty historical cancellation safety review — strictly READ ONLY.
// Never print customer data, order IDs, payment refs, Firebase credentials or
// cancellation proof tokens. No production writes or rules changes.
import {initializeApp,cert,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
const PROJECT='kandorty-9378a';
const label=(name,n)=>console.log('LEGACY_CANCEL_READONLY '+name+': '+n);
let app;
try{
 const credentials=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON||'');
 if(credentials.project_id!==PROJECT||credentials.type!=='service_account')
  throw Error('wrong_project');
 app=initializeApp({credential:cert(credentials),projectId:PROJECT},'kandorty-legacy-cancel-metadata');
 const db=getFirestore(app);
 const snap=await db.collection('orders').select('status','payment','cancellationLockedAt',
  'cancelStockRestoredAt','customerEdit.cancelRequestedAt','cancelledBy').limit(501).get();
 if(snap.size>=501)throw Error('unsafe_unbounded');
 const found={newPending:0,anyPending:0,pendingWithLock:0,
  paidByCardCancelled:0,customerCancelled:0,cancelledRestoredFlag:0,
  processingWithoutLock:0};
 for(const doc of snap.docs){
  const v=doc.data()||{};
  const pending=!!v.customerEdit?.cancelRequestedAt;
  if(pending){
   found.anyPending++;
   if(v.status==='new')found.newPending++;
   if(v.cancellationLockedAt)found.pendingWithLock++;
  }
  if(v.status==='cancelled'){
   if(v.payment==='card')found.paidByCardCancelled++;
   if(v.cancelledBy==='customer')found.customerCancelled++;
   if(v.cancelStockRestoredAt)found.cancelledRestoredFlag++;
  }
  if(['preparing','shipping','delivered'].includes(v.status)&&!v.cancellationLockedAt)
   found.processingWithoutLock++;
 }
 label('ORDER_COUNT',snap.size);
 for(const [name,val] of Object.entries(found))label(name.toUpperCase(),val);
 for(const collection of ['order_edits','order_access']){
  try{
   const result=await db.collection(collection).count().get();
   const value=result.data()?.count;
   label(collection.toUpperCase()+'_COUNT',Number.isSafeInteger(value)?value:'UNVERIFIED');
  }catch{label(collection.toUpperCase()+'_COUNT','UNVERIFIED');}
 }
 label('PRODUCTION_DATA_MUTATED','NO');
 label('REFUND_OR_STOCK_INFERENCE','NONE');
}catch{
 label('STATUS','READ_BLOCKED_NO_PRIVATE_DETAILS');
 process.exitCode=2;
}finally{if(app)await deleteApp(app);}
