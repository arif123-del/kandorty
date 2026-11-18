// READ ONLY production Kandorty legacy-order compatibility inventory.
// Prints category counts only. Never emits order IDs, contact data, payment
// references, Firebase credentials or document contents. No Firestore mutations.
import {initializeApp,cert,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';

const PROJECT='kandorty-9378a',BASELINE=98,LIMIT=501;
const output=(key,value)=>console.log('LEGACY_READONLY_AUDIT '+key+': '+value);
const counts=keys=>Object.fromEntries(keys.map(k=>[k,0]));
function label(value,allowed){
 return typeof value==='string'&&allowed.includes(value)?value:'other';
}
const statuses=['new','preparing','shipping','delivered','cancelled'];
const payments=['cod','card'];
async function main(){
 const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
 let account;
 try{account=JSON.parse(raw);}catch{output('CREDENTIAL','UNAVAILABLE');process.exitCode=2;return;}
 if(account?.type!=='service_account'||account.project_id!==PROJECT||
    typeof account.private_key!=='string'||!account.private_key.startsWith('-----BEGIN PRIVATE KEY-----')||
    typeof account.client_email!=='string'||!account.client_email.endsWith('.iam.gserviceaccount.com')){
  output('CREDENTIAL','PROJECT_MISMATCH_OR_INVALID');process.exitCode=2;return;
 }
 const app=initializeApp({credential:cert(account),projectId:PROJECT},'kandorty-legacy-readonly');
 try{
  const db=getFirestore(app);
  // Query only fields required for aggregation. Do not fetch customer PII.
  const orders=await db.collection('orders').select('status','payment').limit(LIMIT).get();
  if(orders.size===LIMIT){output('INVENTORY','TRUNCATED_UNSAFE_TO_REPORT');process.exitCode=2;return;}
  const totals=counts([...statuses,'other']);
  const methods=counts([...payments,'other']);
  const safeRefs=[],trackingRefs=[];
  for(const doc of orders.docs){
   const data=doc.data();
   totals[label(data?.status,statuses)]++;
   methods[label(data?.payment,payments)]++;
   safeRefs.push(db.collection('order_lifecycle').doc(doc.id));
   trackingRefs.push(db.collection('tracking').doc(doc.id));
  }
  let ledgerPresent=0,trackingMissing=0,trackingMismatch=0,trackingMatching=0;
  for(let i=0;i<safeRefs.length;i+=50){
   const chunks=safeRefs.slice(i,i+50);
   const snapshots=await db.getAll(...chunks);
   for(const snap of snapshots)if(snap.exists)ledgerPresent++;
  }
  for(let i=0;i<trackingRefs.length;i+=50){
   const snapshots=await db.getAll(...trackingRefs.slice(i,i+50));
   for(let j=0;j<snapshots.length;j++){
    const doc=snapshots[j],order=orders.docs[i+j];
    if(!doc.exists){trackingMissing++;continue;}
    if(doc.data()?.status===order.data()?.status)trackingMatching++;
    else trackingMismatch++;
   }
  }
  output('PROJECT','EXPECTED_PRODUCTION_READ_ONLY');
  output('ORDER_DOCUMENTS',orders.size);
  output('PREVIOUS_SNAPSHOT_2026_10_29',BASELINE);
  output('NET_CHANGE_FROM_PREVIOUS_SNAPSHOT',orders.size-BASELINE);
  output('MISSING_TRUSTED_LIFECYCLE',orders.size-ledgerPresent);
  output('PRESENT_TRUSTED_LIFECYCLE',ledgerPresent);
  output('TRACKING_MATCHING_STATUS',trackingMatching);
  output('TRACKING_MISSING',trackingMissing);
  output('TRACKING_STATUS_MISMATCH',trackingMismatch);
  for(const k of Object.keys(totals))output('STATUS_'+k.toUpperCase(),totals[k]);
  for(const k of Object.keys(methods))output('PAYMENT_'+k.toUpperCase(),methods[k]);
  output('PUBLISHED_RULES_OR_ORDERS_CHANGED','NO');
  output('LEGACY_CLIENT_CUTOVER_APPROVAL','NOT_GIVEN');
 }finally{await deleteApp(app);}
}
main().catch(()=>{output('STATUS','READ_FAILED_NO_PRIVATE_DETAILS');process.exitCode=2;});
