// Kandorty Stage 4 — isolated synthetic Firestore restore rehearsal.
// Requires FIRESTORE_EMULATOR_HOST, a hardcoded demo-only project and fake data.
// NEVER load a real owner backup, service account, cloud project or payment key.
// No production Firebase / Stripe / stock / admin writes are authorized.
import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp, deleteApp} from 'firebase-admin/app';
import {getFirestore, Timestamp, GeoPoint} from 'firebase-admin/firestore';

const DEMO = 'demo-kandorty-legacy-rehearsal';
const emulator = process.env.FIRESTORE_EMULATOR_HOST || '';
const project = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || '';
const forbidden = ['GOOGLE_APPLICATION_CREDENTIALS','FIREBASE_SERVICE_ACCOUNT_JSON',
  'STRIPE_SECRET_KEY','STRIPE_TEST_SERVICE_ACCOUNT_JSON'];
const allow = () => {
  assert.equal(project, DEMO, 'synthetic_rehearsal_demo_project_only');
  assert.match(emulator,/^(127\.0\.0\.1|localhost):[0-9]{2,5}$/,'local_firestore_emulator_required');
  for(const key of forbidden) assert.equal(process.env[key]||'', '', 'no_credentials_allowed_'+key);
};

function statusFor(i) {
  return i < 78 ? 'new' : i < 80 ? 'preparing'
    : i < 82 ? 'shipping' : i < 85 ? 'delivered' : 'cancelled';
}
const orderCode=i=>'KD-'+String(i+1).padStart(8,'0');

function syntheticSnapshot(db) {
  const docs=[];
  // All strings and values below are invented; no user/order data is read.
  for(let i=0;i<99;i++){
    const id=orderCode(i), status=statusFor(i), cancelled=status==='cancelled';
    const isLockGap=i>=78&&i<82;
    const unknownCancelledOrigin=i>=88 && i<99;
    const stockMarker=i>=88&&i<91;
    const pending=i<3;
    const fields={
      id, status, payment:i<86?'cod':'card',
      createdAt:Timestamp.fromDate(new Date('2026-10-15T12:34:56.000Z')),
      location:new GeoPoint(25.2,55.27),
      syntheticBlob:Buffer.from('synthetic-no-real-customer','utf8'),
      amountFils:3500,
      customer:{name:'SYNTHETIC_ONLY',city:'TEST',
        // No personally identifying telephone, real address or payment data.
        note:'not a real shopper'},
      items:[{productId:'FAKE_TEST_ITEM',qty:2}],
      reference:db.doc('testing_only/synthetic_anchor')
    };
    if(pending) fields.customerEdit={cancelRequestedAt:'2026-10-16T00:00:00Z'};
    if(cancelled && !unknownCancelledOrigin) fields.cancelledBy=i===85?'customer':'admin';
    if(stockMarker) fields.cancelStockRestoredAt='2026-10-17T00:00:00Z';
    // Four processing cases omit locks, as in the owner aggregate (synthetic IDs).
    if((status==='preparing'||status==='shipping')&&!isLockGap)
      fields.cancellationLockedAt='2026-10-16T00:00:00Z';
    docs.push({collection:'orders',id,fields});
    docs.push({collection:'tracking',id,fields:{
      id,status,updatedAt:'2026-10-16T00:00:00Z',
      ...(fields.cancellationLockedAt?{cancellationLockedAt:fields.cancellationLockedAt}:{})
    }});
  }
  for(let i=0;i<28;i++) {
    const id='SYNTHETIC_EDIT_'+i;
    docs.push({collection:'order_edits',id,fields:{
      kind:'synthetic_only',timestamp:Timestamp.fromMillis(1760000000000+i)}});
    docs.push({collection:'order_access',id,fields:{
      marker:'synthetic_only',used:false}});
  }
  assert.equal(docs.length,254);
  assert.equal(docs.filter(x=>x.collection==='orders').length,99);
  assert.equal(docs.filter(x=>x.collection==='tracking').length,99);
  assert.ok(!docs.some(x=>x.collection==='order_lifecycle'));
  return docs;
}

