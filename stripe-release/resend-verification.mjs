// Manual, single-email Resend acceptance check. Never imported by any Worker,
// scheduler, frontend, backend handler or CI sending job. Configuration values
// must come from the operator's PRIVATE environment, not GitHub source/chat.
const validEmail=x=>typeof x==='string'&&x.length<=254&&
 /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(x);
export async function sendVerificationEmail(env={},transport=fetch){
 if(env.RESEND_TEST_SEND_CONFIRM!=='SEND_ONE_VERIFICATION_EMAIL')
  return Object.freeze({status:'disabled_no_send'});
 // Verifications are not allowed to run as Stripe Live operational alerts.
 if(env.STRIPE_MODE!=='test'||env.ALERT_DELIVERY_ENABLED==='true')
  throw Error('isolated_test_only');
 const {ALERT_EMAIL_TO:to,ALERT_EMAIL_FROM:from,RESEND_API_KEY:key,ALERT_EVENT_KEY:eventKey}=env;
 if(!validEmail(to)||!validEmail(from)||typeof key!=='string'||
    !/^re_[A-Za-z0-9_-]{8,}$/.test(key)||
    typeof eventKey!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(eventKey))
  throw Error('private_sender_recipient_or_key_not_configured');
 const subject='[Kandorty] Resend delivery verification TEST';
 const body=[
  'This is a one-time verification TEST for Kandorty operator emails.',
  'There is no real payment, refund, failed order or customer event.',
  'If you received this message in your inbox, report delivery confirmed.',
  'No response or payment is required.'
 ].join('\n');
 let response;
 try{
  response=await transport('https://api.resend.com/emails',{
   method:'POST',redirect:'manual',
   headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':eventKey},
   body:JSON.stringify({from,to:[to],subject,text:body}),
   signal:AbortSignal.timeout(15000)
  });
 }catch{throw Error('test_email_provider_unreachable');}
 if(!response?.ok)throw Error('test_email_provider_rejected');
 // Provider acceptance != actual inbox delivery; only recipient can confirm.
 return Object.freeze({status:'provider_accepted_delivery_not_confirmed'});
}
if(process.argv[1]?.endsWith('/resend-verification.mjs')){
 try{
  const result=await sendVerificationEmail(process.env);
  // No email addresses, secrets, tokens, provider payload or customer details.
  console.log('KANDORTY_EMAIL_TEST: '+result.status);
  if(result.status!=='provider_accepted_delivery_not_confirmed')process.exitCode=2;
 }catch{
  console.error('KANDORTY_EMAIL_TEST: not_sent_or_not_accepted; check private provider configuration');
  process.exitCode=2;
 }
}
