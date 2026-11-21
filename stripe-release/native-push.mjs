import {Fault} from '../cod-staging/security.mjs';

const devicesPath='admin_native_push_config/devices';
const TOKEN_PATTERN=/^[A-Za-z0-9_:\-]{40,512}$/;
const UID_PATTERN=/^[A-Za-z0-9_-]{1,128}$/;
const MAX_DEVICES=16;
const EXPIRE_MS=7*24*60*60*1000;
const GOOGLE_OAUTH='https://oauth2.googleapis.com/token';
const enc=new TextEncoder();
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b)))
  .replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');

export function nativePushUserId(authorization,cfg){
 if(typeof authorization!=='string'||!/^Bearer [^\s]{1,12000}$/.test(authorization))
  throw new Fault('admin_authorization_required',403);
 // The route must call Firestore rules validation or verifyAdmin *before*
 // using these claims; parsing JWT alone never grants access.
 try{
  const parts=authorization.slice(7).split('.');
  if(parts.length!==3)throw Error();
  const claims=JSON.parse(new TextDecoder().decode(Uint8Array.from(
    atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))));
  if(claims.aud!==cfg.projectId||
     claims.iss!=='https://securetoken.google.com/'+cfg.projectId||
     !UID_PATTERN.test(claims.sub||'')||
     !Number.isFinite(claims.exp)||claims.exp<=Date.now()/1000)throw Error();
  return claims.sub;
 }catch{throw new Fault('admin_authorization_required',403);}
}

export async function nativePushDevice(store,uid,token,action='register',now=Date.now()){
 if(!UID_PATTERN.test(uid||'')||typeof token!=='string'||!TOKEN_PATTERN.test(token))
  throw new Fault('invalid_native_push_device',400);
 if(!['register','remove'].includes(action))throw new Fault('invalid_native_push_action',400);
 for(let attempt=0;attempt<4;attempt++){
  const row=await store.get(devicesPath),previous=Array.isArray(row?.data?.devices)?row.data.devices:[];
  const active=previous.filter(d=>d?.expiresAt>now && TOKEN_PATTERN.test(d.token||'')
    && UID_PATTERN.test(d.uid||''));
  const cleaned=active.filter(d=>d.token!==token);
  if(action==='register')cleaned.push({token,uid,expiresAt:now+EXPIRE_MS});
  // Drop oldest device(s) to keep a strict server-owned upper bound.
  const next=cleaned.slice(-MAX_DEVICES);
  if(action==='remove'&&next.length===previous.length&&
    next.every((d,i)=>d.token===previous[i].token))return {enabled:false};
  try{
   await store.commit([store.write(devicesPath,{devices:next},
     row?{updateTime:row.version}:{exists:false})]);
   return {enabled:action==='register'};
  }catch(error){if(error?.message!=='write_conflict')throw error;}
 }
 throw new Fault('database_busy',503);
}

let accessToken=null,accessTokenExpires=0;
async function firebaseMessagingAccess(env,net=fetch,now=Date.now()){
 if(accessToken&&accessTokenExpires>now+60000)return accessToken;
 let sa;
 try{sa=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON||'');}
 catch{throw new Fault('native_push_signing_unavailable',503);}
 if(sa.project_id!=='kandorty-9378a'||
    !sa.client_email?.endsWith('.iam.gserviceaccount.com')||
    typeof sa.private_key!=='string')throw new Fault('native_push_signing_unavailable',503);
 const t=Math.floor(now/1000);
 const payload={iss:sa.client_email,scope:'https://www.googleapis.com/auth/firebase.messaging',
   aud:GOOGLE_OAUTH,iat:t,exp:t+3600};
 const part=b64(enc.encode(JSON.stringify({alg:'RS256',typ:'JWT'})))+'.'+
   b64(enc.encode(JSON.stringify(payload)));
 let der,key;
 try{
  der=Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----/g,'')
    .replace(/\s/g,'')),c=>c.charCodeAt(0));
  key=await crypto.subtle.importKey('pkcs8',der,
    {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 }catch{throw new Fault('native_push_signing_unavailable',503);}
 const jwt=part+'.'+b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,enc.encode(part)));
 const resp=await net(GOOGLE_OAUTH,{method:'POST',redirect:'manual',
   headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt}),
   signal:AbortSignal.timeout(12000)});
 if(!resp.ok)throw new Fault('native_push_oauth_failed',503);
 const data=await resp.json();
 if(!data.access_token||typeof data.access_token!=='string')
  throw new Fault('native_push_oauth_failed',503);
 accessToken=data.access_token;
 accessTokenExpires=now+Math.min(Number(data.expires_in)||3600,3600)*1000;
 return accessToken;
}

