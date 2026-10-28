// Staged storefront adapter. Import only in the separately reviewed storefront patch.
// Never invokes Firestore, submitCustomerOrder(), or browser inventory mutations.
export function stripeCheckoutClient({endpoint,storage,net=fetch,randomBytes=()=>crypto.getRandomValues(new Uint8Array(32))}){
 if(!['https://kandorty-stripe-release.aliyajan200011.workers.dev','https://kandorty-stripe-release-test.aliyajan200011.workers.dev'].includes(endpoint))throw new Error('invalid_stripe_endpoint');
 const key='kandorty_server_stripe_v1';
 const read=()=>{try{return JSON.parse(storage.getItem(key)||'null');}catch{return null;}};
 async function post(path,body,headers={}){
  const r=await net(endpoint+path,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  const data=await r.json();if(!r.ok)throw new Error(data.error||'stripe_unavailable');return data;
 }
 return {
  async start({customer,items,note='',turnstileToken,stagingKey}){
   const request={customer,items:items.map(i=>({id:i.id,qty:i.qty,imageIndex:i.imageIndex??0})),note};
   const fingerprint=JSON.stringify(request);let state=read();
   if(state&&state.fingerprint!==fingerprint)throw new Error('pending_checkout_changed');
   if(!state){state={fingerprint,checkoutToken:Array.from(randomBytes(),b=>b.toString(16).padStart(2,'0')).join('')};storage.setItem(key,JSON.stringify(state));}
   const result=await post('/create-checkout-session',{...request,checkoutToken:state.checkoutToken,...(turnstileToken?{turnstileToken}:{})},stagingKey?{'X-Staging-Key':stagingKey}:{});
   storage.setItem(key,JSON.stringify({...state,receipt:result.receipt,manageToken:result.manageToken,orderId:result.orderId}));
   return result;
  },
  async startCod({customer,items,note='',turnstileToken,stagingKey}){
   const request={customer,items:items.map(i=>({id:i.id,qty:i.qty,imageIndex:i.imageIndex??0})),note};
   const fingerprint=JSON.stringify(request),codKey=key+'_cod';let state=JSON.parse(storage.getItem(codKey)||'null');
   if(state&&state.fingerprint!==fingerprint)throw new Error('pending_checkout_changed');
   if(!state){state={fingerprint,checkoutToken:Array.from(randomBytes(),b=>b.toString(16).padStart(2,'0')).join('')};storage.setItem(codKey,JSON.stringify(state));}
   const r=await post('/cod/orders',{...request,checkoutToken:state.checkoutToken,...(turnstileToken?{turnstileToken}:{})},stagingKey?{'X-Staging-Key':stagingKey}:{});
   storage.setItem('kandorty_stripe_receipt_'+r.order.id,r.receipt);storage.setItem('kandorty_order_manage_'+r.order.id,r.manageToken);storage.removeItem(codKey);return r;
  },
  async cancel(orderId,stagingKey){
   const p=read(),receipt=storage.getItem('kandorty_stripe_receipt_'+orderId)||(p?.orderId===orderId?p.receipt:null),manageToken=storage.getItem('kandorty_order_manage_'+orderId)||(p?.orderId===orderId?p.manageToken:null);
   if(!receipt||!manageToken)throw new Error('missing_manage_authority');
   return post('/orders/cancel',{orderId,manageToken},{Authorization:'Bearer '+receipt,...(stagingKey?{'X-Staging-Key':stagingKey}:{})});
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
