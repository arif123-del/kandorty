import {settle} from '../payment-integration/settlement.mjs';
import {prepareCodOrder,normalizeCodRequest,CodFault} from '../stripe-live-candidate/cod.mjs';
import {createStore} from './firestore.mjs';
import {Fault,hash,random,receipt,verifyReceipt,bodyJSON} from './security.mjs';
export const PROJECT='kandorty-stripe-test-5f8af';
const HOST='kandorty-cod-orders-test.aliyajan200011.workers.dev';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
const summary=o=>({id:o.id,status:o.status,payment:o.payment,paymentStatus:o.paymentStatus,total:o.total,deliveryFee:o.deliveryFee,items:o.items.map(i=>({id:i.id,name:i.name,qty:i.qty,price:i.price})),createdAt:o.createdAt,inventoryStatus:o.inventoryStatus});
export function handler(storeFactory=createStore){return async(request,env)=>{
 try{
  if(env.STRIPE_TEST_PROJECT_ID!==PROJECT||env.COD_MODE!=='test'||!/^[a-f0-9]{64}$/.test(env.STAGING_ACCESS_SECRET||'')||!/^[a-f0-9]{64}$/.test(env.GUEST_RECEIPT_SECRET||''))throw new Fault('test_configuration_required',503);
  const url=new URL(request.url);
  if(url.hostname!==HOST||url.protocol!=='https:')throw new Fault('test_host_required',403);
  const origin=request.headers.get('Origin');
  if(origin&&origin!==url.origin)throw new Fault('origin_forbidden',403);
  // Private staging gate prevents public COD spam before production anti-bot rollout.
  if(await hash(request.headers.get('X-Staging-Key')||'')!==await hash(env.STAGING_ACCESS_SECRET))throw new Fault('staging_access_required',401);
  if(!env.IP_LIMITER||!env.PHONE_LIMITER)throw new Fault('rate_limit_unavailable',503);
  const ip=request.headers.get('CF-Connecting-IP')||'unknown';
  if(!(await env.IP_LIMITER.limit({key:await hash(ip)})).success)throw new Fault('rate_limited',429);
  if(url.pathname==='/health'&&request.method==='GET')return json({test:true,project:PROJECT});
  if(url.search)throw new Fault('query_not_allowed');
  const store=storeFactory(env);
  if(url.pathname==='/cod/orders'&&request.method==='POST'){
   const input=await bodyJSON(request),normalized=normalizeCodRequest(input);
   if(!(await env.PHONE_LIMITER.limit({key:await hash(normalized.customer.phone.replace(/\D/g,''))})).success)throw new Fault('rate_limited',429);
   const checkoutId=await hash(input.checkoutToken);
   for(let attempt=0;attempt<5;attempt++){
    const intent=(await store.get('cod_checkout_intents/'+checkoutId))?.data||null;
    const orderId=intent?.orderId||'KD-'+String(10000000+crypto.getRandomValues(new Uint32Array(1))[0]%90000000);
    const existing=intent?(await store.get('orders/'+orderId))?.data||null:null;
    const products={};
    if(!intent)for(const id of new Set(normalized.items.map(i=>i.id))){
     const row=await store.get('products/'+id);if(row)products[id]={data:row.data,updateTime:row.version};
    }
    const accessKey=await hash(orderId+'|'+normalized.customer.phone.replace(/\D/g,''));
    let plan;
    try{plan=await prepareCodOrder({request:input,projectId:PROJECT,testOnly:true,orderId,editToken:random(24),accessKey,products,nowISO:new Date().toISOString(),existingIntent:intent,existingOrder:existing});}
    catch(e){
     // The initial intent read can precede another retry's atomic commit while
     // the catalog read follows it. Recheck the token before reporting sold-out.
     if(!intent&&e instanceof CodFault&&['insufficient_stock','unavailable_product'].includes(e.code)&&await store.get('cod_checkout_intents/'+checkoutId))continue;
     throw e;
    }
    try{if(plan.writes.length)await store.commit(plan.writes);}catch(e){if(e.message==='write_conflict')continue;throw e;}
    return json({test:true,replay:plan.replay,order:summary(plan.order),receiptToken:await receipt(env.GUEST_RECEIPT_SECRET,orderId,checkoutId)},plan.replay?200:201);
   }
   throw new Fault('database_busy',503);
  }
  const paymentRoute=url.pathname.match(/^\/payments\/(stripe|ziina)\/finalize$/);
  if(paymentRoute&&request.method==='POST'){
   const input=await bodyJSON(request);
   if(!input||Object.keys(input).length!==1||!/^[a-f0-9]{64}$/.test(input.checkoutToken||''))throw new Fault('invalid_checkout');
   const provider=paymentRoute[1],checkoutId=await hash(provider+':'+input.checkoutToken);
   const result=await settle({env,store,checkoutId,provider});
   return json({test:true,replay:result.replay,order:summary(result.order),receiptToken:await receipt(env.GUEST_RECEIPT_SECRET,result.order.id,checkoutId)});
  }
  const match=url.pathname.match(/^\/guest\/orders\/(KD-\d{8})$/);
  if(match&&request.method==='GET'){
   const token=request.headers.get('Authorization')?.replace(/^Bearer /,'');
   const checkoutId=await verifyReceipt(env.GUEST_RECEIPT_SECRET,token,match[1]);
   const codIntent=(await store.get('cod_checkout_intents/'+checkoutId))?.data;
   const intent=codIntent||(await store.get('payment_checkout_intents/'+checkoutId))?.data;
   if(!intent||intent.orderId!==match[1]||intent.fulfilled!==true)throw new Fault('invalid_receipt',401);
   const order=(await store.get('orders/'+match[1]))?.data;
   if(!order||(codIntent?order.payment!=='cod':order.payment!=='card'||order.paymentProvider!==intent.provider||order.paymentStatus!=='paid'))throw new Fault('order_unavailable',404);
   return json({test:true,order:summary(order)});
  }
  throw new Fault('not_found',404);
 }catch(e){
  if(e instanceof CodFault)return json({error:e.code},['checkout_conflict','partial_existing_order','insufficient_stock','unavailable_product'].includes(e.code)?409:400);
  return json({error:e instanceof Fault?e.message:'service_unavailable'},e instanceof Fault?e.status:503);
 }
};}
export default {fetch:handler()};
