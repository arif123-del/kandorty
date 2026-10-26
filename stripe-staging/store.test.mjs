import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,webcrypto} from 'node:crypto';
import {createStore,pack,unpack} from './firestore.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
function fixture(){
 const docs=new Map(),commits=[];let version=0,conflict=false;
 const env={STRIPE_TEST_PROJECT_ID:'kandorty-test-fixture',FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:'kandorty-test-fixture',client_email:'test@example.invalid',private_key:privateKey})};
 const net=async(url,o)=>{
  if(url==='https://oauth2.googleapis.com/token')return Response.json({access_token:'fake-test-only',expires_in:3600});
  assert.match(url,/projects\/kandorty-test-fixture\/databases\/\(default\)\/documents/);
  if(o.method==='GET'){const path=url.split('/documents/')[1],d=docs.get(path);return d?Response.json({fields:pack(d.data).mapValue.fields,updateTime:d.version}):new Response('',{status:404});}
  assert.ok(url.endsWith('/documents:commit'));const writes=JSON.parse(o.body).writes;commits.push(writes);
  if(conflict)return Response.json({error:{status:'ABORTED'}},{status:409});
  for(const w of writes){const path=w.update.name.split('/documents/')[1];assert.match(path,/^stripe_test_(checkout_sessions|orders)\//);const old=docs.get(path),c=w.currentDocument;
   if(c.exists===false&&old||c.updateTime&&old?.version!==c.updateTime)return Response.json({error:{status:'FAILED_PRECONDITION'}},{status:400});
  }
  for(const w of writes)docs.set(w.update.name.split('/documents/')[1],{data:unpack({mapValue:{fields:w.update.fields}}),version:'version-'+(++version)});
  return Response.json({});
 };
 return {store:createStore(env,net),docs,commits,set conflict(v){conflict=v}};
}
test('Firestore adapter atomically commits order+marker and returns existing order on replay',async()=>{const f=fixture(),id='a'.repeat(64),sid='cs_test_fixture';await f.store.createSnapshot(id,{id});await f.store.bindSession(id,sid);const order={id:'KD-TEST-1',stripeSessionId:sid,total:25};await f.store.finalize(id,sid,order);const last=f.commits.at(-1);assert.equal(last.length,2);assert.equal(last[0].currentDocument.exists,false);assert.ok(last[1].currentDocument.updateTime);assert.deepEqual(await f.store.finalize(id,sid,{...order,total:999}),order);assert.equal(f.docs.size,2);});
test('Firestore adapter handles parallel finalization once using version preconditions',async()=>{const f=fixture(),id='b'.repeat(64),sid='cs_test_fixture';await f.store.createSnapshot(id,{id});await f.store.bindSession(id,sid);await Promise.all(Array.from({length:8},()=>f.store.finalize(id,sid,{id:'KD-TEST-2',stripeSessionId:sid})));assert.equal(f.docs.size,2);});
test('Firestore exhausted contention remains retryable and writes no paid order',async()=>{const f=fixture(),id='c'.repeat(64),sid='cs_test_fixture';await f.store.createSnapshot(id,{id});await f.store.bindSession(id,sid);f.conflict=true;await assert.rejects(f.store.finalize(id,sid,{stripeSessionId:sid}),/database_busy/);assert.equal(f.docs.size,1);assert.ok(!f.docs.get('stripe_test_checkout_sessions/'+id).data.fulfilled);});
