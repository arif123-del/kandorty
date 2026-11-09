// DRAFT ONLY: privacy-minimized, opt-in email delivery adapter for aggregate
// operational attention reports. Not imported by the Worker or any scheduled job.
// NEVER commit recipient address, Resend key, sender identity or customer data.
const isEmail=x=>typeof x==='string'&&x.length<=254&&/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(x);
const count=(report,k)=>{const n=report[k];if(!Number.isSafeInteger(n)||n<0||n>1000000)throw Error('invalid_report_count');return n;};
export function operationalEmail(report){
 if(!report||typeof report!=='object'||typeof report.requiresAttention!=='boolean')throw Error('invalid_operational_report');
 if(!report.requiresAttention)return null;
 const pending=count(report,'pendingSample');
 const review=count(report,'reviewSample');
 const refund=count(report,'refundPendingSample');
 const overduePending=count(report,'overduePendingCount');
 const overdueRefund=count(report,'overdueRefundCount');
 if(typeof report.scanLimitReached!=='boolean')throw Error('invalid_scan_limit_flag');
 // Fixed text and independently validated numeric fields only, not raw report
 // serialization, order identifiers, customer addresses, payment tokens or notes.
 return Object.freeze({
  subject:'[Kandorty] Payment operations require attention',
  text:[
   'Kandorty payment operations attention (aggregate counts only).',
   'Unsettled checkout sample: '+pending,
   'Paid stock-review sample: '+review,
   'Pending cancellation-refund sample: '+refund,
   'Overdue checkout sample: '+overduePending,
   'Overdue cancellation-refund sample: '+overdueRefund,
   'Queue scan reached the 50-record sample limit: '+(report.scanLimitReached?'YES':'NO'),
   'These are bounded samples; never assume they represent the full backlog.',
   'Review the authenticated operations dashboard and Stripe provider evidence.',
   'Never refund, mark paid or restore stock solely because of this email.'
  ].join('\n')
 });
}
export async function sendOperationalEmail(report,env,transport=fetch){
 const message=operationalEmail(report);
 if(!message)return Object.freeze({status:'healthy_no_send'});
 // Intentional default OFF. Only an explicitly authorized and secured future
 // operator job may turn this on; this module does not schedule any work.
 if(env?.ALERT_DELIVERY_ENABLED!=='true')return Object.freeze({status:'disabled_no_send'});
 if(env.STRIPE_MODE!=='test'&&env.STRIPE_MODE!=='live')throw Error('invalid_delivery_mode');
 const to=env.ALERT_EMAIL_TO,from=env.ALERT_EMAIL_FROM,apiKey=env.RESEND_API_KEY,
  eventKey=env.ALERT_EVENT_KEY;
 if(!isEmail(to)||!isEmail(from)||typeof apiKey!=='string'||!/^re_[A-Za-z0-9_\-]{8,}$/.test(apiKey))
  throw Error('alert_delivery_not_configured');
 const response=await transport('https://api.resend.com/emails',{
  method:'POST',redirect:'manual',headers:{
   'Authorization':'Bearer '+apiKey,'Content-Type':'application/json',
   'Idempotency-Key':eventKey
  },body:JSON.stringify({from,to:[to],subject:message.subject,text:message.text}),
  signal:AbortSignal.timeout(15000)
 });
 if(!response?.ok)throw Error('alert_delivery_failed');
 return Object.freeze({status:'accepted_by_provider_not_delivered'});
}
