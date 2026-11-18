import {test} from 'node:test';
import assert from 'node:assert/strict';
import {operationalEmail,sendOperationalEmail} from './operations-email.mjs';
const alert=()=>({
 pendingSample:3,reviewSample:1,refundPendingSample:2,overduePendingCount:1,
 overdueRefundCount:1,scanLimitReached:true,requiresAttention:true,
 customer:{phone:'555-DO-NOT-LOG',email:'sensitive@example.invalid'},
 orderId:'KD-DO-NOT-LOG',receipt:'bearer-private'
});
const env=()=>({
 ALERT_DELIVERY_ENABLED:'true',STRIPE_MODE:'test',ALERT_EMAIL_TO:'recipient@example.test',
 ALERT_EMAIL_FROM:'alerts@verified-sender.example',RESEND_API_KEY:'re_fixture_only_key',
 ALERT_EVENT_KEY:'alert-event-20261109'
});
const noNetwork=()=>{throw new Error('unexpected_network');};
test('non-attention result never sends an email, regardless of credentials',async()=>{
 const x={...alert(),requiresAttention:false};
 assert.equal(operationalEmail(x),null);
 assert.deepEqual(await sendOperationalEmail(x,env(),noNetwork),{status:'healthy_no_send'});
});
test('delivery defaults off; no automatic email on isolated or live runs',async()=>{
 assert.deepEqual(await sendOperationalEmail(alert(),{},noNetwork),{status:'disabled_no_send'});
 assert.deepEqual(await sendOperationalEmail(alert(),{ALERT_DELIVERY_ENABLED:'false'},noNetwork),{status:'disabled_no_send'});
});
test('alert subject/body use validated numeric aggregates ONLY and never leak PII',()=>{
 const x=operationalEmail(alert());
 assert.ok(x.subject.startsWith('[Kandorty]'));
 for(const forbidden of ['555-DO-NOT-LOG','sensitive@example.invalid','KD-DO-NOT-LOG','bearer-private']) {
  assert.ok(!JSON.stringify(x).includes(forbidden));
 }
 assert.ok(x.text.includes('Paid stock-review sample: 1'));
 assert.ok(x.text.includes('Pending cancellation-refund sample: 2'));
 assert.ok(x.text.includes('Queue scan reached the 50-record sample limit: YES'));
});
test('report requires explicit bounded counts and scan-limit boolean',()=>{
 assert.throws(()=>operationalEmail({requiresAttention:true}),/invalid_report_count/);
 for(const n of [-1,0.5,Infinity,NaN,1e9]) assert.throws(()=>operationalEmail({...alert(),refundPendingSample:n}),/invalid_report_count/);
 assert.throws(()=>operationalEmail({...alert(),scanLimitReached:'yes'}),/invalid_scan_limit_flag/);
});
test('live-capable alert adapter must refuse incomplete or malformed provider configuration without dispatch',async()=>{
 const base=env();
 for(const patch of [
  {ALERT_EMAIL_TO:'bad\nCc: attacker@example.test'},
  {ALERT_EMAIL_FROM:'bad'},
  {RESEND_API_KEY:'wrong'},
  {ALERT_EVENT_KEY:'short'},
  {STRIPE_MODE:'disabled'}
 ])await assert.rejects(sendOperationalEmail(alert(),{...base,...patch},noNetwork),/alert_delivery_not_configured|invalid_delivery_mode/);
});
test('opt-in adapter sends only fixed aggregate content to a verified provider URL, in a mocked call',async()=>{
 let requests=0;
 const fakeNet=async(url,options)=>{
  requests++;
  assert.equal(url,'https://api.resend.com/emails');
  assert.equal(options.method,'POST');
  assert.equal(options.redirect,'manual');
  assert.equal(options.headers['Idempotency-Key'],'alert-event-20261109');
  assert.ok(options.headers.Authorization.startsWith('Bearer re_'));
  const body=JSON.parse(options.body);
  assert.deepEqual(body.to,['recipient@example.test']);
  assert.equal(body.from,'alerts@verified-sender.example');
  assert.ok(!JSON.stringify(body).includes('sensitive@example.invalid'));
  return {ok:true};
 };
 assert.deepEqual(await sendOperationalEmail(alert(),env(),fakeNet),{status:'accepted_by_provider_not_delivered'});
 assert.equal(requests,1);
});
test('provider error is fail closed and cannot claim delivered or expose recipient',async()=>{
 await assert.rejects(sendOperationalEmail(alert(),env(),async()=>({ok:false,status:401})),/alert_delivery_failed/);
});
