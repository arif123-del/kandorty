// Strictly read-only Cloudflare diagnostic for Kandorty's ISOLATED TEST Worker.
// No deployments, writes, API responses, secrets or customer data are logged.
// Run only in a private GitHub Actions job where the existing Cloudflare token is a masked secret.
const WORKER='kandorty-stripe-release-test';
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
const secretNames=['RESEND_API_KEY','ALERT_EMAIL_FROM','ALERT_EMAIL_TO'];
if(!/^[a-f0-9]{32}$/i.test(account||'')||typeof token!=='string'||token.length<10) {
 console.log('CLOUDFLARE_TEST_AUDIT: MISSING_PRIVATE_AUTH');
 process.exitCode=2;
} else {
 const base='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/'+WORKER;
 const headers={Authorization:'Bearer '+token,Accept:'application/json'};
 const safeRead=async(url,method='GET',body)=>{
  try{
   const r=await fetch(url,{method,headers:{...headers,...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(15000)});
   if(!r.ok)return null;
   const data=await r.json();
   if(data.success===false)return null;
   return data;
  }catch{return null;}
 };
 const schedules=await safeRead(base+'/schedules');
 const runs=schedules?.result?.schedules||schedules?.result;
 if(!Array.isArray(runs)){
  console.log('TEST_CRON_SCHEDULES: READ_BLOCKED');
  process.exitCode=2;
 }else{
  const crons=runs.map(x=>x?.cron).filter(x=>typeof x==='string');
  console.log('TEST_CRON_SCHEDULES: '+(crons.includes('*/5 * * * *')?'EXPECTED_FIVE_MINUTES_PRESENT':'EXPECTED_FIVE_MINUTES_MISSING'));
  console.log('TEST_CRON_SCHEDULE_COUNT: '+crons.length);
  if(!crons.includes('*/5 * * * *'))process.exitCode=2;
 }
 const settings=await safeRead(base+'/settings');
 const bindings=settings?.result?.bindings||settings?.result?.settings?.bindings;
 if(!Array.isArray(bindings)){
  console.log('TEST_WORKER_BINDINGS: READ_BLOCKED');
  process.exitCode=2;
 }else{
  console.log('TEST_WORKER_BINDINGS: METADATA_READ_ONLY');
  const byName=new Map(bindings.filter(x=>typeof x?.name==='string').map(x=>[x.name,x]));
  for(const name of secretNames){
   const binding=byName.get(name);
   const kind=binding?.type;
   const ok=kind==='secret_text'||kind==='secret_key'||kind==='secret';
   console.log(name+': '+(ok?'PRESENT_SECRET_NAME_ONLY':binding?'PRESENT_BUT_NOT_SECRET':'MISSING'));
   if(!ok)process.exitCode=2;
  }
  const toggle=byName.get('ALERT_DELIVERY_ENABLED');
  // Do not print configured value. Print only exact boolean interpretation.
  const enabled=toggle?.type==='plain_text'&&toggle.text==='true';
  console.log('TEST_ALERT_DELIVERY_ENABLED: '+(enabled?'ENABLED':toggle?'PRESENT_BUT_NOT_CONFIRMED_TRUE':'MISSING'));
  if(!enabled)process.exitCode=2;
 }
 // Analytics dataset combines HTTP and scheduled invocations. Do not falsely
 // present overall worker execution numbers as scheduled handler success.
 const end=new Date(),start=new Date(end.getTime()-60*60*1000);
 const query='query($a: string, $s: string, $from: string, $to: string){viewer{accounts(filter:{accountTag:$a}){workersInvocationsAdaptive(limit:100,filter:{scriptName:$s,datetime_geq:$from,datetime_leq:$to}){dimensions{status}sum{requests errors}}}}}';
 const metrics=await safeRead('https://api.cloudflare.com/client/v4/graphql','POST',{
  query,variables:{a:account,s:WORKER,from:start.toISOString(),to:end.toISOString()}
 });
 const samples=metrics?.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive;
 if(metrics?.errors?.length||!Array.isArray(samples)){
  console.log('TEST_WORKER_LAST_HOUR_METRICS: NOT_AVAILABLE');
 }else{
  const aggregate=samples.reduce((a,v)=>({
   requests:a.requests+(Number(v.sum?.requests)||0),
   errors:a.errors+(Number(v.sum?.errors)||0)}, {requests:0,errors:0});
  console.log('TEST_WORKER_LAST_HOUR_ALL_INVOCATIONS: '+aggregate.requests);
  console.log('TEST_WORKER_LAST_HOUR_ALL_INVOCATION_ERRORS: '+aggregate.errors);
  console.log('TEST_SCHEDULED_ONLY_SUCCESS: NOT_PROVEN_BY_THIS_METRIC');
 }
 console.log('AUTOMATIC_RESEND_INBOX_DELIVERY: NOT_PROVEN_BY_CONFIG_ONLY');
 console.log('STRIPE_LIVE_OR_PRODUCTION_CHANGES: NONE');
}
