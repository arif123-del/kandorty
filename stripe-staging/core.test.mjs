import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto,createHmac} from 'node:crypto';
import {createService,hash,verifySignature,money,Fault} from './core.mjs';
import {createHandler,stripeClient} from './worker.mjs';
import {createStore,pack,unpack} from './firestore.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const now=1793000000000,secret='whsec_test_fixture_only';
const body=()=>({checkoutToken:'a'.repeat(64),customer:{name:'TEST ONLY',phone:'+971500000000',city:'Dubai',location:'TEST ADDRESS'},items:[{id:'p1',qty:2,imageIndex:1}],note:''});
function fixture(){
 const snapshots=new Map(),orders=new Map();let creates=0,failWrite=false;const sessions=new Map();
 const store={
  async getProduct(){return {price:'100.25',stock:20,images:['front','back'],nameAr:'Test product'};},
  async getSnapshot(id){return structuredClone(snapshots.get(id)||null);},
  async createSnapshot(id,s){if(!snapshots.has(id))snapshots.set(id,structuredClone(s));return structuredClone(snapshots.get(id));},
  async bindSession(id,sid){const s=snapshots.get(id);if(s.sessionId&&s.sessionId!==sid)throw new Fault('session_conflict',409);s.sessionId=sid;},
  async finalize(id,sid,order){if(failWrite)throw new Fault('database_unavailable',503);if(!orders.has(id)){orders.set(id,structuredClone(order));snapshots.get(id).fulfilled=true;}return structuredClone(orders.get(id));}
 };
 const stripe={async create(s){creates++;if(!sessions.has(s.id))sessions.set(s.id,{id:'cs_test_fixture',url:'https://checkout.stripe.com/fixture',mode:'payment',livemode:false,status:'complete',payment_status:'paid',client_reference_id:s.orderId,metadata:{checkout_id:s.id,order_id:s.orderId},currency:'aed',amount_total:s.total});return structuredClone(sessions.get(s.id));},async retrieve(){return structuredClone([...sessions.values()][0]);}};
 return {service:createService({store,stripe,clock:()=>now}),store,stripe,snapshots,orders,sessions,set failWrite(v){failWrite=v},get creates(){return creates}};
}
function signed(event,seconds=Math.floor(now/1000)){const raw=JSON.stringify(event);return {raw,header:`t=${seconds},v1=${createHmac('sha256',secret).update(seconds+'.'+raw).digest('hex')}`};}
const event=()=>({type:'checkout.session.completed',livemode:false,data:{object:{id:'cs_test_fixture'}}});
async function prepared(){const f=fixture();await f.service.create(body());return f;}
test('server snapshot freezes price, variant, customer and delivery before Stripe',async()=>{const f=await prepared();const s=[...f.snapshots.values()][0];assert.equal(s.total,22550);assert.equal(s.items[0].imageIndex,1);assert.equal(s.items[0].imageUrl,'back');assert.equal(s.delivery,2500);assert.equal(s.customer.name,'TEST ONLY');assert.equal(f.orders.size,0);});
test('forged client prices are ignored',async()=>{const f=fixture(),b=body();b.items[0].price=1;b.total=1;await f.service.create(b);assert.equal([...f.snapshots.values()][0].total,22550);});
test('webhook registers order without browser return or localStorage',async()=>{const f=await prepared(),e=signed(event());await f.service.webhook(e.raw,e.header,secret);assert.equal(f.orders.size,1);assert.equal([...f.orders.values()][0].total,225.5);});
test('concurrent webhook and browser retries create one order',async()=>{const f=await prepared(),e=signed(event());await Promise.all(Array.from({length:20},(_,i)=>i%2?f.service.webhook(e.raw,e.header,secret):f.service.fulfill('cs_test_fixture',body().checkoutToken)));assert.equal(f.orders.size,1);});
test('database failure is retryable and does not mark fulfilled',async()=>{const f=await prepared(),e=signed(event());f.failWrite=true;await assert.rejects(f.service.webhook(e.raw,e.header,secret),/database_unavailable/);assert.equal(f.orders.size,0);assert.ok(![...f.snapshots.values()][0].fulfilled);f.failWrite=false;await f.service.webhook(e.raw,e.header,secret);assert.equal(f.orders.size,1);});
for(const [field,value]of [['currency','usd'],['amount_total',1],['livemode',true],['client_reference_id','other'],['mode','setup'],['id','cs_test_other']])test('rejects Stripe mismatch: '+field,async()=>{const f=await prepared();[...f.sessions.values()][0][field]=value;await assert.rejects(f.service.fulfill('cs_test_fixture',body().checkoutToken));assert.equal(f.orders.size,0);});
for(const state of ['unpaid','no_payment_required'])test('does not register '+state,async()=>{const f=await prepared();[...f.sessions.values()][0].payment_status=state;assert.equal((await f.service.fulfill('cs_test_fixture',body().checkoutToken)).registered,false);assert.equal(f.orders.size,0);});
test('wrong browser receipt cannot read/fulfill another order',async()=>{const f=await prepared();await assert.rejects(f.service.fulfill('cs_test_fixture','b'.repeat(64)),/forbidden/);assert.equal(f.orders.size,0);});
test('same receipt with changed cart is rejected',async()=>{const f=await prepared(),b=body();b.items[0].qty=3;await assert.rejects(f.service.create(b),/checkout_conflict/);});
test('same receipt retains original server price after catalog changes',async()=>{const f=await prepared();f.store.getProduct=async()=>({price:200,stock:20});await f.service.create(body());assert.equal([...f.snapshots.values()][0].total,22550);assert.equal(f.snapshots.size,1);});
for(const qty of [-1,0,1.5,100,'2'])test('rejects malformed quantity '+qty,async()=>{const f=fixture(),b=body();b.items[0].qty=qty;await assert.rejects(f.service.create(b),/invalid_quantity/);assert.equal(f.creates,0);});
test('aggregate variants cannot exceed product stock',async()=>{const f=fixture(),b=body();b.items=[{id:'p1',qty:11,imageIndex:0},{id:'p1',qty:11,imageIndex:1}];await assert.rejects(f.service.create(b),/insufficient_stock/);});
test('invalid image variant rejected',async()=>{const f=fixture(),b=body();b.items[0].imageIndex=7;await assert.rejects(f.service.create(b),/invalid_variant/);});
test('tampered webhook body rejected',async()=>{const e=signed(event());await assert.rejects(verifySignature(e.raw+' ',e.header,secret,now),/invalid_signature/);});
test('stale signature rejected; rotated signature accepted',async()=>{const e=signed(event(),Math.floor(now/1000)-301);await assert.rejects(verifySignature(e.raw,e.header,secret,now),/stale_signature/);const good=signed(event());await verifySignature(good.raw,good.header+',v1='+'0'.repeat(64),secret,now);});
test('Stripe creation supplies stable idempotency key and frozen return URL',async()=>{const f=await prepared(),s={...[...f.snapshots.values()][0],returnBase:'https://test.example'};const calls=[];const client=stripeClient('sk_test_fixture',async(u,o)=>{calls.push(o);return Response.json({})});await client.create(s);await client.create(s);assert.equal(calls[0].headers['Idempotency-Key'],calls[1].headers['Idempotency-Key']);assert.equal(calls[0].body.toString(),calls[1].body.toString());assert.equal(calls[0].body.get('line_items[1][price_data][unit_amount]'),'2500');});
test('HTTP handler rejects Live key before any dependency call',async()=>{let called=false;const h=createHandler(()=>{called=true});const r=await h(new Request('https://test.example/webhook',{method:'POST',body:'{}'}),{STRIPE_MODE:'test',STRIPE_SECRET_KEY:'sk_live_fixture',STRIPE_TEST_SITE_URL:'https://test.example'});assert.equal(r.status,503);assert.equal(called,false);});
test('HTTP webhook accepts absent Origin and invalid signature is rejected',async()=>{const f=await prepared(),h=createHandler(()=>f.service),env={STRIPE_MODE:'test',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_TEST_SITE_URL:'https://test.example',STRIPE_WEBHOOK_SECRET:secret};const e=signed(event());const r=await h(new Request('https://test.example/webhook',{method:'POST',headers:{'Stripe-Signature':e.header},body:e.raw}),env);assert.equal(r.status,200);const bad=await h(new Request('https://test.example/webhook',{method:'POST',body:e.raw}),env);assert.equal(bad.status,400);});
test('production Firestore project is explicitly refused',()=>{assert.throws(()=>createStore({STRIPE_TEST_PROJECT_ID:'kandorty-9378a',FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:'kandorty-9378a'})}),/isolated_test_project_required/);});
test('Firestore typed conversion preserves order values',()=>{const o={total:225.5,qty:2,test:true,items:[],customer:{name:'TEST'},empty:null};assert.deepEqual(unpack(pack(o)),o);});
test('currency conversion handles decimals exactly and rejects ambiguous prices',()=>{assert.equal(money('19.99'),1999);for(const v of ['1.999',NaN,Infinity,-1,'',null])assert.throws(()=>money(v));});
