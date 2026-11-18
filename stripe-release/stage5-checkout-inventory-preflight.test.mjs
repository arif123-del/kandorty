import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createService} from './service.mjs';
import {CodFault} from '../stripe-live-candidate/cod.mjs';

const cfg={projectId:'kandorty-stripe-test-5f8af',live:false,mode:'test'};
function fixture(product){
 const stored=new Map();
 const metrics={sessionCreates:0,commits:0};
 const root='projects/'+cfg.projectId+'/databases/(default)/documents';
 const store={
  root,
  async get(key){
   if(key==='products/dressA')return {data:product,version:'2026-11-12T00:00:00.000001Z'};
   const row=stored.get(key);return row?{data:row,version:'2026-11-12T00:00:00.000002Z'}:null;
  },
  write(key,data,condition){return {key,data,condition};},
  async commit(writes){
   metrics.commits++;
   for(const w of writes){assert.equal(w.key.startsWith('stripe_checkout_sessions/'),true);
    stored.set(w.key,structuredClone(w.data));}
  }
 };
 const stripe={
  async create(snapshot){
   metrics.sessionCreates++;
   return {id:'cs_test_fakeABC',livemode:false,mode:'payment',status:'open',
    payment_status:'unpaid',currency:'aed',amount_total:snapshot.totalFils,
    client_reference_id:snapshot.orderId,
    metadata:{checkout_id:snapshot.checkoutId,order_id:snapshot.orderId,
     integration:'kandorty-stripe-v1'},url:'https://checkout.stripe.com/fictional_test'};
  }
 };
 const request={
  checkoutToken:'f'.repeat(64),
  customer:{name:'TEST ONLY',phone:'+971501234567',city:'Dubai',location:'TEST ADDRESS'},
  items:[{id:'dressA',qty:1,imageIndex:0}],note:''
 };
 return {store,stripe,request,metrics};
}
test('card session cannot start with unknown product stock: no Stripe charge/session or Firestore writes',async()=>{
 const values=[{}, {stock:null,totalStock:3},{stock:'',totalStock:3}];
 for(const product of values){
  const f=fixture({price:20,nameAr:'Dress',active:true,...product});
  await assert.rejects(createService(cfg,f.store,f.stripe).create(f.request),
   e=>e instanceof CodFault&&e.code==='inventory_not_configured');
  assert.equal(f.metrics.sessionCreates,0);
  assert.equal(f.metrics.commits,0);
 }
});
test('card session cannot start with unknown totalStock baseline',async()=>{
 for(const product of [{stock:2},{stock:2,totalStock:'2'},{stock:4,totalStock:3}]){
  const f=fixture({price:20,nameAr:'Dress',active:true,...product});
  await assert.rejects(createService(cfg,f.store,f.stripe).create(f.request),
   e=>e instanceof CodFault&&e.code==='inventory_total_not_configured');
  assert.equal(f.metrics.sessionCreates,0);
  assert.equal(f.metrics.commits,0);
 }
});
test('configured stock can create sandbox-only hosted checkout after server catalog verification',async()=>{
 const f=fixture({stock:2,totalStock:2,price:20,nameAr:'Dress',active:true});
 const result=await createService(cfg,f.store,f.stripe).create(f.request);
 assert.equal(result.complete,false);
 assert.ok(result.url.startsWith('https://checkout.stripe.com/'));
 assert.equal(result.snapshot.totalFils,4500);
 assert.equal(f.metrics.sessionCreates,1);
 assert.equal(f.metrics.commits,2);
 assert.equal(f.metrics.productionWrites,undefined);
});
