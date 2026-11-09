import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sendVerificationEmail} from './resend-verification.mjs';
const cfg=()=>({
 RESEND_TEST_SEND_CONFIRM:'SEND_ONE_VERIFICATION_EMAIL',
 STRIPE_MODE:'test',
 ALERT_DELIVERY_ENABLED:'false',
 ALERT_EMAIL_TO:'owner@example.test',
 ALERT_EMAIL_FROM:'alerts@example.test',
 RESEND_API_KEY:'re_mock_provider_key',
 ALERT_EVENT_KEY:'verification-20261109',
});
const never=()=>{throw Error('MUST_NOT_MAKE_NETWORK_REQUEST')};
test('manual verification is off by default, including when all secret-looking values exist',async()=>{
 assert.deepEqual(await sendVerificationEmail({...cfg(),RESEND_TEST_SEND_CONFIRM:undefined},never),{status:'disabled_no_send'});
 assert.deepEqual(await sendVerificationEmail({},never),{status:'disabled_no_send'});
});
test('cannot run in Live mode or while real automatic alerts are enabled',async()=>{
 await assert.rejects(sendVerificationEmail({...cfg(),STRIPE_MODE:'live'},never),/isolated_test_only/);
 await assert.rejects(sendVerificationEmail({...cfg(),ALERT_DELIVERY_ENABLED:'true'},never),/isolated_test_only/);
});
test('all private sender settings and event idempotency key are required',async()=>{
 for(const patch of [
   {ALERT_EMAIL_TO:'bad\\nCc: hacker@example.test'},
   {ALERT_EMAIL_FROM:'unverified-email-format'},
   {RESEND_API_KEY:''},
   {ALERT_EVENT_KEY:'short'},
 ]) await assert.rejects(sendVerificationEmail({...cfg(),...patch},never),/private_sender_recipient_or_key_not_configured/);
});
test('mock provider receives one explicit TEST with no payment claims or production order',async()=>{
 let count=0;
 const fake=async(url,req)=>{
  ++count;
  assert.equal(url,'https://api.resend.com/emails');
  assert.equal(req.method,'POST');
  assert.equal(req.redirect,'manual');
  assert.equal(req.headers['Idempotency-Key'],'verification-20261109');
  const body=JSON.parse(req.body);
  assert.deepEqual(body.to,['owner@example.test']);
  assert.equal(body.from,'alerts@example.test');
  assert.match(body.subject,/TEST/);
  assert.match(body.text,/no real payment/i);
  assert.ok(!JSON.stringify(body).includes('KD-'));
  return {ok:true};
 };
 assert.deepEqual(await sendVerificationEmail(cfg(),fake),{status:'provider_accepted_delivery_not_confirmed'});
 assert.equal(count,1);
});
test('provider error, network failure or rejected API key never claims delivered',async()=>{
 await assert.rejects(sendVerificationEmail(cfg(),async()=>({ok:false,status:401})),/test_email_provider_rejected/);
 await assert.rejects(sendVerificationEmail(cfg(),async()=>{throw Error('SECRET_CONFIG');}),/test_email_provider_unreachable/);
});
