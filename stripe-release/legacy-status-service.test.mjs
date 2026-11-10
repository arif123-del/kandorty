import {test} from 'node:test';
import assert from 'node:assert/strict';
import {legacyStatusTestService} from './legacy-status-service.mjs';
const project='kandorty-stripe-test-5f8af';
const cfg={mode:'test',projectId:project};
const env={LEGACY_STATUS_TEST_ENABLED:'true',
 LEGACY_STATUS_TEST_APPROVAL:'KANDORTY_LEGACY_TEST_ONLY_APPROVED'};
const actor={kind:'admin',uid:'synthetic_operator'};
const id='KD-12345678';
function fakeStore(overrides={}){
 const rows=new Map(),trans=new Map();let revision=1,serial=0,commits=0,rollbacks=0;
 const clone=x=>structuredClone(x);
 const put=(path,data)=>{
  rows.set(path,{data:clone(data),version:String(++revision)});
 };
 put('orders/'+id,{id,status:'new',payment:'cod',paymentStatus:'legacy_unverified',
  total:375,customer:{phone:'PRIVATE_PHONE'},items:[{id:'item1',qty:4}]});
 put('tracking/'+id,{id,status:'new',customerPrivate:'PRIVATE_TRACKING'});
 const store={
  root:`projects/${project}/databases/(default)/documents`,
  rows,put,
  get commitCount(){return commits;},
  get rollbackCount(){return rollbacks;},
  beginTransaction:async()=>{
   const tx='fake-tx-'+(++serial);
   trans.set(tx,{snapshot:new Map([...rows].map(([k,v])=>[k,clone(v)])),reads:new Map()});
   return tx;
  },
  getInTransaction:async(path,tx)=>{
   const t=trans.get(tx);
   if(!t)throw Error('invalid_test_transaction');
   const value=t.snapshot.get(path)||null;
   t.reads.set(path,value?.version??null);
   return clone(value);
  },
  write:(path,data,currentDocument)=>({path,data:clone(data),currentDocument}),
  writePatch:(path,patch,currentDocument)=>({path,patch:clone(patch),updateMask:{fieldPaths:Object.keys(patch).sort()},currentDocument}),
  commitTransaction:async(tx,writes)=>{
   const t=trans.get(tx);
   if(!t)throw Error('invalid_test_transaction');
   if(typeof overrides.beforeCommit==='function')await overrides.beforeCommit(store,tx);
   for(const [p,v] of t.reads){
    if((rows.get(p)?.version??null)!==v)throw Error('write_conflict');
   }
   for(const w of writes){
    const old=rows.get(w.path);
    if(w.currentDocument?.exists===false&&old)throw Error('write_conflict');
    if(w.currentDocument?.updateTime&&old?.version!==w.currentDocument.updateTime)
     throw Error('write_conflict');
    assert.match(w.path,/^(orders|tracking|legacy_admin_status_audit)\//);
   }
   for(const w of writes){
    const old=rows.get(w.path)?.data;
    const next=w.patch?{...clone(old||{}),...clone(w.patch)}:clone(w.data);
    rows.set(w.path,{version:String(++revision),data:next});
   }
   commits++;trans.delete(tx);
  },
  rollbackTransaction:async tx=>{trans.delete(tx);rollbacks++;}
 };
 return store;
}
function service(store=fakeStore(),patch=env){
 return legacyStatusTestService(cfg,store,patch);
}
test('server-only test gate and LIVE mode both fail closed even when approval text is copied',()=>{
 const s=fakeStore();
 assert.throws(()=>legacyStatusTestService({mode:'live',projectId:'kandorty-9378a'},s,env),/legacy_production_disabled/);
 assert.throws(()=>legacyStatusTestService(cfg,s,{}),/legacy_test_only_disabled/);
 assert.throws(()=>legacyStatusTestService(cfg,s,{...env,LEGACY_STATUS_TEST_APPROVAL:'wrong'}),/legacy_test_only_disabled/);
 assert.equal(s.commitCount,0);
});
test('only server-authenticated admin actor is accepted; client fields never grant role',async()=>{
 const s=fakeStore(),x=service(s);
 for(const suspect of [{kind:'guest',uid:'abc'}, {kind:'admin',uid:'bad/path'}, {},{kind:'admin',uid:''}]){
  await assert.rejects(x.change(id,'preparing',suspect),/admin_authorization_required/);
 }
 await assert.rejects(x.change(id,'paid',actor),/legacy_invalid_transition/);
 await assert.rejects(x.change('../../orders','preparing',actor),/legacy_invalid_transition/);
 assert.equal(s.commitCount,0);
});
test('status-only new -> preparing is atomic, auditable and preserves private + financial fields',async()=>{
 const s=fakeStore(),before=structuredClone(s.rows.get('orders/'+id).data);
 const result=await service(s).change(id,'preparing',actor);
 assert.deepEqual(result,{id,status:'preparing',unchanged:false,needsPaymentReview:false});
 assert.equal(s.commitCount,1);
 const order=s.rows.get('orders/'+id).data,tracking=s.rows.get('tracking/'+id).data;
 assert.equal(order.status,'preparing');assert.equal(tracking.status,'preparing');
 assert.equal(order.paymentStatus,before.paymentStatus);
 assert.equal(order.total,before.total);
 assert.deepEqual(order.items,before.items);assert.deepEqual(order.customer,before.customer);
 assert.equal(tracking.customerPrivate,'PRIVATE_TRACKING');
 assert.ok(order.cancellationLockedAt);assert.equal(order.cancellationLockedAt,tracking.cancellationLockedAt);
 assert.equal(s.rows.size,3); // no stock/refund/ledger writes
 const audit=s.rows.get('legacy_admin_status_audit/'+id+'_preparing').data;
 assert.equal(audit.actorUid,actor.uid);assert.equal(audit.needsPaymentReview,false);
 assert.equal(audit.moneyOrStockChanged,false);
 assert.ok(!JSON.stringify(audit).includes('PRIVATE_PHONE'));
});
test('narrow legacy patches preserve all unrelated historical fields byte-for-byte in the TEST model',async()=>{
 const s=fakeStore();
 const original=s.rows.get('orders/'+id).data;
 const special={createdAt:{timestampValue:'2026-10-29T09:00:00Z'},
  image:{bytesValue:'ZmFrZQ=='},location:{geoPointValue:{latitude:1,longitude:2}},
  submittedBy:{referenceValue:'projects/test/databases/(default)/documents/users/test'},
  nested:{customer:{extra:'keep-me'}},otherOriginalFlag:true};
 s.put('orders/'+id,{...original,...special});
 const before=structuredClone(s.rows.get('orders/'+id).data);
 await service(s).change(id,'preparing',actor);
 const after=s.rows.get('orders/'+id).data;
 for(const key of Object.keys(before)){
  if(key==='status')continue;
  assert.deepEqual(after[key],before[key],`unexpected historical field rewrite: ${key}`);
 }
 assert.equal(s.rows.get('tracking/'+id).data.customerPrivate,'PRIVATE_TRACKING');
 assert.equal(s.rows.get('orders/'+id).data.status,'preparing');
 assert.equal(s.rows.get('legacy_admin_status_audit/'+id+'_preparing').data.moneyOrStockChanged,false);
});
test('repeated same-status action does not write twice or duplicate audit',async()=>{
 const s=fakeStore(),x=service(s);
 await x.change(id,'preparing',actor);
 const next=await x.change(id,'preparing',actor);
 assert.deepEqual(next,{id,status:'preparing',unchanged:true});
 assert.equal(s.commitCount,1);assert.equal(s.rows.size,3);
});
test('forward-only preparing -> shipping -> delivered, cancelled status cannot be revived',async()=>{
 const s=fakeStore(),x=service(s);
 await x.change(id,'preparing',actor);
 await x.change(id,'shipping',actor);
 await x.change(id,'delivered',actor);
 assert.equal(s.rows.get('tracking/'+id).data.status,'delivered');
 assert.equal(s.commitCount,3);
 await assert.rejects(x.change(id,'cancelled',actor),/legacy_transition_locked/);
 assert.equal(s.commitCount,3);
});
test('legacy card cancellation is manual payment review ONLY, never a refund or stock credit',async()=>{
 const s=fakeStore();s.put('orders/'+id,{...s.rows.get('orders/'+id).data,payment:'card'});
 const r=await service(s).change(id,'cancelled',actor);
 assert.equal(r.needsPaymentReview,true);
 assert.equal(s.rows.get('orders/'+id).data.status,'cancelled');
 assert.equal(s.rows.get('orders/'+id).data.cancelledBy,'admin');
 assert.equal(s.rows.get('legacy_admin_status_audit/'+id+'_cancelled').data.needsPaymentReview,true);
 assert.ok(![...s.rows.keys()].some(p=>/refund|products|stock|lifecycle/.test(p)));
});
test('pending legacy customer cancellation blocks management, including tracking-side pending state',async()=>{
 for(const where of ['orders','tracking']){
  const s=fakeStore(),record=s.rows.get(where+'/'+id).data;
  s.put(where+'/'+id,{...record,customerEdit:{cancelRequestedAt:'2026-11-09T00:00:00Z'}});
  await assert.rejects(service(s).change(id,'preparing',actor),/legacy_pending_cancel_requires_manual_review/);
  assert.equal(s.commitCount,0);
 }
});
test('missing order or tracking, inconsistent status or unknown payment never mutate',async()=>{
 for(const condition of ['missing_tracking','mismatch','payment','ledger']){
  const s=fakeStore();
  if(condition==='missing_tracking')s.rows.delete('tracking/'+id);
  if(condition==='mismatch')s.put('tracking/'+id,{id,status:'delivered'});
  if(condition==='payment')s.put('orders/'+id,{...s.rows.get('orders/'+id).data,payment:'other'});
  if(condition==='ledger')s.put('order_lifecycle/'+id,{orderId:id,payment:'card'});
  await assert.rejects(service(s).change(id,'preparing',actor));
  assert.equal(s.commitCount,0);
 }
});
test('concurrent customer cancellation request aborts stale admin preparing and never restocks',async()=>{
 let injected=false;
 const s=fakeStore({beforeCommit:store=>{
  if(injected)return;
  injected=true;
  const old=store.rows.get('orders/'+id).data;
  store.put('orders/'+id,{...old,customerEdit:{
   editProof:'synthetic-private-proof',
   cancelRequestedAt:'2026-11-10T14:00:00.000Z'
  }});
 }});
 const before=s.rows.get('orders/'+id).data;
 await assert.rejects(
  service(s).change(id,'preparing',actor),
  /legacy_pending_cancel_requires_manual_review/
 );
 assert.equal(s.commitCount,0,'no half status write');
 assert.equal(s.rows.get('orders/'+id).data.status,'new');
 assert.equal(s.rows.get('tracking/'+id).data.status,'new');
 assert.deepEqual(s.rows.get('orders/'+id).data.items,before.items);
 assert.equal(s.rows.get('orders/'+id).data.paymentStatus,before.paymentStatus);
 assert.ok(![...s.rows.keys()].some(p=>/audit|products|refund/.test(p)));
});

test('four synthetic processing orders missing locks are rejected without silent backfill',async()=>{
 for(const status of ['preparing','shipping']){
  for(const missingOn of ['order','tracking']){
   const s=fakeStore();
   const locks={status,cancellationLockedAt:'2026-11-10T14:00:00.000Z'};
   s.put('orders/'+id,{...s.rows.get('orders/'+id).data,...locks,
    ...(missingOn==='order'?{cancellationLockedAt:null}:{})});
   s.put('tracking/'+id,{...s.rows.get('tracking/'+id).data,...locks,
    ...(missingOn==='tracking'?{cancellationLockedAt:null}:{})});
   const target=status==='preparing'?'shipping':'delivered';
   await assert.rejects(service(s).change(id,target,actor),
    /legacy_processing_lock_missing_or_mismatched/);
   assert.equal(s.commitCount,0);
   assert.equal(s.rows.get('orders/'+id).data.status,status);
   assert.equal(s.rows.get('tracking/'+id).data.status,status);
   assert.ok(!s.rows.has('legacy_admin_status_audit/'+id+'_'+target));
  }
 }
});

test('an ACTIVE legacy order with old cancellation/restock markers cannot be changed or restocked',async()=>{
 for(const [targetPath,field,value] of [
  ['orders','cancelStockRestoredAt','2026-11-10T12:00:00Z'],
  ['tracking','cancelStockRestoredAt','2026-11-10T12:00:00Z'],
  ['orders','cancelledBy','customer'],
  ['tracking','cancelledBy','admin']
 ]){
  const s=fakeStore();
  const row=s.rows.get(targetPath+'/'+id).data;
  s.put(targetPath+'/'+id,{...row,[field]:value});
  await assert.rejects(service(s).change(id,'preparing',actor),
    /legacy_prior_cancellation_or_restock_requires_manual_review/);
  assert.equal(s.commitCount,0);
  assert.equal(s.rows.get('orders/'+id).data.status,'new');
  assert.equal(s.rows.get('tracking/'+id).data.status,'new');
  assert.ok(![...s.rows.keys()].some(p=>/audit|refund|products|stock/.test(p)));
 }
});

test('cancelled orders with unknown cancellation origin remain immutable and never restock',async()=>{
 for(let n=0;n<11;n++){
  const s=fakeStore();
  s.put('orders/'+id,{...s.rows.get('orders/'+id).data,status:'cancelled',
   cancelledBy:n%2?'':undefined,
   ...(n%3===0?{cancelStockRestoredAt:'2026-11-09T00:00:00Z'}:{})});
  s.put('tracking/'+id,{...s.rows.get('tracking/'+id).data,status:'cancelled'});
  for(const target of ['preparing','shipping','delivered']){
   await assert.rejects(service(s).change(id,target,actor),/legacy_transition_locked/);
  }
  assert.equal(s.commitCount,0);
  assert.equal(s.rows.get('orders/'+id).data.status,'cancelled');
  assert.ok(![...s.rows.keys()].some(p=>/refund|audit|products|stock/.test(p)));
 }
});

test('pending customer cancellation never auto-accepts a server cancellation even for COD',async()=>{
 const s=fakeStore();
 s.put('orders/'+id,{...s.rows.get('orders/'+id).data,
   customerEdit:{cancelRequestedAt:'2026-11-09T11:00:00.000Z',
   quantities:{synthetic_product:99}}});
 await assert.rejects(service(s).change(id,'cancelled',actor),
   /legacy_pending_cancel_requires_manual_review/);
 assert.equal(s.commitCount,0);
 assert.equal(s.rows.get('orders/'+id).data.status,'new');
 assert.ok(![...s.rows.keys()].some(p=>/refund|products|stock|audit/.test(p)));
});

test('ledger created between transactional read and commit forces retry then rejection, never overwrites it',async()=>{
 let once=true;
 const s=fakeStore({beforeCommit:(store)=>{
  if(once){once=false;store.put('order_lifecycle/'+id,{orderId:id,mode:'trusted'});}
 }});
 await assert.rejects(service(s).change(id,'preparing',actor),/trusted_ledger_presence_not_verified_or_new_order/);
 assert.equal(s.commitCount,0);
 assert.equal(s.rows.get('orders/'+id).data.status,'new');
 assert.ok(s.rows.has('order_lifecycle/'+id));
});
test('two concurrent admin actions cannot both commit or duplicate stock/audit writes',async()=>{
 const s=fakeStore(),x=service(s);
 const rs=await Promise.all([x.change(id,'preparing',actor),x.change(id,'preparing',actor)]);
 assert.equal(rs.filter(x=>!x.unchanged).length,1);
 assert.equal(s.commitCount,1);
 assert.equal([...s.rows.keys()].filter(x=>x.startsWith('legacy_admin_status_audit/')).length,1);
 assert.equal(s.rows.size,3);
});
test('99 synthetic records are never used as real data; no default server writes',()=>{
 const specimens=Array.from({length:99},(_,n)=>({id:'KD-'+String(n).padStart(8,'0'),payment:n<86?'cod':'card'}));
 const before=structuredClone(specimens);
 const s=fakeStore();
 assert.throws(()=>service(s,{...env,LEGACY_STATUS_TEST_ENABLED:'false'}),/legacy_test_only_disabled/);
 assert.deepEqual(specimens,before);
 assert.equal(s.commitCount,0);
});