export async function sendNativeOrderPush(store,env,net=fetch,now=Date.now()){
 const row=await store.get(devicesPath);
 const devices=Array.isArray(row?.data?.devices)?row.data.devices:[];
 const active=devices.filter(d=>TOKEN_PATTERN.test(d?.token||'')&&
   UID_PATTERN.test(d?.uid||'')&&d.expiresAt>now);
 if(!active.length)return {sent:0};
 // The message contains no order/customer data and is only a signal to
 // open the authenticated administration view.
 const access=await firebaseMessagingAccess(env,net,now);
 const url='https://fcm.googleapis.com/v1/projects/kandorty-9378a/messages:send';
 const statuses=await Promise.allSettled(active.map(async d=>{
  const response=await net(url,{method:'POST',redirect:'manual',
    headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},
    body:JSON.stringify({message:{
      token:d.token,
      // Notification payload makes Android display the alert while the
      // standalone admin app is backgrounded; the data signal is used by
      // FirebaseMessagingService when it is foregrounded.
      notification:{
        title:'🔔 طلب جديد - كندورتي',
        body:'وصل طلب جديد. افتحي إدارة كندورتي.'
      },
      data:{kind:'kandorty_new_order'},
      android:{
        priority:'high',ttl:'120s',
        notification:{
          channel_id:'kandorty_admin_orders_v2',
          notification_priority:'PRIORITY_HIGH',
          sound:'default'
        }
      }
    }}),
    signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Fault('native_push_provider_http_'+response.status,503);
  return true;
 }));
 const sent=statuses.filter(x=>x.status==='fulfilled').length;
 if(sent===0)throw new Fault('native_push_delivery_failed',503);
 return {sent};
}

/**
 * Explicit owner-only Firebase test for exactly one already enrolled handset.
 * No order is created, modified, or read. Never exposes a device token.
 */
// Expose only allowlisted provider codes and never response messages,
// credentials, device tokens or customer data.
async function nativeFcmFailure(resp){
 let err;
 try{err=(await resp.json())?.error;}catch{}
 const detail=Array.isArray(err?.details)?err.details:[];
 const fcm=detail.find(v=>v?.['@type']==='type.googleapis.com/google.firebase.fcm.v1.FcmError')?.errorCode;
 const info=detail.find(v=>v?.['@type']==='type.googleapis.com/google.rpc.ErrorInfo')?.reason;
 if(info==='SERVICE_DISABLED')return new Fault('native_push_fcm_api_disabled',503);
 if(info==='ACCESS_TOKEN_SCOPE_INSUFFICIENT')return new Fault('native_push_fcm_scope_insufficient',503);
 if(fcm==='SENDER_ID_MISMATCH')return new Fault('native_push_fcm_sender_mismatch',403);
 if(fcm==='UNREGISTERED')return new Fault('native_push_fcm_token_expired',409);
 if(resp.status===403)return new Fault('native_push_fcm_permission_denied',403);
 if(resp.status===401)return new Fault('native_push_fcm_credentials_rejected',503);
 if(resp.status===400)return new Fault('native_push_fcm_invalid_argument',400);
 if(resp.status===404)return new Fault('native_push_fcm_not_found',503);
 if(resp.status===429)return new Fault('native_push_fcm_quota_exceeded',503);
 return new Fault('native_push_fcm_http_'+Number(resp.status),503);
}

export async function sendNativeTestPush(store,env,uid,deviceToken,net=fetch,now=Date.now()){
 if(!UID_PATTERN.test(uid||'')||!TOKEN_PATTERN.test(deviceToken||''))
   throw new Fault('invalid_native_push_device',400);
 const row=await store.get(devicesPath);
 const list=Array.isArray(row?.data?.devices)?row.data.devices:[];
 if(!list.some(d=>d?.uid===uid && d?.token===deviceToken && d?.expiresAt>now))
   throw new Fault('native_push_device_not_registered',409);
 const access=await firebaseMessagingAccess(env,net,now);
 const endpoint='https://fcm.googleapis.com/v1/projects/kandorty-9378a/messages:send';
 const resp=await net(endpoint,{method:'POST',redirect:'manual',
   headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},
   body:JSON.stringify({message:{
     token:deviceToken,
     notification:{title:'🔔 اختبار إشعار كندورتي',body:'اختبار إشعار Firebase للجهاز'},
     data:{kind:'kandorty_push_test'},
     android:{
       priority:'high',ttl:'120s',
       notification:{channel_id:'kandorty_admin_orders_v2',
         notification_priority:'PRIORITY_HIGH',sound:'default'}
     }
   }}),
   signal:AbortSignal.timeout(12000)});
 if(!resp.ok)throw await nativeFcmFailure(resp);
 return {sent:true};
}
