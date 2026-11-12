import {Fault} from '../cod-staging/security.mjs';
import {releaseConfig} from './configuration.mjs';
const enc=new TextEncoder();
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
export function pack(v){if(v===null)return {nullValue:null};if(typeof v==='string')return {stringValue:v};if(typeof v==='boolean')return {booleanValue:v};if(typeof v==='number')return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};if(Array.isArray(v))return {arrayValue:{values:v.map(pack)}};return {mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,pack(x)]))}};}
export function unpack(v){if('stringValue'in v)return v.stringValue;if('integerValue'in v)return Number(v.integerValue);if('doubleValue'in v)return v.doubleValue;if('booleanValue'in v)return v.booleanValue;if('nullValue'in v)return null;if('arrayValue'in v)return(v.arrayValue.values||[]).map(unpack);return Object.fromEntries(Object.entries(v.mapValue?.fields||{}).map(([k,x])=>[k,unpack(x)]));}
// TEST-only narrow legacy status write. Firestore updateMask preserves every
// unrelated existing field (including timestamp/bytes/geo/refValue types that
// must NEVER be unpacked and rewritten from historical documents).
const LEGACY_TEST_ROOT='projects/kandorty-stripe-test-5f8af/databases/(default)/documents';
const LEGACY_FIELDS=Object.freeze({
 orders:Object.freeze(['status','cancellationLockedAt','cancelledBy','updatedAt']),
 tracking:Object.freeze(['status','cancellationLockedAt','updatedAt'])
});
export function legacyStatusPatchWrite(root,path,patch,condition){
 if(root!==LEGACY_TEST_ROOT)throw new Fault('legacy_patch_test_only',503);
 const hit=/^(orders|tracking)\/(KD-?[A-Za-z0-9_-]{4,40})$/.exec(path||'');
 if(!hit||!patch||typeof patch!=='object'||Array.isArray(patch)||
    Object.getPrototypeOf(patch)!==Object.prototype)
  throw new Fault('invalid_legacy_patch',409);
 const allowed=LEGACY_FIELDS[hit[1]];
 const keys=Object.keys(patch).sort();
 if(keys.length<2||!keys.includes('status')||!keys.includes('updatedAt')||
    keys.some(k=>!allowed.includes(k)))
  throw new Fault('invalid_legacy_patch_fields',409);
 if(!['preparing','shipping','delivered','cancelled'].includes(patch.status)||
    (Object.hasOwn(patch,'cancelledBy')&&
     (hit[1]!=='orders'||patch.status!=='cancelled'||patch.cancelledBy!=='admin'))||
    (Object.hasOwn(patch,'cancellationLockedAt')&&
     (patch.status!=='preparing'||typeof patch.cancellationLockedAt!=='string'||
      !Number.isFinite(Date.parse(patch.cancellationLockedAt))))||
    typeof patch.updatedAt!=='string'||!Number.isFinite(Date.parse(patch.updatedAt))||
    !condition||typeof condition.updateTime!=='string'||!condition.updateTime)
  throw new Fault('invalid_legacy_patch_value',409);
 return {
  update:{name:root+'/'+path,fields:Object.fromEntries(keys.map(k=>[k,pack(patch[k])]))},
  updateMask:{fieldPaths:keys},
  currentDocument:{updateTime:condition.updateTime}
 };
}

