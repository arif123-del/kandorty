// TEST/approved operator Worker only. Read Resend's sent-email LAST EVENT to
// distinguish provider acceptance from provider-reported delivery.
// This NEVER claims the message reached the recipient's Inbox.
// Access may be denied for a sending-only provider key; fail as unverified,
// without affecting checkout, refunds or scheduled reconciliation.
import {hash} from '../cod-staging/security.mjs';

const SUBJECT='[Kandorty] Payment operations require attention';
const GOOD_EVENT=/^(delivered|opened|clicked|sent|queued|bounced|complained|delivery_delayed|failed)$/;
const HOUR_MS=3600000;

export async function auditResendDelivery({store,env,now=Date.now(),net=fetch}={}){
 if(env?.ALERT_DELIVERY_ENABLED!=='true')return {status:'disabled'};
 if(!store||typeof store.get!=='function'||typeof store.commit!=='function'||typeof store.write!=='function')
  throw Error('delivery_audit_store_missing');
 if(!Number.isSafeInteger(now)||now<0)throw Error('delivery_audit_clock_invalid');
 if(env.STRIPE_MODE!=='test'&&env.STRIPE_MODE!=='live')
  throw Error('delivery_audit_mode_invalid');
 if(env.STRIPE_MODE==='live'&&env.ALERT_PRODUCTION_APPROVAL!=='KANDORTY_ALERTS_APPROVED')
  throw Error('delivery_audit_live_not_approved');
 // Private Resend credentials never go to logs, email content or Firestore.
 const key=env.RESEND_API_KEY;
 if(typeof key!=='string'||!/^re_[A-Za-z0-9_-]{8,}$/.test(key)||
    typeof env.ALERT_EMAIL_FROM!=='string'||typeof env.ALERT_EMAIL_TO!=='string')
  return {status:'missing_provider_credentials'};

 const hour=Math.floor(now/HOUR_MS);
 const candidates=[];
 for(const h of [hour-1,hour]){
  const eventKey='kandorty-ops-'+env.STRIPE_MODE+'-'+h;
  const path='stripe_operator_alerts/'+await hash(eventKey);
  const row=await store.get(path);
  if(row?.data?.eventKey!==eventKey||row.data.status!=='accepted'||
     row.data.deliveryStatus==='delivered')continue;
  const accepted=Date.parse(row.data.acceptedAt||'');
  if(!Number.isFinite(accepted)||accepted>now+60000||now-accepted>2*HOUR_MS)continue;
  candidates.push({row,path,accepted});
 }
 if(!candidates.length)return {status:'nothing_to_check'};
 let remote;
 try{
  const r=await net('https://api.resend.com/emails?limit=100',{
   method:'GET',redirect:'error',
   headers:{Authorization:'Bearer '+key,Accept:'application/json','User-Agent':'Kandorty-Operator-Alerts/1.0'},
   signal:AbortSignal.timeout(15000)
  });
  if(!r?.ok)return {status:'provider_status_unavailable'};
  const payload=await r.json();
  if(payload?.object!=='list'||!Array.isArray(payload.data))
   return {status:'provider_status_unavailable'};
  remote=payload.data;
 }catch{return {status:'provider_status_unavailable'};}

 let recorded=0,matched=0;
 for(const {row,path,accepted} of candidates){
  const messages=remote.filter(x=>x&&x.subject===SUBJECT&&
   x.from===env.ALERT_EMAIL_FROM&&Array.isArray(x.to)&&
   x.to.includes(env.ALERT_EMAIL_TO)&&
   Number.isFinite(Date.parse(x.created_at||''))&&
   Math.abs(Date.parse(x.created_at)-accepted)<=30*60000&&
   typeof x.last_event==='string'&&GOOD_EVENT.test(x.last_event));
  if(messages.length!==1)continue; // ambiguous, or no exact match: never guess.
  matched++;
  const event=messages[0].last_event;
  if(row.data.deliveryStatus===event)continue;
  const update={...row.data,deliveryStatus:event,
    deliveryStatusCheckedAt:new Date(now).toISOString()};
  try{
   await store.commit([store.write(path,update,{updateTime:row.version})]);
   recorded++;
  }catch(e){
   if(e?.message!=='write_conflict')return {status:'status_persistence_unavailable'};
  }
 }
 return {status:'provider_metadata_checked',matched,recorded,
  // Even a 'delivered' event means provider-reported delivery, not Inbox proof.
  inboxConfirmed:false};
}
