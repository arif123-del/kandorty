import test from 'node:test';
import assert from 'node:assert/strict';
import {requireOrderReader,pushKeys,enroll} from './order-push.mjs';

const cfg={projectId:'kandorty-9378a'};
const request=token=>new Request('https://kandorty.online/admin.html',{
  headers:token?{Authorization:'Bearer '+token}:{}
});

test('reader accepts a permitted Firebase ID token without exposing order data',async()=>{
 let checked=false;
 await requireOrderReader(request('test.id.token'),cfg,async(url,options)=>{
  checked=true;
  assert.match(url,/^https:\/\/firestore\.googleapis\.com\/v1\/projects\/kandorty-9378a\/databases\/\(default\)\/documents\/orders\?/);
  assert.equal(options.headers.Authorization,'Bearer test.id.token');
  assert.equal(options.redirect,'manual');
  return new Response(null,{status:200});
 });
 assert.ok(checked);
});

test('missing credentials cannot register a push device',async()=>{
 await assert.rejects(requireOrderReader(request(),cfg,async()=>new Response(null,{status:200})),{
  message:'admin_authorization_required',status:403
 });
});

for(const status of [401,403]){
 test('Firestore permission denial '+status+' yields auth error only',async()=>{
  await assert.rejects(requireOrderReader(request('valid.fake.token'),cfg,async()=>new Response(null,{status})),{
   message:'admin_authorization_required',status:403
  });
 });
}
for(const status of [429,500,503]){
 test('Firestore outage '+status+' must not be treated as invalid admin login',async()=>{
  await assert.rejects(requireOrderReader(request('valid.fake.token'),cfg,async()=>new Response(null,{status})),{
   message:'admin_reader_unavailable',status:503
  });
 });
}
test('network outage is distinct from authorization failure',async()=>{
 await assert.rejects(requireOrderReader(request('test.id.token'),cfg,async()=>{throw Error('offline');}),{
  message:'admin_reader_unavailable',status:503
 });
});

test('push public key is persistent across calls',async()=>{
 const data=new Map();
 const store={
  get:async path=>data.has(path)?{data:data.get(path),version:'1'}:null,
  write:(path,value)=>({path,value}),
  commit:async writes=>{for(const w of writes)data.set(w.path,w.value);}
 };
 const first=await pushKeys(store);
 const second=await pushKeys(store);
 assert.equal(first.publicKey,second.publicKey);
 const raw=Buffer.from(first.publicKey.replace(/-/g,'+').replace(/_/g,'/'),'base64');
 assert.equal(raw.length,65);
 assert.equal(raw[0],4);
});

test('push registration rejects untrusted endpoints',async()=>{
 const store={get:async()=>null};
 await assert.rejects(enroll(store,'https://example.com/fcm/evil'),{
  message:'unsupported_push_service',status:400
 });
});
