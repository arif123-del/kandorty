// Isolated Kandorty TEST Worker only. READ-ONLY historical config search.
// Do not print address values, API credentials, private Worker version details,
// or any binding metadata other than the named, coarse diagnostic flags.
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const script='kandorty-stripe-release-test';
const base='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/'+script;
const safe=async path=>{
 try{
  const res=await fetch(base+path,{headers:{Authorization:'Bearer '+token,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!res.ok)return null;
  const json=await res.json();
  return json.success===false?null:json.result;
 }catch{return null;}
};
if(!/^[a-f0-9]{32}$/i.test(account||'')||typeof token!=='string'||token.length<10){
 console.log('TEST_PREVIOUS_CONFIG_READ: BLOCKED_PRIVATE_AUTH');
 process.exitCode=2;
}else{
 const versions=await safe('/versions?per_page=40');
 const list=Array.isArray(versions)?versions:versions?.items;
 if(!Array.isArray(list)){
  console.log('TEST_PREVIOUS_CONFIG_READ: BLOCKED_LIST');
  process.exitCode=2;
 }else{
  let matches=0,scanned=0;
  // A prior version may contain the operator's dashboard-input plain-text
  // email addresses. Values stay private to this job's memory.
  for(const v of list.slice(0,40)){
   if(typeof v.id!=='string'||!/^[a-f0-9-]{36}$/i.test(v.id))continue;
   const details=await safe('/versions/'+v.id);
   const bindings=details?.resources?.bindings;
   if(!Array.isArray(bindings))continue;
   scanned++;
   const byName=new Map(bindings.filter(b=>typeof b.name==='string').map(b=>[b.name,b]));
   const from=byName.get('ALERT_EMAIL_FROM');
   const to=byName.get('ALERT_EMAIL_TO');
   const enabled=byName.get('ALERT_DELIVERY_ENABLED');
   if(from?.type==='plain_text'&&
      typeof from.text==='string'&&/^alerts@[-.a-z0-9]+$/i.test(from.text)&&
      to?.type==='plain_text'&&typeof to.text==='string'&&
      /^[^\\s@<>]+@gmail\\.com$/i.test(to.text)&&
      enabled?.type==='plain_text'&&enabled.text==='true')matches++;
  }
  console.log('TEST_PREVIOUS_CONFIG_READ: COMPLETED');
  console.log('TEST_PREVIOUS_WORKER_VERSIONS_INSPECTED: '+scanned);
  console.log('TEST_PREVIOUS_COMPLETE_ALERT_BINDINGS_AVAILABLE: '+(matches>0?'YES':'NO'));
  console.log('TEST_CONFIG_RESTORE_OR_MUTATION: NOT_PERFORMED');
  console.log('TEST_EMAIL_ADDRESSES_IN_OUTPUT: NONE');
 }
}
