import {test} from 'node:test';
import assert from 'node:assert/strict';
import {preparePaidFulfillment} from './fulfillment.mjs';

// In-memory Firestore documents:commit simulator. This proves our candidate
// preconditions prevent both duplicate orders and double stock debits even
// when 2 webhook handlers read identical stale snapshots concurrently.
const v=n=>'2026-10-27T12:00:0'+n+'.000000Z';
function decode(field){
 if('integerValue' in field)return Number(field.integerValue);
 if('stringValue' in field)return field.stringValue;
 if('booleanValue' in field)return field.booleanValue;
 if('mapValue' in field)return Object.fromEntries(Object.entries(field.mapValue.fields||{}).map(([k,f])=>[k,decode(f)]));
 if('arrayValue' in field)return (field.arrayValue.values||[]).map(decode);
 return null;
}
function db(){
 const state=new Map();let versionNo=0;
 const read=name=>state.get(name)||null;
 const seed=(name,data)=>{state.set(name,{data,updateTime:v(++versionNo)});return read(name)};
 const commit=writes=>{
  for(const w of writes){
   const row=read(w.update.name),cond=w.currentDocument||{};
   if(cond.exists===false&&row)throw new Error('ALREADY_EXISTS');
   if(cond.updateTime&&(!row||row.updateTime!==cond.updateTime))throw new Error('FAILED_PRECONDITION');
  }
  for(const w of writes){
   const before=read(w.update.name)?.data||{};
   const updated=Object.fromEntries(Object.entries(w.update.fields||{}).map(([k,v])=>[k,decode(v)]));
   const combined=w.updateMask?{...before,...updated}:updated;
   state.set(w.update.name,{data:combined,updateTime:v(++versionNo)});
  }
 };
 return {seed,read,commit,state};
}
test('two simultaneous LIVE signed webhook plans can commit only once',()=>{
 const projectId='kandorty-prod-fixture';
 const root='projects/'+projectId+'/databases/(default)/documents/';
 const dbx=db();
 const checkoutId='a'.repeat(64);
 const snapshot={checkoutId,orderId:'KD-12345678',sessionId:'cs_live_demo1234',
  createdAt:v(0),totalFils:4500,note:'',
  customer:{name:'TEST ONLY',phone:'+971501234567',city:'Dubai',location:'TEST ADDRESS'},
  items:[{id:'p1',qty:2,unitAmount:1000,name:'Dress',imageIndex:0}]};
 const session={id:snapshot.sessionId,livemode:true,mode:'payment',status:'complete',
  payment_status:'paid',currency:'aed',amount_total:4500,
  client_reference_id:'KD-12345678',metadata:{checkout_id:checkoutId,order_id:'KD-12345678'}};
 const source=dbx.seed(root+'stripe_checkout_sessions/'+checkoutId,snapshot);
 const stock=dbx.seed(root+'products/p1',{stock:5,totalStock:10});
 const form={projectId,snapshot,session,snapshotVersion:source.updateTime,
  products:{p1:{data:stock.data,updateTime:stock.updateTime}},
  editToken:'c'.repeat(48),accessKey:'d'.repeat(64),nowISO:'2026-10-27T12:10:00.000Z'};
 // Both webhook handlers race after reading exactly the same version.
 const candidate1=preparePaidFulfillment(form);
 const candidate2=preparePaidFulfillment(form);
 dbx.commit(candidate1.writes);
 assert.throws(()=>dbx.commit(candidate2.writes),/ALREADY_EXISTS|FAILED_PRECONDITION/);
 assert.equal(dbx.read(root+'products/p1').data.stock,3);
 assert.equal(dbx.read(root+'orders/KD-12345678').data.paymentStatus,'paid');
 assert.equal(dbx.read(root+'stripe_checkout_sessions/'+checkoutId).data.fulfilled,true);
 assert.equal([...dbx.state.keys()].filter(k=>k.includes('/orders/')).length,1);
 // A replay after reading the saved order returns an empty plan.
 const replay=preparePaidFulfillment({...form,existingOrder:dbx.read(root+'orders/KD-12345678').data});
 assert.equal(replay.replay,true);
 assert.equal(replay.writes.length,0);
 assert.equal(dbx.read(root+'products/p1').data.stock,3);
});
test('paid but out-of-stock checkout creates paid review order without stock decrement',()=>{
 const projectId='kandorty-prod-fixture',root='projects/'+projectId+'/databases/(default)/documents/';
 const dbx=db(),id='b'.repeat(64);
 const snapshot={checkoutId:id,orderId:'KD-87654321',sessionId:'cs_live_demo2000',totalFils:4500,
  customer:{name:'TEST',phone:'+971501234567',city:'Dubai',location:'TEST'},items:[{id:'p1',qty:2,unitAmount:1000}]};
 const session={id:'cs_live_demo2000',livemode:true,mode:'payment',status:'complete',
  payment_status:'paid',currency:'aed',amount_total:4500,client_reference_id:snapshot.orderId,
  metadata:{order_id:snapshot.orderId,checkout_id:id}};
 const source=dbx.seed(root+'stripe_checkout_sessions/'+id,snapshot);
 const product=dbx.seed(root+'products/p1',{stock:1});
 const p=preparePaidFulfillment({projectId,snapshot,session,snapshotVersion:source.updateTime,
  products:{p1:{data:product.data,updateTime:product.updateTime}},
  editToken:'c'.repeat(48),accessKey:'d'.repeat(64),nowISO:'2026-10-27T12:10:00.000Z'});
 assert.equal(p.inventoryStatus,'needs_review');
 dbx.commit(p.writes);
 assert.equal(dbx.read(root+'products/p1').data.stock,1);
 assert.equal(dbx.read(root+'orders/KD-87654321').data.paymentStatus,'paid');
 assert.equal(dbx.read(root+'orders/KD-87654321').data.stockDebited,false);
});
