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

const firebaseCertsURL='https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

// Extract SubjectPublicKeyInfo from Google's HTTPS-delivered X.509 certificate.
// All DER length and structural checks fail closed; certificate authenticity is
// supplied by the pinned Google HTTPS endpoint and JWT signature verification.
function nativePushSpkiFromGoogleCert(pem){
 if(typeof pem!=='string'||pem.length>12000||
    !/^-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----$/.test(pem.trim()))
  throw Error('invalid_google_certificate');
 const base64=pem.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s+/g,'');
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))throw Error('invalid_google_certificate');
 const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
 const part=(offset)=>{
  if(offset<0||offset+2>bytes.length)throw Error('invalid_der');
  const tag=bytes[offset],first=bytes[offset+1];
  let length=0,start=offset+2;
  if(first<128)length=first;
  else{
   const count=first&127;
   if(count===0||count>4||start+count>bytes.length)throw Error('invalid_der');
   for(let i=0;i<count;i++)length=length*256+bytes[start++];
  }
  if(length<0||start+length>bytes.length)throw Error('invalid_der');
  return {tag,start,end:start+length};
 };
 const cert=part(0);
 if(cert.tag!==0x30||cert.end!==bytes.length)throw Error('invalid_der');
 const tbs=part(cert.start);
 if(tbs.tag!==0x30||tbs.end>cert.end)throw Error('invalid_der');
 let pos=tbs.start,item=part(pos);
 if(item.tag===0xa0){pos=item.end;}
 // TBSCertificate fields before SubjectPublicKeyInfo:
 // serialNumber, signature, issuer, validity, subject.
 for(let i=0;i<5;i++){
  item=part(pos);
  if(item.end>tbs.end)throw Error('invalid_der');
  pos=item.end;
 }
 const spki=part(pos);
 if(spki.tag!==0x30||spki.end>tbs.end)throw Error('invalid_der');
 return bytes.slice(pos,spki.end);
}

// Google publishes both a JWKS and an official X.509 endpoint for Firebase
// securetoken signing keys. Never trust any JWT without RS256 verification.
// Fail closed if both Google endpoints are unavailable.
async function verifyNativeGoogleSignature(parts,kid,net){
 const data=new TextEncoder().encode(parts[0]+'.'+parts[1]);
 const signature=decode(parts[2]);
 const algorithm={name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'};
 const requestOptions=()=>({redirect:'error',signal:AbortSignal.timeout(8000)});
 let validSetSeen=false;
 try{
  const response=await net(jwksURL,requestOptions());
  if(response.ok){
   const keys=(await response.json()).keys;
   if(Array.isArray(keys)){
    validSetSeen=true;
    const jwk=keys.find(k=>k?.kid===kid&&k.kty==='RSA'&&k.alg==='RS256');
    if(jwk){
     const key=await crypto.subtle.importKey('jwk',jwk,algorithm,false,['verify']);
     if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,signature,data))
      throw new Fault('admin_authorization_required',403);
     return;
    }
   }
  }
 }catch(error){
  if(error instanceof Fault)throw error;
 }
 try{
  const response=await net(firebaseCertsURL,requestOptions());
  if(response.ok){
   const certs=await response.json();
   if(certs&&typeof certs==='object'&&!Array.isArray(certs)){
    validSetSeen=true;
    if(Object.prototype.hasOwnProperty.call(certs,kid)){
     const spki=nativePushSpkiFromGoogleCert(certs[kid]);
     const key=await crypto.subtle.importKey('spki',spki,algorithm,false,['verify']);
     if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,signature,data))
      throw new Fault('admin_authorization_required',403);
     return;
    }
   }
  }
 }catch(error){
  if(error instanceof Fault)throw error;
 }
 throw new Fault(validSetSeen?'admin_authorization_required':
   'native_push_google_keys_unavailable',validSetSeen?403:503);
}

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
 await verifyNativeGoogleSignature(parts,head.kid,net);
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
