import test from 'node:test';
import assert from 'node:assert/strict';
import {nativePushUserId,nativePushDevice,sendNativeOrderPush,sendNativeTestPush} from './native-push.mjs';

const cfg={projectId:'kandorty-9378a'};
function fakeJWT(claims){
 const b=s=>Buffer.from(JSON.stringify(s)).toString('base64url');
 return 'Bearer '+b({alg:'RS256',typ:'JWT'})+'.'+b(claims)+'.signature';
}
const validClaims={aud:'kandorty-9378a',iss:'https://securetoken.google.com/kandorty-9378a',
  sub:'admin-test',exp:Date.now()/1000+3600};
const token='fixtureToken'.padEnd(160,'x')+':app';
function store(){
 const db=new Map();let ver=0;
 return {
  db,get:async name=>db.get(name)||null,
  write:(name,data,condition)=>({name,data,condition}),
  commit:async writes=>{
   for(const w of writes){
    if(w.condition?.exists===false && db.has(w.name))throw Error('write_conflict');
    if(w.condition?.updateTime && db.get(w.name)?.version!==w.condition.updateTime)throw Error('write_conflict');
    db.set(w.name,{data:w.data,version:String(++ver)});
   }
  }
 };
}
test('registration only derives UID after caller authenticated externally',()=>{
 assert.equal(nativePushUserId(fakeJWT(validClaims),cfg),'admin-test');
 assert.throws(()=>nativePushUserId('',cfg),/admin_authorization_required/);
 assert.throws(()=>nativePushUserId(fakeJWT({...validClaims,aud:'wrong'}),cfg),/admin_authorization_required/);
 assert.throws(()=>nativePushUserId(fakeJWT({...validClaims,exp:1}),cfg),/admin_authorization_required/);
});
test('valid native device registration persists with one token and expiry',async()=>{
 const db=store();
 const result=await nativePushDevice(db,'admin-test',token,'register',Date.now());
 assert.equal(result.enabled,true);
 const list=(await db.get('admin_native_push_config/devices')).data.devices;
 assert.equal(list.length,1);
 assert.equal(list[0].uid,'admin-test');
 assert.ok(list[0].expiresAt>Date.now()+6*24*60*60*1000);
 await nativePushDevice(db,'admin-test',token,'register',Date.now());
 assert.equal((await db.get('admin_native_push_config/devices')).data.devices.length,1);
 await nativePushDevice(db,'admin-test',token,'remove',Date.now());
 assert.equal((await db.get('admin_native_push_config/devices')).data.devices.length,0);
});
test('device registration rejects invalid IDs and token syntax',async()=>{
 const db=store();
 await assert.rejects(nativePushDevice(db,'admin-test','../../etc/passwd','register'),/invalid_native_push_device/);
 await assert.rejects(nativePushDevice(db,'notsafe!id',token,'register'),/invalid_native_push_device/);
 await assert.rejects(nativePushDevice(db,'admin-test',token,'surprise'),/invalid_native_push_action/);
});
test('expired registrations are discarded on fresh enrollment',async()=>{
 const db=store(),now=Date.now();
 db.db.set('admin_native_push_config/devices',{data:{devices:[{token,uid:'admin-test',expiresAt:now-1000}]},version:'1'});
 await nativePushDevice(db,'admin-test',token.replace('x','y'),'register',now);
 assert.equal((await db.get('admin_native_push_config/devices')).data.devices.length,1);
});
test('no registered devices means no FCM network calls or service-account use',async()=>{
 const db=store();
 const result=await sendNativeOrderPush(db,{},async()=>{throw Error('should not fetch')});
 assert.deepEqual(result,{sent:0});
});

