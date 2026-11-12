import {test} from 'node:test';
import assert from 'node:assert/strict';
import {REQUIRED_SECRET_NAMES,missingSecretNames,verifySecretPresence} from './verify-cloudflare-secret-bindings.mjs';
const entries=(names)=>names.map(name=>({name,type:'secret_text'}));
test('Cloudflare metadata preflight accepts only all five named secrets, never values',()=>{
 assert.deepEqual(missingSecretNames(entries(REQUIRED_SECRET_NAMES)),[]);
 const result=missingSecretNames(entries(REQUIRED_SECRET_NAMES.filter(x=>x!=='STRIPE_WEBHOOK_SECRET')));
 assert.deepEqual(result,['STRIPE_WEBHOOK_SECRET']);
 assert.ok(!JSON.stringify(result).includes('whsec_'));
});
test('unexpected Cloudflare response shapes fail closed',()=>{
 assert.throws(()=>missingSecretNames(null),/invalid_secret_metadata/);
 assert.throws(()=>missingSecretNames([{name:'STRIPE_SECRET_KEY',type:'plain_text'}]),/invalid_secret_metadata/);
});
test('Cloudflare verification uses only authenticated GET at the fixed Worker URL',async()=>{
 const accountId='a'.repeat(32),token='test_auth_token_123456789';
 const net=async(url,options)=>{
  assert.equal(url,'https://api.cloudflare.com/client/v4/accounts/'+accountId+'/workers/scripts/kandorty-stripe-release/secrets');
  assert.equal(options.method,'GET');
  assert.equal(options.redirect,'error');
  assert.equal(options.headers.Authorization,'Bearer '+token);
  return Response.json({success:true,result:entries(REQUIRED_SECRET_NAMES)});
 };
 assert.deepEqual(await verifySecretPresence({accountId,apiToken:token,net}),[]);
});
test('read-only credential gate rejects invalid authorization and provider errors',async()=>{
 await assert.rejects(verifySecretPresence({accountId:'wrong',apiToken:'wrong'}),/cloudflare_auth_not_configured/);
 await assert.rejects(verifySecretPresence({accountId:'a'.repeat(32),apiToken:'a'.repeat(15),net:async()=>Response.json({success:false,result:[]})}),/cloudflare_read_denied/);
});
