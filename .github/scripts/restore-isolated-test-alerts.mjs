// Owner-requested recovery of ONLY the isolated Kandorty TEST Worker's
// three alert configuration values from its own prior dashboard-edited version.
// No literal recipient/sender email addresses or credentials are in this file.
// This script is not for Live, other Workers, or general migration.
const worker='kandorty-stripe-release-test';
const project='kandorty-stripe-test-5f8af';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const base='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/'+worker;
const headers={Authorization:'Bearer '+token,Accept:'application/json'};
const names=['ALERT_EMAIL_FROM','ALERT_EMAIL_TO','ALERT_DELIVERY_ENABLED'];
const output=message=>console.log('TEST_ALERT_RESTORE: '+message);
const fail=message=>{output(message);process.exitCode=2;};
const api=async(path,method='GET',body)=>{
 try{
  const res=await fetch(base+path,{method,redirect:'error',headers:{
   ...headers,...(body?{'Content-Type':'application/json'}:{})
  },...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  if(!res.ok)return null;
  const json=await res.json();return json.success===false?null:json.result;
 }catch{return null;}
};
if(!/^[a-f0-9]{32}$/i.test(account||'')||typeof token!=='string'||token.length<10){
 fail('BLOCKED_PRIVATE_AUTH');
}else{
 const settings=await api('/settings'),bindings=settings?.bindings;
 if(!Array.isArray(bindings)){fail('BLOCKED_SETTINGS_READ');}
 else{
  const current=new Map(bindings.filter(b=>typeof b?.name==='string').map(b=>[b.name,b]));
  // No hidden Stripe Live switching: assert the exact isolated Firebase/test
  // provider mode and disabled release approval on the Worker being targeted.
  const safe=current.get('STRIPE_MODE')?.text==='test'&&
   current.get('FIREBASE_PROJECT_ID')?.text===project&&
   current.get('LIVE_RELEASE_APPROVAL')?.text==='NOT_APPROVED'&&
   current.get('RESEND_API_KEY')?.type==='secret_text';
  if(!safe)fail('BLOCKED_TEST_ISOLATION_GUARD');
  else if(names.some(n=>current.has(n))){
   // Never overwrite a manual user edit that may have happened after inspection.
   output('BLOCKED_CURRENT_ALERT_BINDING_EXISTS_NO_OVERWRITE');
   process.exitCode=2;
  }else{
   const list=await api('/versions?per_page=40');
   const versions=Array.isArray(list)?list:list?.items;
   if(!Array.isArray(versions))fail('BLOCKED_HISTORY_READ');
   else{
    let prior=null;
    for(const v of versions.slice(0,40)){
     if(!/^[a-f0-9-]{36}$/i.test(v?.id||''))continue;
     const creation=Date.parse(v?.metadata?.created_on||'');
     if(!Number.isFinite(creation)||Math.abs(Date.now()-creation)>8*60*60*1000)continue;
     const detail=await api('/versions/'+v.id);
     const old=detail?.resources?.bindings;
     if(!Array.isArray(old))continue;
     const byName=new Map(old.filter(b=>typeof b?.name==='string').map(b=>[b.name,b]));
     const from=byName.get('ALERT_EMAIL_FROM'),to=byName.get('ALERT_EMAIL_TO'),flag=byName.get('ALERT_DELIVERY_ENABLED');
     if(from?.type==='plain_text'&&from.text==='alerts@kandorty.online'&&
        to?.type==='plain_text'&&typeof to.text==='string'&&
        /^[A-Za-z0-9._%+-]+@gmail\.com$/.test(to.text)&&
        flag?.type==='plain_text'&&flag.text==='true'){
       prior={from:from.text,to:to.text,flag:'true'};
       break;
     }
    }
    if(!prior)fail('BLOCKED_NO_RECOVERABLE_OWNER_CONFIG');
    else{
     // Official secrets-bulk PATCH merges ONLY named bindings and leaves all
     // other secrets (Stripe, Firebase, receipt, staging gate) unchanged.
     const secret=(name,value)=>({name,type:'secret_text',text:value});
     const result=await api('/secrets-bulk','PATCH',{secrets:{
      ALERT_EMAIL_FROM:secret('ALERT_EMAIL_FROM',prior.from),
      ALERT_EMAIL_TO:secret('ALERT_EMAIL_TO',prior.to),
      ALERT_DELIVERY_ENABLED:secret('ALERT_DELIVERY_ENABLED',prior.flag)
     }});
     if(!result)fail('BLOCKED_PROVIDER_RESTORE_REJECTED');
     else{
      const verified=await api('/settings');
      const meta=new Map((verified?.bindings||[]).filter(b=>typeof b?.name==='string').map(b=>[b.name,b]));
      if(!names.every(n=>meta.get(n)?.type==='secret_text'))fail('BLOCKED_POST_RESTORE_METADATA');
      else{
       output('RESTORED_THREE_ALERT_SETTINGS_AS_SECRETS');
       console.log('TEST_ALERT_RESTORE: ORIGINAL_API_KEY_AND_OTHER_BINDINGS_UNTOUCHED');
       console.log('TEST_ALERT_RESTORE: SECRET_VALUES_NEVER_PRINTED');
       console.log('TEST_ALERT_RESTORE: STRIPE_LIVE_SITE_RULES_AND_ZIINA_UNCHANGED');
      }
     }
    }
   }
  }
 }
}