test('FCM HTTP v1 sends only a generic order signal using server credentials',async()=>{
 const db=store(),now=Date.now();
 await nativePushDevice(db,'admin-test',token,'register',now);
 const rsa=await crypto.subtle.generateKey({
  name:'RSASSA-PKCS1-v1_5',modulusLength:2048,
  publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'
 },true,['sign','verify']);
 const raw=new Uint8Array(await crypto.subtle.exportKey('pkcs8',rsa.privateKey));
 const pem='-----BEGIN PRIVATE KEY-----\n'+
  Buffer.from(raw).toString('base64').match(/.{1,64}/g).join('\n')+
  '\n-----END PRIVATE KEY-----';
 const env={FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({
  project_id:'kandorty-9378a',private_key:pem,
  client_email:'native-push-test@test.iam.gserviceaccount.com'
 })};
 let oauth=0,fcm=0;
 const mockNet=async (url,options)=>{
  if(url==='https://oauth2.googleapis.com/token'){
   oauth++;
   assert.equal(options.method,'POST');
   assert.match(String(options.body),/jwt-bearer/);
   return Response.json({access_token:'sandbox-token',expires_in:3000});
  }
  assert.equal(url,'https://fcm.googleapis.com/v1/projects/kandorty-9378a/messages:send');
  assert.equal(options.headers.Authorization,'Bearer sandbox-token');
  const body=JSON.parse(options.body);
  assert.deepEqual(body.message.data,{kind:'kandorty_new_order'});
  assert.equal(body.message.token,token);
  assert.equal(body.message.android.priority,'high');
  assert.equal(body.message.notification.title,'🔔 طلب جديد - كندورتي');
  assert.equal(body.message.android.notification.channel_id,'kandorty_admin_orders_v2');
  assert.equal(body.message.android.notification.sound,'default');
  assert.equal(body.message.data.kind,'kandorty_new_order');
  fcm++;
  return Response.json({name:'projects/kandorty-9378a/messages/test'});
 };
 const result=await sendNativeOrderPush(db,env,mockNet,now);
 assert.deepEqual(result,{sent:1});
 assert.equal(oauth,1);
 assert.equal(fcm,1);
});

test('FCM self-test needs registered token belonging to same admin UID',async()=>{
 const db=store();
 await assert.rejects(sendNativeTestPush(db,{},'admin-test',token,
   async()=>{throw Error('network forbidden')}),/native_push_device_not_registered/);
 await nativePushDevice(db,'admin-test',token,'register',Date.now());
 await assert.rejects(sendNativeTestPush(db,{},'another-admin',token,
   async()=>{throw Error('network forbidden')}),/native_push_device_not_registered/);
 await assert.rejects(sendNativeTestPush(db,{},'admin-test','wrong',
   async()=>{throw Error('network forbidden')}),/invalid_native_push_device/);
});
test('FCM self-test sends a visible high-priority test to enrolled phone only',async()=>{
 const db=store(),now=Date.now();
 await nativePushDevice(db,'admin-test',token,'register',now);
 const rsa=await crypto.subtle.generateKey({
   name:'RSASSA-PKCS1-v1_5',modulusLength:2048,
   publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'
 },true,['sign','verify']);
 const raw=new Uint8Array(await crypto.subtle.exportKey('pkcs8',rsa.privateKey));
 const pem='-----BEGIN PRIVATE KEY-----\n'+
   Buffer.from(raw).toString('base64').match(/.{1,64}/g).join('\n')+
   '\n-----END PRIVATE KEY-----';
 const env={FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({
   project_id:'kandorty-9378a',private_key:pem,
   client_email:'native-test@test.iam.gserviceaccount.com'
 })};
 let fcm=0;
 const mockNet=async (url,options)=>{
   if(url==='https://oauth2.googleapis.com/token')
     return Response.json({access_token:'verified-service-access',expires_in:1200});
   assert.equal(url,'https://fcm.googleapis.com/v1/projects/kandorty-9378a/messages:send');
   assert.match(options.headers.Authorization,/^Bearer (verified-service-access|sandbox-token)$/);
   const body=JSON.parse(options.body);
   assert.equal(body.message.token,token);
   assert.deepEqual(body.message.data,{kind:'kandorty_push_test'});
   assert.equal(body.message.android.notification.channel_id,'kandorty_admin_orders_v2');
   assert.equal(body.message.android.notification.sound,'default');
   assert.match(body.message.notification.title,/اختبار/);
   fcm++;
   return Response.json({name:'projects/kandorty-9378a/messages/fixture'});
 };
 assert.deepEqual(await sendNativeTestPush(db,env,'admin-test',token,mockNet,now),{sent:true});
 assert.equal(fcm,1);
});

