import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePublicWebKey,sendVerificationToSignedInUser} from './email-verification.mjs';
const email='account@example.test',key='AIza'+'A'.repeat(32);
test('verification uses only public config from exact project',()=>{
 assert.equal(parsePublicWebKey(`const firebaseConfig = {apiKey: "${key}", projectId: "kandorty-9378a"};`),key);
 assert.throws(()=>parsePublicWebKey(`const firebaseConfig={apiKey:"${key}",projectId:"other-project"};`));
});
test('sign in then send official verification email without returning identity tokens',async()=>{
 const seen=[];const net=async(u,opt)=>{const body=JSON.parse(opt.body);seen.push({u,method:opt.method,body});
  return Response.json(seen.length===1?{email,idToken:'fixture-token'}:{email});};
 const result=await sendVerificationToSignedInUser({email,password:'fixture-local-password',apiKey:key,net});
 assert.deepEqual(result,{sent:true});assert.equal(seen.length,2);
 assert.ok(seen[0].u.includes('/accounts:signInWithPassword?key='));
 assert.ok(seen[1].u.includes('/accounts:sendOobCode?key='));
 assert.equal(seen[1].body.requestType,'VERIFY_EMAIL');
 assert.equal(seen[1].body.idToken,'fixture-token');
 assert.ok(!JSON.stringify(result).includes('fixture-token'));
});
test('mismatched signed-in user refuses to send a verification email',async()=>{
 let calls=0;
 await assert.rejects(()=>sendVerificationToSignedInUser({email,password:'secret',apiKey:key,net:async()=>{calls++;return Response.json({email:'wrong@example.test',idToken:'token'});}}),/firebase_identity_mismatch/);
 assert.equal(calls,1);
});
