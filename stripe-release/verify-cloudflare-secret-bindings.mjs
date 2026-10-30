// Read-only Cloudflare Worker secret-NAME preflight. Do not print API responses,
// token values, secret values, or any secret contents. This proves names only.
export const REQUIRED_SECRET_NAMES=Object.freeze([
 'FIREBASE_SERVICE_ACCOUNT_JSON','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET',
 'STRIPE_RECEIPT_SECRET','TURNSTILE_SECRET_KEY'
]);
export function missingSecretNames(records){
 if(!Array.isArray(records))throw new Error('invalid_secret_metadata');
 const names=new Set();
 for(const item of records){
  if(!item||typeof item.name!=='string'||!['secret_text','secret_key','secret'].includes(item.type))
   throw new Error('invalid_secret_metadata');
  names.add(item.name);
 }
 return REQUIRED_SECRET_NAMES.filter(name=>!names.has(name));
}
export async function verifySecretPresence({accountId,apiToken,net=fetch}){
 if(typeof accountId!=='string'||!/^[a-f0-9]{32}$/i.test(accountId)||
    typeof apiToken!=='string'||apiToken.length<10)throw new Error('cloudflare_auth_not_configured');
 const r=await net('https://api.cloudflare.com/client/v4/accounts/'+accountId+'/workers/scripts/kandorty-stripe-release/secrets',{
  method:'GET',redirect:'error',headers:{Authorization:'Bearer '+apiToken,Accept:'application/json'},
  signal:AbortSignal.timeout(15000)
 });
 if(!r.ok)throw new Error('cloudflare_read_denied');
 const json=await r.json();
 if(json.success!==true)throw new Error('cloudflare_read_denied');
 return missingSecretNames(json.result);
}
if(process.argv[1]?.endsWith('/verify-cloudflare-secret-bindings.mjs')){
 try{
  const missing=await verifySecretPresence({
   accountId:process.env.CLOUDFLARE_ACCOUNT_ID,
   apiToken:process.env.CLOUDFLARE_API_TOKEN
  });
  console.log('CLOUDFLARE_SECRETS_METADATA_READ: PASS');
  // Names are setup identifiers, NOT the stored secret values.
  for(const name of REQUIRED_SECRET_NAMES)console.log('CLOUDFLARE_SECRET '+name+': '+(missing.includes(name)?'MISSING':'PRESENT_NAME_ONLY'));
  console.log('CLOUDFLARE_SECRET_VALUE_VALIDITY: NOT_VERIFIED');
  console.log('LIVE_GATE_ACTIVATION: NOT_PERFORMED');
  if(missing.length)process.exitCode=2;
 }catch{
  console.log('CLOUDFLARE_SECRETS_METADATA_READ: BLOCKED');
  console.log('LIVE_GATE_ACTIVATION: NOT_PERFORMED');
  process.exitCode=2;
 }
}
