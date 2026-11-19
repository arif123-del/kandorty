// Staged storefront adapter. Import only in the separately reviewed storefront patch.
// Never invokes Firestore, submitCustomerOrder(), or browser inventory mutations.
export function stripeCheckoutClient({endpoint,storage,net=fetch,randomBytes=()=>crypto.getRandomValues(new Uint8Array(32))}){
 if(!['https://kandorty-stripe-release.aliyajan200011.workers.dev','https://kandorty-stripe-release-test.aliyajan200011.workers.dev'].includes(endpoint))throw new Error('invalid_stripe_endpoint');
 const key='kandorty_server_stripe_v1';
 const validId=id=>typeof id==='string'&&/^KD-\d{8}$/.test(id);
 const validSecret=value=>typeof value==='string'&&value.length>0;
 const read=()=>{try{return JSON.parse(storage.getItem(key)||'null');}catch{return null;}};
 function checkoutRequest(customer,items,note,storageKey){
   const phone=String(customer.phone??'').trim()
     .replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-0x660))
     .replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-0x6f0))
     .replace(/[\u200e\u200f\u061c]/g,'');
   const digits=phone.replace(/\D/g,'');
   if(!/^[+0-9() .-]+$/.test(phone)||digits.length<6||digits.length>18)
     throw new Error('invalid_customer_phone');
   let state=JSON.parse(storage.getItem(storageKey)||'null');
   const request={customer:{...customer,phone},items:items.map(i=>({id:i.id,qty:i.qty,imageIndex:i.imageIndex??0})),note};
   // Keep the original representation for an existing retry if the server accepts it.
   if(phone.length>30)request.customer.phone=(phone.startsWith('+')?'+':'')+digits;
   const fingerprint=JSON.stringify(request);
   if(state&&state.fingerprint!==fingerprint){
     let previousPhone;
     try{previousPhone=JSON.parse(state.fingerprint).customer.phone;}catch{}
     const previousDigits=typeof previousPhone==='string'?previousPhone.replace(/\D/g,'').length:null;
     // The server rejects these phone values before reading or writing any order.
     if(state.receipt||state.orderId||state.manageToken||previousDigits===null||
        (previousDigits>=6&&previousDigits<=18&&previousPhone.length<=30))
       throw new Error('pending_checkout_changed');
     state=null;
   }
   if(!state){
     state={fingerprint,checkoutToken:Array.from(randomBytes(),b=>b.toString(16).padStart(2,'0')).join('')};
     storage.setItem(storageKey,JSON.stringify(state));
   }
   return {request,state};
 }
 async function post(path,body,headers={}){
  const r=await net(endpoint+path,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  const data=await r.json();if(!r.ok)throw new Error(data.error||'stripe_unavailable');return data;
 }
 return {
  async start({customer,items,note='',turnstileToken,stagingKey}){
   const {request,state}=checkoutRequest(customer,items,note,key);
   const result=await post('/create-checkout-session',{...request,checkoutToken:state.checkoutToken,...(turnstileToken?{turnstileToken}:{})},stagingKey?{'X-Staging-Key':stagingKey}:{});
   if(!validId(result?.orderId)||!validSecret(result?.receipt))throw new Error('invalid_checkout_response');
   // Preserve the request idempotency token on invalid responses; never store bogus receipts.
   storage.setItem(key,JSON.stringify({...state,receipt:result.receipt,manageToken:result.manageToken,orderId:result.orderId}));
   return result;
  },
  async startCod({customer,items,note='',turnstileToken,stagingKey}){
   const codKey=key+'_cod';
   const {request,state}=checkoutRequest(customer,items,note,codKey);
   const r=await post('/cod/orders',{...request,checkoutToken:state.checkoutToken,...(turnstileToken?{turnstileToken}:{})},stagingKey?{'X-Staging-Key':stagingKey}:{});
   if(!validId(r?.order?.id)||r.order.payment!=='cod'||!validSecret(r.receipt)||!validSecret(r.manageToken))throw new Error('invalid_cod_response');
   // Never acknowledge a COD order or delete its retry key without a matching server receipt.
   storage.setItem('kandorty_stripe_receipt_'+r.order.id,r.receipt);storage.setItem('kandorty_order_manage_'+r.order.id,r.manageToken);storage.removeItem(codKey);return r;
  },
  async cancel(orderId,stagingKey){
   const p=read(),receipt=storage.getItem('kandorty_stripe_receipt_'+orderId)||(p?.orderId===orderId?p.receipt:null),manageToken=storage.getItem('kandorty_order_manage_'+orderId)||(p?.orderId===orderId?p.manageToken:null);
   if(!receipt||!manageToken)throw new Error('missing_manage_authority');
   const result=await post('/orders/cancel',{orderId,manageToken},{Authorization:'Bearer '+receipt,...(stagingKey?{'X-Staging-Key':stagingKey}:{})});
   if(result?.order?.id!==orderId||result.order.status!=='cancelled')throw new Error('invalid_cancellation_response');
   return result;
  },
  async status(stagingKey){
   const s=read();if(!s?.receipt)throw new Error('missing_checkout_receipt');
   return post('/checkout/status',{}, {Authorization:'Bearer '+s.receipt,...(stagingKey?{'X-Staging-Key':stagingKey}:{})});
  },
  async track(orderId,stagingKey){
   const pending=read(),receipt=storage.getItem('kandorty_stripe_receipt_'+orderId)||(pending?.orderId===orderId?pending.receipt:null);
   if(!receipt)throw new Error('missing_checkout_receipt');
   return post('/checkout/status',{}, {Authorization:'Bearer '+receipt,...(stagingKey?{'X-Staging-Key':stagingKey}:{})});
  },
  hasReceipt(orderId){const pending=read();return !!(storage.getItem('kandorty_stripe_receipt_'+orderId)||(pending?.orderId===orderId&&pending.receipt));},
  archiveConfirmed(order){
   const s=read();if(!s||s.orderId!==order.id||order.paymentStatus!=='paid')throw new Error('order_not_confirmed');
   storage.setItem('kandorty_stripe_receipt_'+order.id,s.receipt);if(s.manageToken)storage.setItem('kandorty_order_manage_'+order.id,s.manageToken);storage.removeItem(key);
  }
 };
}