function normalize(v){
  if(Buffer.isBuffer(v))return {bytes:v.toString('base64')};
  if(v instanceof Timestamp)return {seconds:v.seconds,nanoseconds:v.nanoseconds};
  if(v instanceof GeoPoint)return {geo:[v.latitude,v.longitude]};
  if(v && typeof v==='object' && typeof v.path==='string'
      && typeof v.firestore==='object' && typeof v.id==='string')
    return {reference:v.path};
  if(Array.isArray(v))return v.map(normalize);
  if(v && typeof v==='object')
    return Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))
      .map(([k,value])=>[k,normalize(value)]));
  return v;
}

test('254 synthetic Firestore documents restore exactly into a local emulator; no credentials',async()=>{
  allow();
  const app=initializeApp({projectId:DEMO},'isolated-stage4-rehearsal');
  const db=getFirestore(app);
  try{
    const records=syntheticSnapshot(db);
    const batch=db.batch();
    for(const {collection,id,fields} of records)
      batch.set(db.collection(collection).doc(id),fields);
    await batch.commit(); // emulator only: gate above must pass first
    const byCollection={orders:[],tracking:[],order_edits:[],order_access:[],order_lifecycle:[]};
    for(const collection of Object.keys(byCollection)){
      const result=await db.collection(collection).get();
      byCollection[collection]=result.docs;
    }
    assert.equal(byCollection.orders.length,99);
    assert.equal(byCollection.tracking.length,99);
    assert.equal(byCollection.order_edits.length,28);
    assert.equal(byCollection.order_access.length,28);
    assert.equal(byCollection.order_lifecycle.length,0);
    let verified=0;
    for(const row of records) {
      const doc=byCollection[row.collection].find(x=>x.id===row.id);
      assert.ok(doc,'missing_synthetic_emulator_document');
      assert.deepEqual(normalize(doc.data()),normalize(row.fields),
        'typed_firestore_data_roundtrip_failed');
      verified++;
    }
    const statusCounts={new:0,preparing:0,shipping:0,delivered:0,cancelled:0};
    let missingLock=0, pending=0, historicalRestock=0, unknownOrigin=0;
    for(const snapshot of byCollection.orders) {
      const order=snapshot.data();
      const match=byCollection.tracking.find(x=>x.id===snapshot.id);
      assert.ok(match);
      assert.equal(match.data().status,order.status);
      statusCounts[order.status]++;
      if(['preparing','shipping','delivered'].includes(order.status) &&
          (!order.cancellationLockedAt||!match.data().cancellationLockedAt))
        missingLock++;
      if(order.customerEdit?.cancelRequestedAt)pending++;
      if(order.cancelStockRestoredAt)historicalRestock++;
      if(order.status==='cancelled'&&!['admin','customer'].includes(order.cancelledBy))
        unknownOrigin++;
    }
    assert.deepEqual(statusCounts,{new:78,preparing:2,shipping:2,delivered:3,cancelled:14});
    assert.deepEqual({missingLock,pending,historicalRestock,unknownOrigin},
      {missingLock:4,pending:3,historicalRestock:3,unknownOrigin:11});
    console.log('SYNTHETIC_EMULATOR_ONLY_RESTORED_DOCUMENTS:',verified);
    console.log('ORDER_AND_TRACKING_MATCHING_STATUS:',99);
    console.log('SYNTHETIC_18_CASE_RISK_FLAGS: PASS');
    console.log('FIRESTORE_RESTORE_REHEARSAL_SYNTHETIC_EMULATOR: PASS');
    console.log('REAL_BACKUP_AND_PRODUCTION_RESTORE: NOT_TESTED');
    console.log('PRODUCTION_FIREBASE_OR_PAYMENT_WRITES: NONE');
  }finally{
    await deleteApp(app);
  }
});
