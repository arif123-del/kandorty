import {prepareCodOrder,normalizeCodRequest,CodFault} from '../stripe-live-candidate/cod.mjs';
import {Fault,hash,random} from '../cod-staging/security.mjs';
import {publicOrder} from './service.mjs';
export function codService(cfg,store){
 if(store.root!==`projects/${cfg.projectId}/databases/(default)/documents`)throw new Fault('store_project_mismatch',503);
 return {async create(input){
  const normalized=normalizeCodRequest(input),checkoutId=await hash(input.checkoutToken);
  for(let n=0;n<5;n++){
   const intent=(await store.get('cod_checkout_intents/'+checkoutId))?.data||null,orderId=intent?.orderId||'KD-'+String(10000000+crypto.getRandomValues(new Uint32Array(1))[0]%90000000);
   const existing=intent?(await store.get('orders/'+orderId))?.data:null,products={};
   if(!intent)for(const id of new Set(normalized.items.map(i=>i.id))){const p=await store.get('products/'+id);if(p)products[id]={data:p.data,updateTime:p.version};}
   const accessKey=await hash(orderId+'|'+normalized.customer.phone.replace(/\D/g,''));let plan;
   try{plan=await prepareCodOrder({request:input,projectId:cfg.projectId,testOnly:!cfg.live,orderId,editToken:random(24),accessKey,products,nowISO:new Date().toISOString(),existingIntent:intent,existingOrder:existing});}
   catch(e){if(!intent&&e instanceof CodFault&&['insufficient_stock','unavailable_product'].includes(e.code)&&await store.get('cod_checkout_intents/'+checkoutId))continue;throw e;}
   if(!plan.replay)plan.writes.push(store.write('order_lifecycle/'+orderId,{orderId,checkoutId,payment:'cod',stockDebits:plan.stockDebits,manageTokenHash:await hash(plan.order.editToken)},{exists:false}));
   try{if(plan.writes.length)await store.commit(plan.writes);}catch(e){if(e.message==='write_conflict')continue;throw e;}
   return {order:publicOrder(plan.order),snapshot:{orderId,checkoutId},manageToken:plan.order.editToken,replay:plan.replay};
  }throw new Fault('database_busy',503);
 },async status(claims){const i=(await store.get('cod_checkout_intents/'+claims.checkoutId))?.data,o=(await store.get('orders/'+claims.orderId))?.data;if(!i||i.orderId!==claims.orderId||!o||o.payment!=='cod')throw new Fault('invalid_receipt',401);return {paid:false,registered:true,order:publicOrder(o)};}};
}
