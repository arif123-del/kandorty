import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handler,PROJECT} from './worker.mjs';
import {Fault,receipt,verifyReceipt} from './security.mjs';
import {unpack,createStore} from './firestore.mjs';
const base='https://kandorty-cod-orders-test.aliyajan200011.workers.dev';
const env=()=>({COD_MODE:'test',STRIPE_TEST_PROJECT_ID:PROJECT,STAGING_ACCESS_SECRET:'a'.repeat(64),GUEST_RECEIPT_SECRET:'b'.repeat(64),IP_LIMITER:{limit:async()=>({success:true})},PHONE_LIMITER:{limit:async()=>({success:true})}});
function fixture(stock=5){
 const rows=new Map();let version=0,commits=0;
 const put=(p,data)=>rows.set(p,{data,version:'2026-10-27T00:00:00.'+String(++version).padStart(6,'0')+'Z'});
 put('products/p1',{price:10,stock,nameAr:'TEST'});
 const store={get:async p=>structuredClone(rows.get(p)||null),commit:async writes=>{
  for(const w of writes){const path=w.update.name.split('/documents/')[1],old=rows.get(path),c=w.currentDocument;
   if(c.exists===false&&old||c.updateTime&&c.updateTime!==old?.version)throw new Fault('write_conflict',409);
  }
  for(const w of writes){const p=w.update.name.split('/documents/')[1],data=unpack({mapValue:{fields:w.update.fields}});put(p,w.updateMask?{...rows.get(p).data,...data}:data);}commits++;
 }};
 const run=handler(()=>store),e=env();
 const request=(body,headers={})=>new Request(base+'/cod/orders',{method:'POST',headers:{'Content-Type':'application/json','X-Staging-Key':e.STAGING_ACCESS_SECRET,...headers},body:JSON.stringify(body)});
 const input=(token='c')=>({checkoutToken:token.repeat(64),payment:'cod',customer:{name:'TEST',phone:'+971500000000',city:'Dubai',location:'TEST ADDRESS'},items:[{id:'p1',qty:1}]});
 return {rows,store,run,e,request,input,commits:()=>commits};
}
test('COD API uses server price, decrements once, supports concurrent same-token recovery',async()=>{
 const f=fixture();const rs=await Promise.all(Array.from({length:4},()=>f.run(f.request(f.input()),f.e)));
 assert.ok(rs.every(r=>[200,201].includes(r.status)));
 const bodies=await Promise.all(rs.map(r=>r.json()));
 assert.equal(new Set(bodies.map(b=>b.order.id)).size,1);assert.equal(f.commits(),1);
 assert.equal(f.rows.get('products/p1').data.stock,4);assert.equal(bodies[0].order.total,35);
 assert.equal(bodies[0].order.paymentStatus,'unpaid');assert.equal(bodies[0].order.editToken,undefined);
});
test('two buyers race for last item: exactly one order wins',async()=>{
 const f=fixture(1);const rs=await Promise.all(['c','d'].map(t=>f.run(f.request(f.input(t)),f.e)));
 assert.deepEqual(rs.map(r=>r.status).sort(),[201,409]);assert.equal(f.rows.get('products/p1').data.stock,0);assert.equal(f.commits(),1);
});
test('guest receipt required, bound to order, no PII or edit authority in response',async()=>{
 const f=fixture();const b=await(await f.run(f.request(f.input()),f.e)).json();
 const get=(id,token)=>f.run(new Request(base+'/guest/orders/'+id,{headers:{'X-Staging-Key':f.e.STAGING_ACCESS_SECRET,Authorization:'Bearer '+token}}),f.e);
 assert.equal((await get(b.order.id,'bad')).status,401);
 assert.equal((await get('KD-00000000',b.receiptToken)).status,401);
 const r=await get(b.order.id,b.receiptToken);assert.equal(r.status,200);
 const text=await r.text();for(const secret of ['phone','location','editToken','checkoutToken','customer'])assert.ok(!text.includes(secret));
 assert.equal((await get(b.order.id,b.receiptToken.slice(0,-1)+'z')).status,401);
});
test('receipt expires and rejects other signing key',async()=>{
 const token=await receipt('b'.repeat(64),'KD-12345678','c'.repeat(64),1700000000000);
 await assert.rejects(verifyReceipt('b'.repeat(64),token,'KD-12345678',1700086400000),/invalid_receipt/);
 await assert.rejects(verifyReceipt('d'.repeat(64),token,'KD-12345678',1700000000000),/invalid_receipt/);
});
test('reject changed retry, browser payment and ownership claims',async()=>{
 const f=fixture();assert.equal((await f.run(f.request(f.input()),f.e)).status,201);
 assert.equal((await f.run(f.request({...f.input(),note:'changed'}),f.e)).status,409);
 for(const extra of [{paymentStatus:'paid'},{customerUid:'x'},{total:1},{payment:'card'}])assert.equal((await f.run(f.request({...f.input('d'),...extra}),f.e)).status,400);
 assert.equal(f.commits(),1);
});
test('production config, origin, missing gate, missing/denying limiter fail closed',async()=>{
 const f=fixture();
 assert.equal((await f.run(f.request(f.input()),{...f.e,STRIPE_TEST_PROJECT_ID:'kandorty-9378a'})).status,503);
 assert.equal((await f.run(f.request(f.input(),{Origin:'https://kandorty.online'}),f.e)).status,403);
 assert.equal((await f.run(f.request(f.input(),{'X-Staging-Key':''}),f.e)).status,401);
 assert.equal((await f.run(f.request(f.input()),{...f.e,IP_LIMITER:null})).status,503);
 assert.equal((await f.run(f.request(f.input()),{...f.e,PHONE_LIMITER:{limit:async()=>({success:false})}})).status,429);
 assert.equal(f.commits(),0);
});
test('oversized chunked bodies and non-JSON rejected',async()=>{
 const f=fixture();assert.equal((await f.run(f.request({...f.input(),note:'x'.repeat(17000)}),f.e)).status,413);
 assert.equal((await f.run(f.request(f.input(),{'Content-Type':'text/plain'}),f.e)).status,415);
});
test('Firestore rejects production credentials before network access',()=>{
 assert.throws(()=>createStore({STRIPE_TEST_PROJECT_ID:PROJECT,FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:'kandorty-9378a'})}),/isolated_test_project_required/);
});
test('uncertain commit timeout safely recovers on same-token retry',async()=>{
 const f=fixture(),commit=f.store.commit;let first=true;
 f.store.commit=async w=>{await commit(w);if(first){first=false;throw new Error('timeout');}};
 assert.equal((await f.run(f.request(f.input()),f.e)).status,503);
 assert.equal((await f.run(f.request(f.input()),f.e)).status,200);
 assert.equal(f.commits(),1);assert.equal(f.rows.get('products/p1').data.stock,4);
});
