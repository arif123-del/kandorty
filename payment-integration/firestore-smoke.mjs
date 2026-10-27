// Real isolated Firestore + simulated provider API evidence; NEVER real paid-proof.
import assert from 'node:assert/strict';
import {createStore} from '../cod-staging/firestore.mjs';
import {random} from '../cod-staging/security.mjs';
import {handler} from '../cod-staging/worker.mjs';
import {pricedSnapshot,bindPayment} from './snapshot.mjs';
import {settle} from './settlement.mjs';
import {request,evidence} from './fixtures.mjs';
const env={...process.env,COD_MODE:'test',IP_LIMITER:{limit:async()=>({success:true})},PHONE_LIMITER:{limit:async()=>({success:true})}};
const store=createStore(env);
const base='https://kandorty-cod-orders-test.aliyajan200011.workers.dev';
const http=body=>new Request(base+'/cod/orders',{method:'POST',headers:{'Content-Type':'application/json','X-Staging-Key':env.STAGING_ACCESS_SECRET},body:JSON.stringify(body)});
for(const stock of [3,1]){
 const id='joint-sim-'+random(10);
 await store.commit([store.write('products/'+id,{price:10,stock,totalStock:stock,nameAr:'SIMULATED PROVIDER TEST ONLY'},{exists:false})]);
 const cases=[];
 for(const provider of ['stripe','ziina']){
  const s=await pricedSnapshot(store,request(id),provider),p=evidence(s),snapshot=await bindPayment(store,s,p);
  cases.push({s:snapshot,p,run:()=>settle({env,store,provider,checkoutId:s.checkoutId,fetchPayment:async()=>p})});
 }
 const cod=handler(()=>store),codRequest=request(id);
 const results=await Promise.all([cases[0].run(),cases[0].run(),cases[1].run(),cases[1].run(),cod(http(codRequest),env)]);
 assert.equal((await store.get('products/'+id)).data.stock,0);
 const orders=await Promise.all(cases.map(async c=>(await store.get('orders/'+c.s.orderId)).data));
 assert.ok(orders.every(o=>o.verificationEvidence==='simulated_provider'));
 const cr=await results[4].json();if(results[4].status===201)orders.push((await store.get('orders/'+cr.order.id)).data);else assert.equal(results[4].status,409);
 assert.equal(orders.reduce((n,o)=>n+(o.stockDebits[id]||0),0),stock);
 assert.equal(orders.filter(o=>o.paymentStatus==='paid').length,2);
 for(const c of cases){assert.ok(await store.get('payment_claims/'+c.s.paymentClaimId));assert.ok(await store.get('tracking/'+c.s.orderId));assert.equal((await c.run()).replay,true);}
 console.log('PASS: REAL test Firestore, SIMULATED Stripe/Ziina evidence, COD shared stock='+stock+', retries, atomic markers and paid shortage review.');
}
