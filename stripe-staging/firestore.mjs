import {Fault} from './core.mjs';
const enc=new TextEncoder();
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
export function pack(v){if(v===null)return {nullValue:null};if(typeof v==='string')return {stringValue:v};if(typeof v==='boolean')return {booleanValue:v};if(typeof v==='number')return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};if(Array.isArray(v))return {arrayValue:{values:v.map(pack)}};return {mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,pack(x)]))}};}
export function unpack(v){if('stringValue'in v)return v.stringValue;if('integerValue'in v)return Number(v.integerValue);if('doubleValue'in v)return v.doubleValue;if('booleanValue'in v)return v.booleanValue;if('nullValue'in v)return null;if('arrayValue'in v)return(v.arrayValue.values||[]).map(unpack);return Object.fromEntries(Object.entries(v.mapValue?.fields||{}).map(([k,x])=>[k,unpack(x)]));}
export function createStore(env,net=fetch){
 let account;try{account=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);}catch{throw new Fault('database_not_configured',503);}
 // This candidate deliberately refuses the real store project, even with admin credentials.
 if(!/^[a-z][a-z0-9-]{4,60}$/.test(env.STRIPE_TEST_PROJECT_ID||'')||env.STRIPE_TEST_PROJECT_ID==='kandorty-9378a'||account.project_id!==env.STRIPE_TEST_PROJECT_ID)throw new Fault('isolated_test_project_required',503);
 // Validate the staged JSON structure without ever logging or returning its secret fields.
 if(typeof account.private_key!=='string'||!account.private_key.includes('-----BEGIN PRIVATE KEY-----')||
    typeof account.client_email!=='string'||!account.client_email.endsWith('.iam.gserviceaccount.com'))
   throw new Fault('invalid_staging_service_account_json',503);
 const root=`projects/${env.STRIPE_TEST_PROJECT_ID}/databases/(default)/documents`;
 const snapPath=id=>`stripe_test_checkout_sessions/${id}`,orderPath=id=>`stripe_test_orders/${id}`;
 let cachedToken='',expiry=0;
 async function token(){
  if(cachedToken&&expiry>Date.now()+60000)return cachedToken;
  const now=Math.floor(Date.now()/1000);
  const input=b64(enc.encode(JSON.stringify({alg:'RS256',typ:'JWT'})))+'.'+b64(enc.encode(JSON.stringify({iss:account.client_email,scope:'https://www.googleapis.com/auth/datastore',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600})));
  let key;
  try {
   const der=Uint8Array.from(atob(account.private_key.replace(/-----[^-]+-----/g,'').replace(/\s/g,'')),x=>x.charCodeAt(0));
   key=await crypto.subtle.importKey('pkcs8',der,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  } catch {
   throw new Fault('invalid_staging_private_key',503);
  }
  const assertion=input+'.'+b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,enc.encode(input)));
  const r=await net('https://oauth2.googleapis.com/token',{method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new Fault('database_auth_failed',503);const result=await r.json();if(!result.access_token)throw new Fault('database_auth_failed',503);
  cachedToken=result.access_token;expiry=Date.now()+Number(result.expires_in||3600)*1000;return cachedToken;
 }
 async function call(path,method='GET',body){
  const r=await net('https://firestore.googleapis.com/v1/'+root+path,{method,redirect:'error',headers:{Authorization:'Bearer '+await token(),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  if(method==='GET'&&r.status===404)return null;
  if(!r.ok){const data=await r.json().catch(()=>({}));if(['ALREADY_EXISTS','FAILED_PRECONDITION','ABORTED'].includes(data.error?.status))throw new Fault('write_conflict',409);throw new Fault('database_unavailable',503);}
  return r.json();
 }
 async function get(path){const d=await call('/'+path);return d?{data:unpack({mapValue:{fields:d.fields||{}}}),version:d.updateTime}:null;}
 function write(path,data,condition){return {update:{name:root+'/'+path,fields:pack(data).mapValue.fields},currentDocument:condition};}
 async function commit(writes){return call(':commit','POST',{writes});}
 async function retry(fn){for(let i=0;i<5;i++){try{return await fn();}catch(e){if(e.message!=='write_conflict')throw e;}}throw new Fault('database_busy',503);}
 return {
  async getProduct(id){return(await get('products/'+id))?.data||null;},
  async getSnapshot(id){return(await get(snapPath(id)))?.data||null;},
  async createSnapshot(id,data){try{await commit([write(snapPath(id),data,{exists:false})]);return data;}catch(e){if(e.message!=='write_conflict')throw e;const existing=await get(snapPath(id));if(!existing)throw new Fault('database_busy',503);return existing.data;}},
  async bindSession(id,sessionId){return retry(async()=>{
   const s=await get(snapPath(id));if(!s)throw new Fault('unknown_checkout',409);
   if(s.data.sessionId){if(s.data.sessionId!==sessionId)throw new Fault('session_conflict',409);return;}
   await commit([write(snapPath(id),{...s.data,sessionId},{updateTime:s.version})]);
  });},
  async finalize(id,sessionId,order){return retry(async()=>{
   const s=await get(snapPath(id));if(!s||s.data.sessionId!==sessionId)throw new Fault('session_conflict',409);
   const existing=await get(orderPath(id));
   if(existing){if(existing.data.stripeSessionId!==sessionId||!s.data.fulfilled)throw new Fault('inconsistent_order',503);return existing.data;}
   // Two creates/updates succeed together or not at all, including concurrent webhook deliveries.
   await commit([write(orderPath(id),order,{exists:false}),write(snapPath(id),{...s.data,fulfilled:true},{updateTime:s.version})]);return order;
  });}
 };
}
