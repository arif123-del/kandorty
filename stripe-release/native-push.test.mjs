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
   assert.equal(options.redirect,'manual','Cloudflare Workers rejects redirect:error');
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
   assert.equal(options.redirect,'manual','Cloudflare Workers rejects redirect:error');
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
 * A signed Firebase login for the *exact existing web-admin account* may
 * register native notifications, even if the unrelated Firestore admin claim
 * has not yet been provisioned. This is NOT general admin API authorization.
 */
test('native 403/503 registration uses signed single-owner identity and denies forged or revoked users',async()=>{
 const {handler}=await import('./worker.mjs');
 const pair=await crypto.subtle.generateKey({
  name:'RSASSA-PKCS1-v1_5',modulusLength:2048,
  publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),
   kid:'native-fcm-identity-test',alg:'RS256'};
 const now=Math.floor(Date.now()/1000),uid='verified-native-owner',claims={
  aud:'kandorty-9378a',
  iss:'https://securetoken.google.com/kandorty-9378a',
  sub:uid,email:'aliyajan200011@gmail.com',
  email_verified:false,
  firebase:{sign_in_provider:'password'},
  iat:now-10,auth_time:now-1000,exp:now+3500
 };
 // Build a minimal DER certificate around the same generated RSA SPKI.
 // The test verifies the official x509 fallback, not certificate issuance.
 const der=(tag,...parts)=>{
  const body=Buffer.concat(parts),length=body.length;
  const header=length<128?[length]:length<256?[0x81,length]:
    [0x82,(length>>8)&255,length&255];
  return Buffer.concat([Buffer.from([tag,...header]),body]);
 };
 const seq=(...parts)=>der(0x30,...parts);
 const spki=Buffer.from(await crypto.subtle.exportKey('spki',pair.publicKey));
 const tbs=seq(der(0xa0,der(0x02,Buffer.from([2]))),
   der(0x02,Buffer.from([1])),seq(),seq(),seq(),seq(),spki);
 const pem='-----BEGIN CERTIFICATE-----\n'+
   seq(tbs,seq(),der(0x03,Buffer.from([0]))).toString('base64')+
   '\n-----END CERTIFICATE-----';

 const jwt=async (patch={},tamper=false)=>{
  const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
  const unsigned=encode({alg:'RS256',kid:'native-fcm-identity-test'})+
   '.'+encode({...claims,...patch});
  const signature=Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',
   pair.privateKey,new TextEncoder().encode(unsigned))).toString('base64url');
  return unsigned+'.'+(tamper?signature.replace(/^./,signature[0]==='a'?'b':'a'):signature);
 };
 const env={
  STRIPE_MODE:'live',FIREBASE_PROJECT_ID:'kandorty-9378a',
  STRIPE_SECRET_KEY:'sk_live_placeholder',STRIPE_WEBHOOK_SECRET:'whsec_placeholder',
  STRIPE_RECEIPT_SECRET:'a'.repeat(64),
  LIVE_RELEASE_APPROVAL:'KANDORTY_STRIPE_V1_APPROVED',
  TURNSTILE_SECRET_KEY:'placeholder',
  RATE_LIMITER:{limit:async()=>({success:true})}
 };
 const call=async (db,patch={},opts={})=>{
  let checks=0;
  const fn=handler({
   store:()=>db,
   readerNet:async()=>new Response(null,{status:opts.readerStatus??403}),
   authNet:async (url,options)=>{
    assert.equal(options.redirect,'manual','Workers-compatible request; never follow redirects');
    checks++;
    if(url.startsWith('https://identitytoolkit.googleapis.com/')){
     assert.equal(options.method,'POST');
     const payload=JSON.parse(options.body);
     assert.equal(typeof payload.idToken,'string');
     if(opts.keysDown)throw Error('Google identity service unreachable');
     if(opts.identityOnly){
      if(opts.tamper)return Response.json({error:{message:'INVALID_ID_TOKEN'}},{status:400});
      return Response.json({users:[{localId:uid,email:'aliyajan200011@gmail.com'}]});
     }
     throw Error('unexpected identity fallback');
    }
    assert.match(url,/securetoken@system\.gserviceaccount\.com/);
    if(opts.keysDown)throw Error('Google keys unreachable');
    if(opts.identityOnly)return new Response(null,{status:503});
    if(opts.x509Only){
     if(url.includes('/service_accounts/v1/jwk/'))
      return new Response(null,{status:503});
     assert.match(url,/\/robot\/v1\/metadata\/x509\//);
     return Response.json({[jwk.kid]:pem});
    }
    return Response.json({keys:[jwk]});
   }
  });
  const bearer=await jwt(patch,!!opts.tamper);
  const path=opts.path??'/admin/native-push';
  const body=opts.body??{action:'register',token};
  const response=await fn(new Request(
   'https://kandorty-stripe-release.aliyajan200011.workers.dev'+path,{
   method:'POST',
   headers:{Origin:'https://kandorty.online',
    Authorization:'Bearer '+bearer,'Content-Type':'application/json'},
   body:JSON.stringify(body)
  }),env);
  return {status:response.status,body:await response.json(),checks};
 };
 // An authenticated account matching the existing website may receive
 // device-specific push without any global admin claim or membership.
 for (const readerStatus of [403,503]) {
  const db=store();
  const r=await call(db,{email:'Aliyajan200011@gmail.com'}, {readerStatus});
  assert.equal(r.status,200,JSON.stringify(r));
  assert.deepEqual(r.body,{enabled:true});
  assert.equal(r.checks,2);
  assert.equal((await db.get('admin_native_push_config/devices')).data.devices.length,1);
 }
 // Google's documented official X.509 endpoint works even when JWKS
 // returns a 503. It MUST still validate the same RSA signature and owner.
 {
  const db=store(),r=await call(db,{}, {x509Only:true});
  assert.equal(r.status,200,'X.509 fallback: '+JSON.stringify(r));
  assert.equal(r.checks,2,'both signing-key endpoints checked');
  assert.equal((await db.get('admin_native_push_config/devices')).data.devices.length,1);
 }
 {
  const db=store(),r=await call(db,{}, {x509Only:true,tamper:true});
  assert.equal(r.status,403,'X.509 fallback rejects forged signature');
  assert.equal(r.body.error,'admin_authorization_required');
  assert.equal(await db.get('admin_native_push_config/devices'),null);
 }
 // Both public-key endpoints can be unavailable while Google's separate
 // Auth REST service can verify the signed ID token and account identity.
 {
  const db=store(),r=await call(db,{}, {identityOnly:true});
  assert.equal(r.status,200,'REST identity fallback: '+JSON.stringify(r));
  assert.equal(r.checks,3);
  assert.equal((await db.get('admin_native_push_config/devices')).data.devices.length,1);
 }
 {
  const db=store(),r=await call(db,{}, {identityOnly:true,tamper:true});
  assert.equal(r.status,403,'REST identity fallback refuses invalid Firebase token');
  assert.equal(r.body.error,'admin_authorization_required');
  assert.equal(await db.get('admin_native_push_config/devices'),null);
 }
 const bad=[
  ['wrong admin account',{email:'customer@example.test'}],
  ['explicitly revoked claim',{admin:false}],
  ['wrong project',{aud:'another-firebase-project'}],
  ['wrong issuer',{iss:'https://securetoken.google.com/another-firebase-project'}],
  ['expired token',{exp:now-3}],
  ['stale token',{iat:now-3900}],
  ['future authentication',{auth_time:now+10}],
  ['anonymous Firebase provider',{firebase:{sign_in_provider:'anonymous'}}],
  ['unverified Google provider',{email_verified:false,firebase:{sign_in_provider:'google.com'}}],
 ];
 for(const [name,patch] of bad){
  const db=store();
  const r=await call(db,patch);
  assert.equal(r.status,403,name+': '+JSON.stringify(r));
  const precise={
   'wrong admin account':'native_push_owner_email_mismatch',
   'explicitly revoked claim':'native_push_admin_claim_revoked',
   'anonymous Firebase provider':'native_push_signin_provider_invalid',
   'unverified Google provider':'native_push_google_email_unverified'
  };
  assert.equal(r.body.error,precise[name]||'admin_authorization_required',name);
  assert.equal(await db.get('admin_native_push_config/devices'),null,name);
 }
 for(const tamper of [true]){
  const db=store();
  const r=await call(db,{}, {tamper});
  assert.equal(r.status,403,'bad signature denied');
  assert.equal(r.body.error,'admin_authorization_required');
  assert.equal(await db.get('admin_native_push_config/devices'),null);
 }
 for(const m of [
  {active:false,validAfter:now-100},
  {active:true,validAfter:now-200}
 ]){
  const db=store();
  db.db.set('admin_access/'+uid,{data:m,version:'1'});
  const r=await call(db);
  assert.equal(r.status,403,'revoked / post-login grant cannot enroll');
  assert.equal(r.body.error,m.active?'native_push_fresh_login_required':'native_push_membership_inactive');
  assert.equal(await db.get('admin_native_push_config/devices'),null);
 }
 // Google signing-key failures must be distinguishable from caller access
 // denial so troubleshooting never silently weakens authorization.
 {
  const r=await call(store(),{}, {keysDown:true});
  assert.equal(r.status,503);
  assert.equal(r.body.error,'native_push_google_keys_unavailable');
 }
 {
  const db=store();
  db.get=async()=>{throw Error('Google Firestore downstream unavailable')};
  const r=await call(db);
  assert.equal(r.status,503);
  assert.equal(r.body.error,'native_push_membership_lookup_unavailable');
 }
 // The unrelated full-admin endpoints must NOT accept the email-only grant.
 // Web Push remains behind full-admin verification, never email-only.
 {
  const db=store(),r=await call(db,{},{
   path:'/admin/order-push',body:{action:'key'}
  });
  assert.equal(r.status,403,'full admin browser-push endpoint remains restricted');
  assert.equal(r.body.error,'admin_authorization_required');
 }
});
