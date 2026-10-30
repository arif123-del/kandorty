import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ownerGrantPreflight,ADMIN_PROJECT} from './admin-grant-plan.mjs';
const email='target@example.test';
const user=()=>({uid:'safe_user-123',email,emailVerified:true,disabled:false,providerData:[{providerId:'password'}],customClaims:{department:'ops'}});
test('owner grant is scope-checked and never loses prior claims',()=>{
 const r=ownerGrantPreflight({email,user:user(),membership:null,now:1800000000});
 assert.equal(ADMIN_PROJECT,'kandorty-9378a');
 assert.equal(r.uid,'safe_user-123');assert.equal(r.needsClaim,true);assert.equal(r.needsMembership,true);
 assert.deepEqual({...r.previousClaims,admin:true},{department:'ops',admin:true});
});
test('owner grant refuses absent identity, email mismatch, missing verification, disabled user and invalid UID',()=>{
 const u=user();
 for(const patch of [{email:'other@example.test'},{emailVerified:false},{disabled:true},{uid:'../hack'},{customClaims:{admin:'true'}},
   {providerData:[{providerId:'anonymous'}]}]){
  assert.throws(()=>ownerGrantPreflight({email,user:{...u,...patch},now:1800000000}));
 }
});
test('owner grant checks server-owned membership and timestamp and is idempotent',()=>{
 const u={...user(),customClaims:{admin:true}};
 const okay=ownerGrantPreflight({email,user:u,membership:{active:true,validAfter:1700000000},now:1800000000});
 assert.equal(okay.needsClaim,false);assert.equal(okay.needsMembership,false);
 assert.throws(()=>ownerGrantPreflight({email,user:u,membership:{active:true,validAfter:1900000000},now:1800000000}));
 assert.throws(()=>ownerGrantPreflight({email,user:u,membership:{active:true,validAfter:'0'},now:1800000000}));
});
