import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from './worker.mjs';
import {TEST_HTML,TEST_JS} from './test-page.mjs';

const testOrigin='https://kandorty-stripe-orders-test.example.workers.dev';
const env={STRIPE_MODE:'test',STRIPE_SECRET_KEY:'sk_test_FAKEonly',STRIPE_TEST_SITE_URL:testOrigin};
const handler=createHandler(()=>{throw new Error('GET must not create a payment service');});
test('staging page uses non-sensitive test fixture, never a live checkout',async()=>{
 const result=await handler(new Request(testOrigin+'/test'),env);
 assert.equal(result.status,200);
 assert.match(result.headers.get('Content-Type'),/text\/html/);
 assert.match(result.headers.get('Content-Security-Policy'),/default-src 'none'/);
 assert.match(await result.text(),/TEST ONLY/);
 assert.match(TEST_HTML,/test-product|TEST ONLY/);
 assert.match(TEST_JS,/checkoutToken/);
 assert.match(TEST_JS,/sessionStorage/);
 assert.doesNotMatch(TEST_JS,/sk_live_|sk_test_|whsec_|private_key/);
});
test('test.js is only served from exact isolated site',async()=>{
 const ok=await handler(new Request(testOrigin+'/test.js'),env);
 assert.equal(ok.status,200);
 assert.match(await ok.text(),/create-checkout-session/);
 const wrong=await handler(new Request('https://kandorty.online/test.js'),env);
 assert.equal(wrong.status,403);
});
test('staging UI cannot be served with Live Stripe key or production Firebase origin',async()=>{
 const req=()=>new Request(testOrigin+'/test');
 assert.equal((await handler(req(),{...env,STRIPE_SECRET_KEY:'sk_live_FAKEonly'})).status,503);
 assert.equal((await handler(req(),{...env,STRIPE_MODE:'live'})).status,503);
 assert.equal((await handler(req(),{...env,STRIPE_TEST_SITE_URL:'https://kandorty.online'})).status,503);
});
