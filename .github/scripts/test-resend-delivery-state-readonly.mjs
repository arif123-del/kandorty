// Owner-safe isolated TEST read-only Firestore audit: operator alert metadata.
// Never print operator email addresses, provider IDs, order IDs or tokens.
// No production Firebase, Stripe or Resend API access.
import {createStore} from '../../stripe-release/firestore.mjs';
import {hash} from '../../cod-staging/security.mjs';
const project='kandorty-stripe-test-5f8af';
const source=process.env.STRIPE_TEST_SERVICE_ACCOUNT_JSON;
const env={
 STRIPE_MODE:'test',FIREBASE_PROJECT_ID:project,
 STRIPE_SECRET_KEY:'sk_test_fixture',
 STRIPE_WEBHOOK_SECRET:'whsec_fixture',STRIPE_RECEIPT_SECRET:'b'.repeat(64),
 STAGING_ACCESS_SECRET:'a'.repeat(64),FIREBASE_SERVICE_ACCOUNT_JSON:source
};
const say=(k,v)=>console.log('TEST_ALERT_DELIVERY_CHECK '+k+': '+v);
if(typeof source!=='string'||source.length<100){
 say('STATUS','BLOCKED_MISSING_TEST_CREDENTIAL');process.exitCode=2;
}else try{
 const store=createStore(env);const now=Date.now(),hour=Math.floor(now/3600000);
 let found=0,delivered=0,accepted=0,unverified=0,problem=0;
 for(let delta=0;delta<3;delta++){
  const key='kandorty-ops-test-'+(hour-delta);
  const path='stripe_operator_alerts/'+await hash(key);
  const row=await store.get(path);
  if(row?.data?.eventKey!==key)continue;
  found++;
  const state=row.data.status,delivery=row.data.deliveryStatus||'unknown';
  if(state==='accepted')accepted++;
  if(delivery==='delivered')delivered++;
  if(['bounced','complained','failed'].includes(delivery))problem++;
  if(state==='accepted'&&!['delivered','bounced','complained','failed'].includes(delivery))unverified++;
 }
 say('RECORDS_FOUND',found);
 say('PROVIDER_ACCEPTED_RECORDS',accepted);
 say('PROVIDER_REPORTED_DELIVERED_RECORDS',delivered);
 say('PROVIDER_REPORTED_FAILURE_RECORDS',problem);
 say('ACCEPTED_BUT_DELIVERY_UNVERIFIED_RECORDS',unverified);
 say('RECIPIENT_INBOX_DELIVERY','NOT_PROVEN_BY_THIS_AUDIT');
 say('PRODUCTION_WRITES','NONE');
}catch{
 say('STATUS','BLOCKED_TEST_READ_OR_AUTH_FAILURE');
 process.exitCode=2;
}
