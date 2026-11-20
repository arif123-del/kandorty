import {Fault} from '../cod-staging/security.mjs';

const keyPath='admin_push_config/signing';
const devicesPath='admin_push_config/devices';
const encode=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const bytes=s=>new TextEncoder().encode(s);
export async function pushKeys(store){
 const existing=await store.get(keyPath);
 if(existing)return existing.data;
 const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const keys={privateKey:await crypto.subtle.exportKey('jwk',pair.privateKey),publicKey:encode(await crypto.subtle.exportKey('raw',pair.publicKey))};
 try{await store.commit([store.write(keyPath,keys,{exists:false})]);return keys;}
 catch(e){if(e.message!=='write_conflict')throw e;return (await store.get(keyPath)).data;}
}
function endpointUrl(endpoint){
 const url=new URL(endpoint);
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||endpoint.length>2048||
    !(url.hostname==='fcm.googleapis.com'||url.hostname==='updates.push.services.mozilla.com'||url.hostname==='web.push.apple.com'))throw new Fault('unsupported_push_service',400);
 return url;
}
async function updateDevices(store,change){
 for(let i=0;i<4;i++){
  const row=await store.get(devicesPath),list=row?.data.endpoints||[],next=change(list);
  if(next.length===list.length&&next.every((x,i)=>x===list[i]))return;
  if(next.length>24)throw new Fault('device_limit',409);
  try{await store.commit([store.write(devicesPath,{endpoints:next},row?{updateTime:row.version}:{exists:false})]);return;}
  catch(e){if(e.message!=='write_conflict')throw e;}
 }
 throw new Fault('database_busy',503);
}
export async function enroll(store,endpoint){
 endpointUrl(endpoint);await updateDevices(store,list=>[...new Set([...list,endpoint])]);
}
export async function sendOrderPush(store,net=fetch){
 const endpoints=(await store.get(devicesPath))?.data.endpoints||[];
 if(!endpoints.length)return;
 const keys=(await store.get(keyPath)).data;
 const key=await crypto.subtle.importKey('jwk',keys.privateKey,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const expired=[];
 const results=await Promise.allSettled(endpoints.map(async endpoint=>{
  const u=endpointUrl(endpoint),head=encode(bytes(JSON.stringify({alg:'ES256',typ:'JWT'})));
  const claims=encode(bytes(JSON.stringify({aud:u.origin,exp:Math.floor(Date.now()/1000)+3600,sub:'https://kandorty.online/admin.html'})));
  const token=head+'.'+claims;
  const sig=encode(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,bytes(token)));
  for(let attempt=0;attempt<2;attempt++){
   const response=await net(endpoint,{method:'POST',body:new Uint8Array(),redirect:'error',headers:{TTL:'3600',Urgency:'high',Authorization:'vapid t='+token+'.'+sig+', k='+keys.publicKey},signal:AbortSignal.timeout(7000)});
   if(response.ok)return;
   if([404,410].includes(response.status)){expired.push(endpoint);return;}
   if(response.status<500)break;
  }
  throw Error('push_delivery_failed');
 }));
 if(expired.length)await updateDevices(store,list=>list.filter(e=>!expired.includes(e)));
 if(results.some(r=>r.status==='rejected'))throw Error('push_delivery_failed');
}
// Authorize with the caller's Firebase ID token against the same Firestore
// rules protecting the admin orders list. Do not read or return customer data.
// Distinguish a genuine 403 from a Google API outage so auth fallback does
// not silently grant access when the upstream service is unavailable.
export async function requireOrderReader(request,cfg,net=fetch){
 const authorization=request.headers.get('Authorization')||'';
 if(!/^Bearer [^\s]{1,12000}$/.test(authorization))throw new Fault('admin_authorization_required',403);
 let response;
 try{
  response=await net('https://firestore.googleapis.com/v1/projects/'+cfg.projectId+'/databases/(default)/documents/orders?pageSize=1&mask.fieldPaths=id',
   {headers:{Authorization:authorization},redirect:'error',signal:AbortSignal.timeout(8000)});
 }catch{
  throw new Fault('admin_reader_unavailable',503);
 }
 try{await response.body?.cancel();}catch{/* the request's status is still authoritative */}
 if(response.ok)return;
 if(response.status===401||response.status===403)throw new Fault('admin_authorization_required',403);
 throw new Fault('admin_reader_unavailable',503);
}
