// Isolated TEST ONLY: temporary, synthetic unresolved review queue incident.
// Uses the existing masked GitHub test Firebase credential; no live Stripe,
// production Firebase, payment, refund, customer data or real orders are touched.
// It waits for the 5-minute scheduled TEST Worker to accept ONE Resend alert,
// then closes only its uniquely named synthetic review marker in finally.
import {createStore} from '../../stripe-release/firestore.mjs';
import {hash} from '../../cod-staging/security.mjs';

const project='kandorty-stripe-test-5f8af';
const source=process.env.STRIPE_TEST_SERVICE_ACCOUNT_JSON;
const env={
 STRIPE_MODE:'test',FIREBASE_PROJECT_ID:project,STRIPE_SECRET_KEY:'sk_test_fixture',
 STRIPE_WEBHOOK_SECRET:'whsec_fixture',STRIPE_RECEIPT_SECRET:'b'.repeat(64),
 STAGING_ACCESS_SECRET:'a'.repeat(64),FIREBASE_SERVICE_ACCOUNT_JSON:source
};
const say=tag=>console.log('SYNTHETIC_CRON_ALERT_TEST: '+tag);
if(typeof source!=='string'||source.length<100){
 say('BLOCKED_MISSING_PRIVATE_TEST_CREDENTIAL');process.exitCode=2;
}else{
 let store,markPath='',created=false,accepted=false;
 try{
  store=createStore(env);
  if(!store.root.startsWith('projects/'+project+'/'))throw Error('unsafe_project');
  // Do not mistake an alert from before this smoke test for its delivery.
  const started=Date.now();
  const currentKey='kandorty-ops-test-'+Math.floor(started/3600000);
  const current=await store.get('stripe_operator_alerts/'+await hash(currentKey));
  if(current?.data?.status==='accepted'){
   const acceptedAt=current.data.acceptedAt;
   const safeTime=typeof acceptedAt==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(acceptedAt)?acceptedAt:'NOT_RECORDED';
   say('HOURLY_ALERT_PREVIOUSLY_ACCEPTED_AT_UTC '+safeTime);
   say('BLOCKED_HOURLY_ALERT_ALREADY_ACCEPTED');process.exitCode=2;
  }else{
   const suffix=Array.from(crypto.getRandomValues(new Uint8Array(8)),n=>n.toString(16).padStart(2,'0')).join('');
   markPath='stripe_review_queue/alert-smoke-'+suffix;
   const sample={reason:'isolated_synthetic_alert_smoke_test',testOnly:true,resolved:false,createdAt:new Date().toISOString()};
   await store.commit([store.write(markPath,sample,{exists:false})]);
   created=true;
   say('TEMPORARY_TEST_REVIEW_CREATED_NO_REAL_ORDER');
   // One TEST Cron should run every 5 minutes; a bounded eight-minute check
   // ensures the job ends and cleans up even if provider delivery is blocked.
   const cutoff=started+8*60*1000;
   while(Date.now()<cutoff){
    await new Promise(ok=>setTimeout(ok,15000));
    const key='kandorty-ops-test-'+Math.floor(Date.now()/3600000);
    const state=(await store.get('stripe_operator_alerts/'+await hash(key)))?.data;
    const time=Date.parse(state?.acceptedAt||'');
    if(state?.status==='accepted'&&Number.isFinite(time)&&time>=started){
     accepted=true;break;
    }
   }
   if(accepted)say('PROVIDER_ACCEPTED_FROM_SCHEDULED_WORKER_DELIVERY_NOT_PROVEN');
   else {say('NO_NEW_SCHEDULED_PROVIDER_ACCEPTANCE_VERIFIED');process.exitCode=2;}
  }
 }catch{
  say('TEST_CHECK_FAILED_NO_PRIVATE_DETAILS');process.exitCode=2;
 }finally{
  if(created&&markPath&&store){
   try{
    const row=await store.get(markPath);
    if(row?.data?.testOnly===true&&row?.data?.reason==='isolated_synthetic_alert_smoke_test'&&row?.data?.resolved===false){
     await store.commit([store.write(markPath,{...row.data,resolved:true,closedAt:new Date().toISOString()},{updateTime:row.version})]);
     say('TEMPORARY_TEST_REVIEW_CLOSED');
    }else say('CLEANUP_NOT_REQUIRED');
   }catch{
    say('CLEANUP_NOT_CONFIRMED_REQUIRES_TEST_ONLY_REVIEW');
    process.exitCode=2;
   }
  }
  say('LIVE_FIREBASE_STRIPE_SITE_ZIINA_AND_LEGACY_ORDERS_UNCHANGED');
 }
}