export function createStore(env,net=fetch){
 const cfg=releaseConfig(env);
 let account;try{account=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);}catch{throw new Fault('database_not_configured',503);}
 // Credentials must match the explicitly gated test/live project.
 if(account.project_id!==cfg.projectId)throw new Fault('isolated_test_project_required',503);
 // Validate the staged JSON structure without ever logging or returning its secret fields.
 if(typeof account.private_key!=='string'||!account.private_key.includes('-----BEGIN PRIVATE KEY-----')||
    typeof account.client_email!=='string'||!account.client_email.endsWith('.iam.gserviceaccount.com'))
   throw new Fault('invalid_staging_service_account_json',503);
 const root=`projects/${cfg.projectId}/databases/(default)/documents`;

 let cachedToken='',expiry=0;
 // All outbound requests are pinned to known HTTPS hosts and never follow redirects.
 async function token(){
  let phase='start';try{
  if(cachedToken&&expiry>Date.now()+60000)return cachedToken;
  phase='jwt_claims';
  const now=Math.floor(Date.now()/1000);
  const input=b64(enc.encode(JSON.stringify({alg:'RS256',typ:'JWT'})))+'.'+b64(enc.encode(JSON.stringify({iss:account.client_email,scope:'https://www.googleapis.com/auth/datastore',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600})));
  phase='jwt_import';
  let key;
  try {
   const der=Uint8Array.from(atob(account.private_key.replace(/-----[^-]+-----/g,'').replace(/\s/g,'')),x=>x.charCodeAt(0));
   key=await crypto.subtle.importKey('pkcs8',der,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  } catch {
   throw new Fault('invalid_staging_private_key',503);
  }
  phase='jwt_sign';
  const assertion=input+'.'+b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,enc.encode(input)));
  phase='oauth_fetch';
  const r=await net('https://oauth2.googleapis.com/token',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new Fault('database_auth_failed',503);phase='oauth_parse';const result=await r.json();if(!result.access_token)throw new Fault('database_auth_failed',503);
  cachedToken=result.access_token;expiry=Date.now()+Number(result.expires_in||3600)*1000;return cachedToken;
  }catch(e){if(e instanceof Fault)throw e;throw new Fault('database_token_'+phase,503);}
 }
 async function call(path,method='GET',body){
  let phase='get_token';try{
  const access=await token();phase='firestore_fetch';
  const r=await net('https://firestore.googleapis.com/v1/'+root+path,{method,redirect:'manual',headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  if(method==='GET'&&r.status===404)return null;
  if(!r.ok){const data=await r.json().catch(()=>({}));if(['ALREADY_EXISTS','FAILED_PRECONDITION','ABORTED'].includes(data.error?.status))throw new Fault('write_conflict',409);throw new Fault('database_unavailable',503);}
  phase='firestore_parse';return r.json();
  }catch(e){if(e instanceof Fault)throw e;throw new Fault('database_'+phase,503);}
 }
 async function get(path){const d=await call('/'+path);return d?{data:unpack({mapValue:{fields:d.fields||{}}}),version:d.updateTime}:null;}
 function write(path,data,condition){return {update:{name:root+'/'+path,fields:pack(data).mapValue.fields},currentDocument:condition};}
 function writePatch(path,patch,condition){return legacyStatusPatchWrite(root,path,patch,condition);}
 async function commit(writes){
  if(writes.some(w=>!w.update?.name?.startsWith(root+'/')))throw new Fault('unsafe_destination',503);
  return call(':commit','POST',{writes});
 }

 // An authenticated REST read-write transaction is required for legacy
 // updates. In particular, the absence of an order_lifecycle ledger must be
 // read in the same transaction as the order/tracking writes. A batch commit
 // with separate GETs is not sufficient for this decision.
 const validTransaction=tx=>typeof tx==='string'&&
   /^[A-Za-z0-9+/=_-]{8,2048}$/.test(tx);
 async function beginTransaction(){
  const r=await call(':beginTransaction','POST',{options:{readWrite:{}}});
  if(!validTransaction(r?.transaction))throw new Fault('transaction_unavailable',503);
  return r.transaction;
 }
 async function getInTransaction(path,transaction){
  if(!validTransaction(transaction)||!/^[-A-Za-z0-9_/]{1,240}$/.test(path)||
     path.includes('//'))throw new Fault('invalid_transaction_read',503);
  const r=await call('/'+path+'?transaction='+encodeURIComponent(transaction));
  return r?{data:unpack({mapValue:{fields:r.fields||{}}}),version:r.updateTime}:null;
 }
 async function commitTransaction(transaction,writes){
  if(!validTransaction(transaction)||!Array.isArray(writes)||!writes.length||
    writes.length>8||writes.some(w=>!w?.update?.name?.startsWith(root+'/')||
    !w.currentDocument||!(w.currentDocument.updateTime||w.currentDocument.exists===false)))
   throw new Fault('unsafe_transaction_commit',503);
  return call(':commit','POST',{writes,transaction});
 }
 async function rollbackTransaction(transaction){
  if(!validTransaction(transaction))return;
  try{await call(':rollback','POST',{transaction});}catch{/* rollback best-effort, no writes were committed */}
 }

 async function pending(){
  const result=await call(':runQuery','POST',{structuredQuery:{from:[{collectionId:'stripe_checkout_sessions'}],where:{fieldFilter:{field:{fieldPath:'reconcilePending'},op:'EQUAL',value:{booleanValue:true}}},limit:50}});
  return result.filter(r=>r.document).map(r=>unpack({mapValue:{fields:r.document.fields}}));
 }
 async function reviews(){
  const result=await call(':runQuery','POST',{structuredQuery:{from:[{collectionId:'stripe_review_queue'}],where:{fieldFilter:{field:{fieldPath:'resolved'},op:'EQUAL',value:{booleanValue:false}}},limit:50}});
  return result.filter(r=>r.document).map(r=>unpack({mapValue:{fields:r.document.fields}}));
 }
 async function refundPending(){
  const result=await call(':runQuery','POST',{structuredQuery:{from:[{collectionId:'stripe_refund_queue'}],where:{fieldFilter:{field:{fieldPath:'resolved'},op:'EQUAL',value:{booleanValue:false}}},limit:50}});
  return result.filter(r=>r.document).map(r=>unpack({mapValue:{fields:r.document.fields}}));
 }
 return {get,commit,root,write,writePatch,pending,reviews,refundPending,
  beginTransaction,getInTransaction,commitTransaction,rollbackTransaction};
}
