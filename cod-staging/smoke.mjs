// Executes ONLY on GitHub Actions with a credential pinned to the test project.
import assert from 'node:assert/strict';
import {createStore} from './firestore.mjs';
import {random,hash} from './security.mjs';
const base='https://kandorty-cod-orders-test.aliyajan200011.workers.dev';
const store=createStore(process.env);
const headers={'Content-Type':'application/json','X-Staging-Key':process.env.STAGING_ACCESS_SECRET};
async function call(path,body,extra={}){
 const r=await fetch(base+path,{method:body?'POST':'GET',headers:{...headers,...extra},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(30000)});
 return {status:r.status,body:await r.json()};
}
// Wait only for propagation; no failing mutation is blindly retried.
let ready=false;for(let i=0;i<12;i++){
 try{const r=await call('/health');if(r.status===200&&r.body.test){ready=true;break;}}catch{}
 await new Promise(r=>setTimeout(r,5000));
}assert.ok(ready,'COD staging health not ready');
const suffix=random(8),product='cod-smoke-'+suffix,last='cod-last-'+suffix;
await store.commit([store.write('products/'+product,{nameAr:'COD TEST ONLY',price:10,stock:5,totalStock:5},{exists:false}),store.write('products/'+last,{nameAr:'COD RACE TEST ONLY',price:10,stock:1,totalStock:1},{exists:false})]);
const input=(id,token=random(32))=>({payment:'cod',checkoutToken:token,customer:{name:'TEST ONLY',phone:'+971500000000',city:'Dubai',location:'SYNTHETIC TEST ADDRESS'},items:[{id,qty:1}],note:''});
const body=input(product);
const rs=await Promise.all(Array.from({length:3},()=>call('/cod/orders',body)));
assert.ok(rs.every(r=>[200,201].includes(r.status)),'COD create/replay status');
assert.equal(new Set(rs.map(r=>r.body.order.id)).size,1,'one order for retry token');
assert.equal((await store.get('products/'+product)).data.stock,4,'exactly one stock debit');
const first=rs[0].body,id=first.order.id;
assert.equal(first.order.total,35);assert.equal(first.order.paymentStatus,'unpaid');
const saved=(await store.get('orders/'+id)).data;
assert.deepEqual(saved.stockDebits,{[product]:1});
assert.equal((await store.get('cod_checkout_intents/'+await hash(body.checkoutToken))).data.orderId,id);
assert.ok(await store.get('tracking/'+id));assert.ok(await store.get('order_edits/'+saved.editToken));
assert.ok(await store.get('order_access/'+await hash(id+'|971500000000')));
const tracked=await call('/guest/orders/'+id,null,{Authorization:'Bearer '+first.receiptToken});
assert.equal(tracked.status,200);assert.equal(tracked.body.order.id,id);
assert.equal(tracked.body.order.customer,undefined);assert.equal(tracked.body.order.editToken,undefined);
assert.equal((await call('/guest/orders/'+id)).status,401);
assert.equal((await call('/guest/orders/KD-00000000',null,{Authorization:'Bearer '+first.receiptToken})).status,401);
assert.equal((await call('/cod/orders',{...body,note:'changed'})).status,409);
assert.equal((await call('/cod/orders',{...input(product),paymentStatus:'paid'})).status,400);
const race=await Promise.all([call('/cod/orders',input(last)),call('/cod/orders',input(last))]);
assert.deepEqual(race.map(r=>r.status).sort(),[201,409]);
assert.equal((await store.get('products/'+last)).data.stock,0);
console.log('PASS: real isolated Firestore COD atomic records, 35 AED, concurrent retries, last-unit race, changed retry rejection, bound guest tracking, no PII.');
console.log('Synthetic fixtures retained under unique cod-smoke/cod-last product IDs for audit. No production data touched.');
