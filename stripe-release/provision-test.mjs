// Scoped to this new TEST Worker and its own Sandbox webhook; no other endpoints touched.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {random} from '../cod-staging/security.mjs';
const worker='kandorty-stripe-release-test',url='https://'+worker+'.aliyajan200011.workers.dev/webhook';
const key=String(process.env.STRIPE_SECRET_KEY||'').trim();assert.match(key,/^sk_test_/);
const cfg=JSON.parse(fs.readFileSync('stripe-release/wrangler.test.json','utf8'));
assert.equal(cfg.name,worker);assert.equal(cfg.vars.STRIPE_MODE,'test');assert.equal(cfg.vars.FIREBASE_PROJECT_ID,'kandorty-stripe-test-5f8af');assert.deepEqual(cfg.routes,[]);
assert.equal(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON).project_id,cfg.vars.FIREBASE_PROJECT_ID);
async function api(path,method='GET',body){const r=await fetch('https://api.stripe.com/v1'+path,{method,headers:{Authorization:'Bearer '+key},...(body?{body}:{}),redirect:'error'});assert.ok(r.ok,'Sandbox webhook API failed '+r.status);return r.json();}
let cursor='';for(let n=0;n<20;n++){
 const list=await api('/webhook_endpoints?limit=100'+(cursor?'&starting_after='+cursor:''));
 for(const e of list.data){if(e.url!==url)continue;assert.equal(e.livemode,false);assert.equal(e.metadata?.managed_by,'kandorty-stripe-release-test');await api('/webhook_endpoints/'+e.id,'DELETE');}
 if(!list.has_more)break;assert.ok(n<19,'Too many endpoints');cursor=list.data.at(-1).id;
}
const endpoint=await api('/webhook_endpoints','POST',new URLSearchParams({url,'enabled_events[0]':'checkout.session.completed','enabled_events[1]':'checkout.session.async_payment_succeeded','enabled_events[2]':'refund.created','enabled_events[3]':'refund.updated','enabled_events[4]':'refund.failed','enabled_events[5]':'charge.refunded','metadata[managed_by]':worker,description:'Isolated Stripe release Sandbox only'}));
assert.equal(endpoint.livemode,false);assert.match(endpoint.secret,/^whsec_/);
for(const [name,value] of Object.entries({STRIPE_SECRET_KEY:key,STRIPE_WEBHOOK_SECRET:endpoint.secret,STRIPE_RECEIPT_SECRET:random(32),STAGING_ACCESS_SECRET:random(32)})){
 console.log('::add-mask::'+value);fs.appendFileSync(process.env.GITHUB_ENV,name+'='+value+'\n');
}
console.log('Dedicated Sandbox endpoint provisioned; only new release-test signing secrets rotated.');