/**
 * Production-Firestore read availability should not block a proven admin,
 * and must NEVER admit a token based only on its unsigned JWT claims.
 */
test('native HTTP 503 fallback only grants a cryptographically verified active admin',async()=>{
 const {handler}=await import('./worker.mjs');
 const pair=await crypto.subtle.generateKey(
  {name:'RSASSA-PKCS1-v1_5',modulusLength:2048,
   publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),
   kid:'admin-503-test',alg:'RS256'};
 const now=Math.floor(Date.now()/1000),uid='test-admin-503',cfg={
  aud:'kandorty-9378a',iss:'https://securetoken.google.com/kandorty-9378a',
  sub:uid,admin:true,iat:now-10,auth_time:now-30,exp:now+3600
 };
 const jwt=async patch=>{
  const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
  const unsigned=encode({alg:'RS256',kid:'admin-503-test'})+'.'+encode({...cfg,...patch});
  const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,
    new TextEncoder().encode(unsigned));
  return unsigned+'.'+Buffer.from(signature).toString('base64url');
 };
 const env={
  STRIPE_MODE:'live',FIREBASE_PROJECT_ID:'kandorty-9378a',
  STRIPE_SECRET_KEY:'sk_live_placeholder',
  STRIPE_WEBHOOK_SECRET:'whsec_placeholder',
  STRIPE_RECEIPT_SECRET:'a'.repeat(64),
  LIVE_RELEASE_APPROVAL:'KANDORTY_STRIPE_V1_APPROVED',
  TURNSTILE_SECRET_KEY:'placeholder',
  RATE_LIMITER:{limit:async()=>({success:true})}
 };
 const register=async(db,claimPatch,readerStatus=503)=>{
  let reads=0,signatureChecks=0;
  const fn=handler({
   store:()=>db,
   readerNet:async()=>{reads++;return new Response(null,{status:readerStatus});},
   authNet:async url=>{
    signatureChecks++;
    assert.match(url,/securetoken@system\.gserviceaccount\.com/);
    return Response.json({keys:[jwk]});
   }
  });
  const bearer=await jwt(claimPatch);
  const resp=await fn(new Request(
   'https://kandorty-stripe-release.aliyajan200011.workers.dev/admin/native-push',{
   method:'POST',headers:{Origin:'https://kandorty.online',
    Authorization:'Bearer '+bearer,'Content-Type':'application/json'},
   body:JSON.stringify({action:'register',token})
  }),env);
  return {status:resp.status,body:await resp.json(),reads,signatureChecks};
 };
 const allowed=store();
 allowed.db.set('admin_access/'+uid,{data:{active:true,validAfter:now-90},version:'2'});
 const ok=await register(allowed,{});
 assert.equal(ok.status,200,JSON.stringify(ok));
 assert.deepEqual(ok.body,{enabled:true});
 assert.equal(ok.reads,1);
 assert.equal(ok.signatureChecks,1);
 assert.equal((await allowed.get('admin_native_push_config/devices')).data.devices.length,1);

 for(const [name,patch,active] of [
  ['no admin custom claim',{admin:false},true],
  ['wrong issuer',{iss:'https://securetoken.google.com/wrong'},true],
  ['expired token',{exp:now-5},true],
  ['inactive membership',{},false]]){
  const db=store();
  db.db.set('admin_access/'+uid,{data:{active,validAfter:now-90},version:'3'});
  const result=await register(db,patch);
  assert.equal(result.status,403,name+': '+JSON.stringify(result));
  assert.equal(result.body.error,'admin_authorization_required',name);
  assert.equal(await db.get('admin_native_push_config/devices'),null,name);
 }
});
