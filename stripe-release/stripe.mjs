import {Fault} from '../cod-staging/security.mjs';
import {STRIPE_REST_API_VERSION} from './webhook-contract.mjs';
export function stripeClient(cfg,net=fetch){
 async function api(path,body,idempotency,root='/checkout/sessions'){
  const r=await net('https://api.stripe.com/v1'+root+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+cfg.key,'Stripe-Version':STRIPE_REST_API_VERSION,...(body?{'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':idempotency}:{})},...(body?{body}:{}),redirect:'manual',signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new Fault('stripe_unavailable',503);return r.json();
 }
 return {
  async refundState(sessionId,snapshot){
   if(!(cfg.live?/^cs_live_[A-Za-z0-9]+$/:/^cs_test_[A-Za-z0-9]+$/).test(sessionId))throw new Fault('session_mode_mismatch',409);
   const s=await api('/'+sessionId+'?expand[]=payment_intent');
   if(s.id!==snapshot.sessionId||s.livemode!==cfg.live||s.metadata?.checkout_id!==snapshot.checkoutId||s.metadata?.order_id!==snapshot.orderId||s.metadata?.integration!=='kandorty-stripe-v1'||s.client_reference_id!==snapshot.orderId||s.amount_total!==snapshot.totalFils||s.currency!=='aed'||s.payment_status!=='paid')throw new Fault('refund_binding_mismatch',409);
   const pi=s.payment_intent;
   if(!pi||typeof pi!=='object'||!/^pi_[A-Za-z0-9]+$/.test(pi.id)||pi.livemode!==cfg.live||pi.currency!=='aed'||pi.amount_received!==snapshot.totalFils)throw new Fault('refund_payment_mismatch',409);
   let cursor='',amount=0,pending=false,failed=false;
   for(let page=0;page<10;page++){
    const list=await api('?payment_intent='+pi.id+'&limit=100'+(cursor?'&starting_after='+cursor:''),null,null,'/refunds');
    if(!Array.isArray(list.data))throw new Fault('refund_response_invalid',503);
    for(const r of list.data){
     if(r.payment_intent!==pi.id||r.currency!=='aed'||!Number.isSafeInteger(r.amount)||r.amount<=0)throw new Fault('refund_binding_mismatch',409);
     if(r.status==='succeeded')amount+=r.amount;
     else if(['pending','requires_action'].includes(r.status))pending=true;
     else if(['failed','canceled'].includes(r.status))failed=true;
     else throw new Fault('refund_response_invalid',503);
    }
    if(!list.has_more){if(amount>snapshot.totalFils)throw new Fault('refund_amount_mismatch',409);return {amount,status:amount===snapshot.totalFils?'full':pending?'pending':amount>0?'partial':failed?'failed':'none'};}
    cursor=list.data.at(-1)?.id;if(!/^re_[A-Za-z0-9]+$/.test(cursor||''))throw new Fault('refund_response_invalid',503);
   }throw new Fault('refund_pagination_limit',503);
  },
  retrieve(id){if(!(cfg.live?/^cs_live_[A-Za-z0-9]+$/:/^cs_test_[A-Za-z0-9]+$/).test(id))throw new Fault('session_mode_mismatch',409);return api('/'+id);},
  create(s){
   const body=new URLSearchParams({mode:'payment',client_reference_id:s.orderId,'metadata[checkout_id]':s.checkoutId,'metadata[order_id]':s.orderId,'metadata[integration]':'kandorty-stripe-v1',success_url:cfg.base+'/?stripe=success',cancel_url:cfg.base+'/?stripe=cancel','payment_method_types[0]':'card',expires_at:String(Math.floor(Date.parse(s.createdAt)/1000)+1800)});
   const lines=[...s.items.map(i=>({name:i.name,amount:i.unitAmount,qty:i.qty})),{name:'رسوم التوصيل',amount:2500,qty:1}];
   lines.forEach((i,n)=>{body.set(`line_items[${n}][price_data][currency]`,'aed');body.set(`line_items[${n}][price_data][unit_amount]`,String(i.amount));body.set(`line_items[${n}][price_data][product_data][name]`,i.name);body.set(`line_items[${n}][quantity]`,String(i.qty));});
   return api('',body,'kandorty-'+cfg.mode+'-'+s.checkoutId);
  }
 };
}
