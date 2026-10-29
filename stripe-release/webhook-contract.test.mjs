import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STRIPE_WEBHOOK_API_VERSION,STRIPE_WEBHOOK_URL,STRIPE_CHECKOUT_EVENTS,STRIPE_REFUND_EVENTS,STRIPE_WEBHOOK_EVENTS} from './webhook-contract.mjs';

test('Live webhook contract is scoped to one Stripe account, one endpoint and six v1 snapshot events',()=>{
 assert.equal(STRIPE_WEBHOOK_API_VERSION,'2024-06-20');
 assert.equal(STRIPE_WEBHOOK_URL,'https://kandorty-stripe-release.aliyajan200011.workers.dev/webhook');
 assert.deepEqual(STRIPE_CHECKOUT_EVENTS,['checkout.session.completed','checkout.session.async_payment_succeeded']);
 assert.deepEqual(STRIPE_REFUND_EVENTS,['refund.created','refund.updated','refund.failed','charge.refunded']);
 assert.equal(new Set(STRIPE_WEBHOOK_EVENTS).size,6);
 assert.ok(!STRIPE_WEBHOOK_EVENTS.includes('*'));
});
test('Webhook is not activated by the release template, which always fails closed',()=>{
 const c=JSON.parse(readFileSync(new URL('./wrangler.release.example.json',import.meta.url),'utf8'));
 assert.equal(c.name,'kandorty-stripe-release');
 assert.equal(c.vars.STRIPE_MODE,'disabled');
 assert.equal(c.vars.LIVE_RELEASE_APPROVAL,'NOT_APPROVED');
 assert.equal(c.vars.CHECKOUT_DISABLED,'true');
 assert.equal(c.vars.FIREBASE_PROJECT_ID,'kandorty-9378a');
 assert.equal(c.workers_dev,true);
 assert.equal(c.preview_urls,false);
 assert.deepEqual(c.routes,[]);
 assert.ok(!c.triggers&&!c.crons);
 assert.equal(new URL(STRIPE_WEBHOOK_URL).hostname,'kandorty-stripe-release.aliyajan200011.workers.dev');
});
