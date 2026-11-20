import test from 'node:test';
import assert from 'node:assert/strict';
import {nativePushUserId,nativePushDevice,sendNativeOrderPush} from './native-push.mjs';

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
 const pem='-----BEGIN PRIVATE KEY-----\\n'+
  Buffer.from(raw).toString('base64').match(/.{1,64}/g).join('\\n')+
  '\\n-----END PRIVATE KEY-----';
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
  assert.equal(body.message.notification,undefined);
  fcm++;
  return Response.json({name:'projects/kandorty-9378a/messages/test'});
 };
 const result=await sendNativeOrderPush(db,env,mockNet,now);
 assert.deepEqual(result,{sent:1});
 assert.equal(oauth,1);
 assert.equal(fcm,1);
});
