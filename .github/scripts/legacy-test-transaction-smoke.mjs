// TEST-ONLY Firestore REST transaction smoke with a synthetic legacy order.
// Production Firebase and any real checkout/stock/refund/customer data are
// explicitly out of scope. Owner approval to publish remains required.
// This job creates at most two synthetic documents and an immutable audit in
// kandorty-stripe-test-5f8af, verifies atomic status change, then deletes only
// documents it created. Never use production credentials or project IDs.
import {randomInt,randomBytes} from 'node:crypto';
import {initializeApp,cert,deleteApp} from 'firebase-admin/app';
import {getFirestore,Timestamp,GeoPoint} from 'firebase-admin/firestore';
import {createStore} from '../../stripe-release/firestore.mjs';
import {legacyStatusTestService} from '../../stripe-release/legacy-status-service.mjs';

const PROJECT='kandorty-stripe-test-5f8af';
const root=`projects/${PROJECT}/databases/(default)/documents`;
const log=s=>console.log('LEGACY_TEST_TRANSACTION_SMOKE: '+s);
const raw=process.env.STRIPE_TEST_SERVICE_ACCOUNT_JSON;
const isolation={
 STRIPE_MODE:'test',FIREBASE_PROJECT_ID:PROJECT,
 STRIPE_SECRET_KEY:'sk_test_offline_fixture',
 STRIPE_WEBHOOK_SECRET:'whsec_offline_fixture',
 STRIPE_RECEIPT_SECRET:'a'.repeat(64),
 STAGING_ACCESS_SECRET:'b'.repeat(64),
 FIREBASE_SERVICE_ACCOUNT_JSON:raw,
 LEGACY_STATUS_TEST_ENABLED:'true',
 LEGACY_STATUS_TEST_APPROVAL:'KANDORTY_LEGACY_TEST_ONLY_APPROVED'
};
const marker=randomBytes(12).toString('hex');
const id='KD-'+String(randomInt(10000000,99999999));
const admin='synthetic_test_operator';
if(!raw||typeof raw!=='string'||raw.length<100){
 log('BLOCKED_TEST_CREDENTIAL_MISSING');process.exitCode=2;
}else{
 let acct=null,app=null,db=null,phase='credential';
 const created=[];
 try{
  acct=JSON.parse(raw);
  if(acct.project_id!==PROJECT||acct.type!=='service_account')
   throw Error('test_project_guard');
  phase='initialize_test_app';
  app=initializeApp({credential:cert(acct),projectId:PROJECT},'legacy-test-'+marker);
  db=getFirestore(app);
  // Cleanup any orphaned audit markers from an earlier failed TEST smoke.
  // Never touch real order audits: require the unique synthetic actor, a
  // recent timestamp, the exact synthetic transition and no corresponding
  // order, tracking, or lifecycle document in the TEST project.
  phase='cleanup_previous_synthetic_test_audits';
  let orphanRemoved=0;
  const previous=await db.collection('legacy_admin_status_audit')
   .where('actorUid','==',admin).limit(50).get();
  for(const candidate of previous.docs){
   const d=candidate.data()||{};
   if(!/^KD-[0-9]{8}_preparing$/.test(candidate.id)||
      d.kind!=='legacy_admin_status_only'||d.moneyOrStockChanged!==false||
      d.from!=='new'||d.to!=='preparing'||d.actorUid!==admin||
      !Number.isFinite(Date.parse(d.at||''))||
      Date.now()-Date.parse(d.at)>6*3600000||Date.now()-Date.parse(d.at)<0)
    continue;
   const olderId=candidate.id.slice(0,-'_preparing'.length);
   const [oldOrder,oldTracking,oldLedger]=await Promise.all([
    db.collection('orders').doc(olderId).get(),
    db.collection('tracking').doc(olderId).get(),
    db.collection('order_lifecycle').doc(olderId).get()
   ]);
   if(oldOrder.exists||oldTracking.exists||oldLedger.exists)continue;
   await candidate.ref.delete();orphanRemoved++;
  }
  log('ISOLATED_OLD_SYNTHETIC_ORPHAN_AUDITS_CLEANED_'+orphanRemoved);
  phase='query_synthetic_collision';
  const order=db.collection('orders').doc(id);
  const tracking=db.collection('tracking').doc(id);
  const audit=db.collection('legacy_admin_status_audit').doc(id+'_preparing');
  // Refuse to collide with any existing TEST data, even though order ID is random.
  for(const ref of [order,tracking,audit]){
   if((await ref.get()).exists)throw Error('synthetic_id_collision');
  }
  // Track audit for cleanup BEFORE the status change, even if verification
  // fails after the commit returned successfully.
  created.push({ref:audit,kind:'audit'});
  // Real Firestore types expose regression in naive full-document REST rewrites.
  const originalTimestamp=Timestamp.fromDate(new Date('2026-10-29T08:45:00.000Z'));
  const originalLocation=new GeoPoint(25.125,55.25);
  const base={id,status:'new',payment:'cod',paymentStatus:'unverified_legacy',
   testOnly:true,testMarker:marker,items:[{id:'synthetic_no_stock',qty:1}],total:1,
   originalTimestamp,originalLocation};
  phase='create_synthetic_order';
  await order.create(base);created.push({ref:order,kind:'fixture'});
  phase='create_synthetic_tracking';
  await tracking.create({id,status:'new',testOnly:true,testMarker:marker});
  created.push({ref:tracking,kind:'fixture'});
  phase='configure_rest_transaction';
  const store=createStore(isolation);
  if(store.root!==root)throw Error('sandbox_store_root_mismatch');
  const s=legacyStatusTestService({mode:'test',projectId:PROJECT},store,isolation);
  phase='run_legacy_rest_transaction';
  const outcome=await s.change(id,'preparing',{kind:'admin',uid:admin});
  if(outcome.status!=='preparing'||outcome.unchanged!==false)
   throw Error('atomic_update_not_confirmed');
  phase='verify_synthetic_transaction';
  const [afterOrder,afterTracking,afterAudit,ledger]=await Promise.all([
   order.get(),tracking.get(),audit.get(),db.collection('order_lifecycle').doc(id).get()
  ]);
  const checks={
   ORDER_PREPARING:afterOrder.data()?.status==='preparing',
   TRACKING_PREPARING:afterTracking.data()?.status==='preparing',
   REST_TIMESTAMP_PRESERVED:afterOrder.data()?.originalTimestamp?.isEqual(originalTimestamp)===true,
   REST_GEO_PRESERVED:afterOrder.data()?.originalLocation?.latitude===originalLocation.latitude&&
     afterOrder.data()?.originalLocation?.longitude===originalLocation.longitude,
   HISTORICAL_ITEMS_PRESERVED:afterOrder.data()?.items?.[0]?.id==='synthetic_no_stock'&&
     afterOrder.data()?.items?.[0]?.qty===1,
   PAYMENT_FIELDS_PRESERVED:afterOrder.data()?.paymentStatus==='unverified_legacy',
   AUDIT_EXISTS:afterAudit.exists,
   AUDIT_ACTOR_VALID:afterAudit.data()?.actorUid===admin,
   AUDIT_NO_MONEY_STOCK:afterAudit.data()?.moneyOrStockChanged===false,
   LEDGER_ABSENT:!ledger.exists
  };
  for(const [name,ok] of Object.entries(checks))
   log('SAFE_CHECK_'+name+': '+(ok?'PASS':'FAIL'));
  if(Object.values(checks).some(x=>!x))
   throw Error('atomic_status_or_audit_invalid');
  log('ATOMIC_TEST_STATUS_AND_IMMUTABLE_AUDIT_PASS');
  phase='verify_idempotent_noop';
  const second=await s.change(id,'preparing',{kind:'admin',uid:admin});
  if(second.unchanged!==true)throw Error('idempotent_noop_not_detected');
  log('REPEAT_STATUS_NO_DUPLICATE_WRITE_PASS');
 }catch{
  log('SMOKE_BLOCKED_OR_FAILED_NO_PRIVATE_DETAILS_AT_'+phase.toUpperCase());
  process.exitCode=2;
 }finally{
  let clean=true;
  // Remove ONLY synthetic documents of this exact newly-generated marker.
  // Never delete anything if the proof is missing or the path changed.
  if(db)for(const {ref,kind} of [...created].reverse()){
   try{
    const snap=await ref.get();
    if(!snap.exists)continue;
    const d=snap.data()||{};
    const safe=kind==='fixture'?(d.testOnly===true&&d.testMarker===marker):
      (kind==='audit'&&d.kind==='legacy_admin_status_only'&&
       d.actorUid===admin&&d.orderId===id);
    if(!safe){clean=false;continue;}
    await ref.delete();
   }catch{clean=false;}
  }
  log(clean?'SYNTHETIC_DOCUMENTS_REMOVED':'CLEANUP_REQUIRES_TEST_ONLY_REVIEW');
  if(!clean)process.exitCode=2;
  if(app)await deleteApp(app).catch(()=>{});
  log('PRODUCTION_ORDERS_STOCK_LIVE_STRIPE_ZIINA_UNCHANGED');
 }
}
