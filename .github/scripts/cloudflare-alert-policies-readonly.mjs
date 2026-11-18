// Cloudflare account notification policies: READ ONLY, no destination addresses
// printed or persisted. Does not configure/change monitoring or delivery.
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const say=(k,v)=>console.log('CLOUDFLARE_ALERT_POLICY_AUDIT '+k+': '+v);
if(!/^[a-f0-9]{32}$/i.test(account||'')||typeof token!=='string'||token.length<10){
 say('STATUS','BLOCKED_PRIVATE_AUTH');process.exitCode=2;
}else try{
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/alerting/v3/policies',{
  method:'GET',redirect:'error',headers:{Authorization:'Bearer '+token,Accept:'application/json'},
  signal:AbortSignal.timeout(15000)
 });
 if(!r.ok){say('STATUS','READ_ACCESS_NOT_GRANTED');process.exitCode=2;}
 else{
  const data=await r.json();
  if(data.success!==true||!Array.isArray(data.result)){
   say('STATUS','RESPONSE_NOT_VERIFIABLE');process.exitCode=2;
  }else{
   const enabled=data.result.filter(p=>p.enabled===true);
   const workers=enabled.filter(p=>['workers_alert','workers_observability_alert'].includes(p.alert_type));
   const emails=workers.filter(p=>Array.isArray(p.mechanisms?.email)&&p.mechanisms.email.length>0);
   say('STATUS','METADATA_READ_ONLY_OK');
   say('ENABLED_WORKERS_POLICY_COUNT',workers.length);
   say('ENABLED_WORKERS_POLICY_WITH_EMAIL_DESTINATION',emails.length);
   say('BACKUP_CONTACT','NOT_VERIFIED');
   say('NOTIFICATION_DELIVERY','NOT_VERIFIED_BY_POLICY_METADATA');
  }
 }
}catch{
 say('STATUS','READ_FAILED_NO_PRIVATE_OUTPUT');process.exitCode=2;
}
say('NO_ACCOUNT_OR_WORKER_CHANGES','TRUE');
