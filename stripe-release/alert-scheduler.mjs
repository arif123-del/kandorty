// Opt-in, aggregate-only Resend alerts for the separately staged Stripe/COD Worker.
// Nothing sends by default. This module is not a payment or refund action.
import {hash} from '../cod-staging/security.mjs';
import {operationalReport} from './operations.mjs';
import {sendOperationalEmail} from './operations-email.mjs';

const WINDOW_MS=60*60*1000;
const LEASE_MS=90*1000;
const RETRY_MS=2*60*1000;
const iso=ms=>new Date(ms).toISOString();
const nonce=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
const asAggregate=(r)=>{
 if(!r||typeof r.requiresAttention!=='boolean'||typeof r.scanLimitReached!=='boolean')
  throw Error('alert_report_invalid');
 const result={requiresAttention:r.requiresAttention,scanLimitReached:r.scanLimitReached};
 for(const name of ['pendingSample','reviewSample','refundPendingSample','overduePendingCount','overdueRefundCount']){
  if(!Number.isSafeInteger(r[name])||r[name]<0||r[name]>1000000)
   throw Error('alert_report_invalid');
  result[name]=r[name];
 }
 // Explicit allowlist: customer contacts, order IDs and tokens are discarded.
 return Object.freeze(result);
};

export async function runScheduledAlert({
 store,env,now=Date.now(),reporter=operationalReport,
 send=sendOperationalEmail,net=fetch
}={}){
 if(env?.ALERT_DELIVERY_ENABLED!=='true')
  return Object.freeze({status:'disabled_no_send'});
 if(!['test','live'].includes(env.STRIPE_MODE))throw Error('alert_mode_invalid');
 if(env.STRIPE_MODE==='live'&&env.ALERT_PRODUCTION_APPROVAL!=='KANDORTY_ALERTS_APPROVED')
  throw Error('alert_live_approval_required');
 if(!store||typeof store.get!=='function'||typeof store.write!=='function'||
    typeof store.commit!=='function')throw Error('alert_store_missing');
 if(!Number.isSafeInteger(now)||now<0)throw Error('alert_clock_invalid');
 if(!env.RESEND_API_KEY||!env.ALERT_EMAIL_FROM||!env.ALERT_EMAIL_TO)
  throw Error('alert_private_configuration_missing');

 const report=asAggregate(await reporter(store,now));
 if(!report.requiresAttention)return Object.freeze({status:'healthy_no_send'});

 // All attempts in one hourly incident window use the same Resend idempotency key.
 // The state document contains no order ID, customer address or payment token.
 const eventKey='kandorty-ops-'+env.STRIPE_MODE+'-'+String(Math.floor(now/WINDOW_MS));
 const path='stripe_operator_alerts/'+await hash(eventKey);
 const row=await store.get(path);
 const prior=row?.data;
 if(prior){
  if(prior.eventKey!==eventKey)throw Error('alert_state_conflict');
  if(prior.status==='accepted')return Object.freeze({status:'already_accepted_no_send'});
  if(prior.status==='sending'&&Number.isSafeInteger(prior.leaseUntil)&&prior.leaseUntil>now)
   return Object.freeze({status:'in_flight_no_send'});
  if(prior.status==='failed'&&Number.isSafeInteger(prior.retryAt)&&prior.retryAt>now)
   return Object.freeze({status:'retry_cooldown_no_send'});
  if(!['sending','failed'].includes(prior.status)||!Number.isSafeInteger(prior.attempt)||
      prior.attempt<1||prior.attempt>1000)throw Error('alert_state_invalid');
 }
 // Persist the first aggregate snapshot: Resend retries with the same
 // idempotency key MUST use the same payload even if queue counts change.
 const messageReport=asAggregate(prior?.messageReport||report);
 if(!messageReport.requiresAttention)throw Error('alert_state_invalid');
 const leaseToken=nonce();
 const claimed={
  eventKey,messageReport,status:'sending',leaseToken,leaseUntil:now+LEASE_MS,
  attempt:(prior?.attempt||0)+1,createdAt:prior?.createdAt||iso(now),
  updatedAt:iso(now)
 };
 try{
  await store.commit([store.write(path,claimed,row?{updateTime:row.version}:{exists:false})]);
 }catch(e){
  if(e?.message==='write_conflict')return Object.freeze({status:'claimed_elsewhere_no_send'});
  throw Error('alert_claim_failed');
 }
 const claimRow=await store.get(path);
 if(claimRow?.data?.leaseToken!==leaseToken||claimRow.data.status!=='sending')
  throw Error('alert_claim_confirmation_failed');
 try{
  const result=await send(messageReport,{...env,ALERT_EVENT_KEY:eventKey},net);
  if(result?.status!=='accepted_by_provider_not_delivered')
   throw Error('alert_provider_not_accepted');
 }catch{
  const failed={...claimed,status:'failed',leaseToken:'',leaseUntil:0,
   retryAt:now+RETRY_MS,updatedAt:iso(now)};
  try{await store.commit([store.write(path,failed,{updateTime:claimRow.version})]);}
  catch{throw Error('alert_failure_persistence_failed');}
  throw Error('alert_send_failed');
 }
 const accepted={...claimed,status:'accepted',leaseToken:'',leaseUntil:0,
  acceptedAt:iso(now),updatedAt:iso(now)};
 try{await store.commit([store.write(path,accepted,{updateTime:claimRow.version})]);}
 catch{throw Error('alert_acceptance_persistence_failed');}
 // Provider acceptance is NOT inbox delivery.
 return Object.freeze({status:'accepted_by_provider_not_delivered'});
}
