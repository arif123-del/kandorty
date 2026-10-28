import {test} from 'node:test';import assert from 'node:assert/strict';import {verifyAdmin} from './admin-auth.mjs';
const b64=v=>Buffer.from(v).toString('base64url');
test('Firebase admin authorization requires RSA signature, exact project, fresh login, custom claim and active server membership',async()=>{
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'test',alg:'RS256'};
 const now=Math.floor(Date.now()/1000),cfg={projectId:'test-project'},base={sub:'admin-user',aud:cfg.projectId,iss:'https://securetoken.google.com/'+cfg.projectId,admin:true,iat:now-1,auth_time:now-10,exp:now+3600};
 const sign=async patch=>{const input=b64(JSON.stringify({alg:'RS256',kid:'test'}))+'.'+b64(JSON.stringify({...base,...patch}));return input+'.'+b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(input)));};
 let member={active:true,validAfter:now-20};const store={get:async path=>{assert.equal(path,'admin_access/admin-user');return {data:member};}},net=async url=>{assert.equal(url,'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');return Response.json({keys:[jwk]});};
 assert.equal((await verifyAdmin(await sign({}),cfg,store,net,now)).uid,'admin-user');
 for(const patch of [{aud:'wrong'},{iss:'wrong'},{admin:false},{exp:now-1},{auth_time:now-4000},{sub:'bad/path'}])await assert.rejects(verifyAdmin(await sign(patch),cfg,store,net,now),/admin_authorization_required/);
 const token=await sign({});await assert.rejects(verifyAdmin(token.slice(0,-8)+'AAAAAAAA',cfg,store,net,now),/admin_authorization_required/);
 member={active:false,validAfter:0};await assert.rejects(verifyAdmin(token,cfg,store,net,now),/admin_authorization_required/);
 member={active:true,validAfter:now};await assert.rejects(verifyAdmin(token,cfg,store,net,now),/admin_authorization_required/);
});
