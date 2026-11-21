import {Fault} from '../cod-staging/security.mjs';
const jwksURL='https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const decode=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
export async function verifyAdmin(token,cfg,store,net=fetch,now=Math.floor(Date.now()/1000)){
 try{
  if(typeof token!=='string'||token.length>12000)throw Error();
  const parts=token.split('.');if(parts.length!==3)throw Error();
  const head=JSON.parse(new TextDecoder().decode(decode(parts[0]))),claim=JSON.parse(new TextDecoder().decode(decode(parts[1])));
  if(head.alg!=='RS256'||typeof head.kid!=='string'||head.kid.length>200||claim.aud!==cfg.projectId||claim.iss!=='https://securetoken.google.com/'+cfg.projectId||typeof claim.sub!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(claim.sub)||claim.firebase?.tenant||claim.admin!==true||!Number.isFinite(claim.exp)||claim.exp<=now||!Number.isFinite(claim.iat)||claim.iat>now||!Number.isFinite(claim.auth_time)||claim.auth_time>now||claim.auth_time<now-3600)throw Error();
  const r=await net(jwksURL,{redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();
  const jwk=(await r.json()).keys?.find(k=>k.kid===head.kid&&k.kty==='RSA'&&k.alg==='RS256');if(!jwk)throw Error();
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])))throw Error();
  // Server-owned active membership is checked on every action. Disable membership to revoke access immediately.
  const member=(await store.get('admin_access/'+claim.sub))?.data;
  if(member?.active!==true||!Number.isFinite(member.validAfter)||claim.auth_time<member.validAfter)throw Error();
  return {uid:claim.sub};
 }catch{throw new Fault('admin_authorization_required',403);}
}


// Native FCM is a *notification-only* capability. It does not permit reading
// orders, modifying products, changing payments, or invoking admin APIs.
// The current web admin authenticates this one Firebase email/password account
// before showing its dashboard. Native push uses the same exact account identity
// after independently checking Google's signature, token times, project and UID.
// A missing admin custom claim does NOT grant Firestore or other admin authority.
export async function verifyNativePushAdmin(token,cfg,store,net=fetch,now=Math.floor(Date.now()/1000)){
 // Before Google's signature verification, never disclose token claims or
 // membership information. All public errors must remain generic.
 let claim,head,parts;
 try {
  if(cfg.projectId!=='kandorty-9378a'||typeof token!=='string'||token.length>12000)throw Error();
  parts=token.split('.');
  if(parts.length!==3)throw Error();
  head=JSON.parse(new TextDecoder().decode(decode(parts[0])));
  claim=JSON.parse(new TextDecoder().decode(decode(parts[1])));
  if(head.alg!=='RS256'||typeof head.kid!=='string'||head.kid.length>200||
     claim.aud!==cfg.projectId||
     claim.iss!=='https://securetoken.google.com/'+cfg.projectId||
     typeof claim.sub!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(claim.sub)||
     claim.firebase?.tenant||
     !Number.isFinite(claim.exp)||claim.exp<=now||claim.exp>now+3700||
     !Number.isFinite(claim.iat)||claim.iat>now||claim.iat<now-3700||
     !Number.isFinite(claim.auth_time)||claim.auth_time>now||claim.auth_time<=0)
   throw Error();
 }catch {
  throw new Fault('admin_authorization_required',403);
 }
 let keys;
 try {
  const r=await net(jwksURL,{redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw Error();
  keys=(await r.json()).keys;
  if(!Array.isArray(keys))throw Error();
 }catch{
  throw new Fault('native_push_google_keys_unavailable',503);
 }
 try {
  const jwk=keys.find(k=>k.kid===head.kid&&k.kty==='RSA'&&k.alg==='RS256');
  if(!jwk)throw Error();
  const key=await crypto.subtle.importKey('jwk',jwk,
      {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),
       new TextEncoder().encode(parts[0]+'.'+parts[1])))throw Error();
 }catch{
  throw new Fault('admin_authorization_required',403);
 }
 // Details below are returned ONLY to a cryptographically verified Firebase
 // login; keep existing owner allowlist and revocation checks unchanged.
 if(typeof claim.email!=='string'||claim.email.toLowerCase()!=='aliyajan200011@gmail.com')
  throw new Fault('native_push_owner_email_mismatch',403);
 if(claim.admin===false)
  throw new Fault('native_push_admin_claim_revoked',403);
 if(!['password','google.com'].includes(claim.firebase?.sign_in_provider))
  throw new Fault('native_push_signin_provider_invalid',403);
 if(claim.firebase.sign_in_provider==='google.com'&&claim.email_verified!==true)
  throw new Fault('native_push_google_email_unverified',403);
 let member;
 try{
  member=(await store.get('admin_access/'+claim.sub))?.data;
 }catch{
  throw new Fault('native_push_membership_lookup_unavailable',503);
 }
 if(member){
  if(member.active!==true||!Number.isFinite(member.validAfter))
   throw new Fault('native_push_membership_inactive',403);
  if(claim.auth_time<member.validAfter)
   throw new Fault('native_push_fresh_login_required',403);
 }
 return {uid:claim.sub};
}
