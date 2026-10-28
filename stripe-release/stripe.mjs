import {Fault} from '../cod-staging/security.mjs';
export function stripeClient(cfg,net=fetch){
 async function api(path,body,idempotency){
  const r=await net('https://api.stripe.com/v1/checkout/sessions'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+cfg.key,'Stripe-Version':'2024-06-20',...(body?{'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':idempotency}:{})},...(body?{body}:{}),redirect:'manual',signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new Fault('stripe_unavailable',503);return r.json();
 }
 return {
  retrieve(id){if(!(cfg.live?/^cs_live_[A-Za-z0-9]+$/:/^cs_test_[A-Za-z0-9]+$/).test(id))throw new Fault('session_mode_mismatch',409);return api('/'+id);},
  create(s){
   const body=new URLSearchParams({mode:'payment',client_reference_id:s.orderId,'metadata[checkout_id]':s.checkoutId,'metadata[order_id]':s.orderId,'metadata[integration]':'kandorty-stripe-v1',success_url:cfg.base+'/?stripe=success',cancel_url:cfg.base+'/?stripe=cancel','payment_method_types[0]':'card',expires_at:String(Math.floor(Date.parse(s.createdAt)/1000)+1800)});
   const lines=[...s.items.map(i=>({name:i.name,amount:i.unitAmount,qty:i.qty})),{name:'رسوم التوصيل',amount:2500,qty:1}];
   lines.forEach((i,n)=>{body.set(`line_items[${n}][price_data][currency]`,'aed');body.set(`line_items[${n}][price_data][unit_amount]`,String(i.amount));body.set(`line_items[${n}][price_data][product_data][name]`,i.name);body.set(`line_items[${n}][quantity]`,String(i.qty));});
   return api('',body,'kandorty-'+cfg.mode+'-'+s.checkoutId);
  }
 };
}
