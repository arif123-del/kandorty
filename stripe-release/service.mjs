import {syncRefunds} from './refunds.mjs';
import {Fault,hash,random} from '../cod-staging/security.mjs';
import {normalizeCodRequest,prepareCodOrder} from '../stripe-live-candidate/cod.mjs';
import {preparePaidFulfillment,validatePaidSession} from '../stripe-live-candidate/fulfillment.mjs';
const check=(ok,code)=>{if(!ok)throw new Fault(code,409);};
export const publicOrder=o=>({id:o.id,payment:o.payment,refundStatus:o.refundStatus||'none',refundedAmount:o.refundedAmount||0,paymentStatus:o.paymentStatus,status:o.status,inventoryStatus:o.inventoryStatus,total:o.total,deliveryFee:o.deliveryFee,items:o.items.map(i=>({id:i.id,name:i.name,qty:i.qty,price:i.price}))});
function bound(cfg,s,p){
 check(p&&p.livemode===cfg.live&&p.mode==='payment'&&(cfg.live?/^cs_live_[A-Za-z0-9]+$/:/^cs_test_[A-Za-z0-9]+$/).test(p.id||''),'session_mode_mismatch');
 check(p.client_reference_id===s.orderId&&p.metadata?.checkout_id===s.checkoutId&&p.metadata?.order_id===s.orderId&&p.metadata?.integration==='kandorty-stripe-v1','session_binding_mismatch');
 check(p.currency==='aed'&&p.amount_total===s.totalFils&&(!s.sessionId||p.id===s.sessionId),'session_amount_mismatch');
}
export function createService(cfg,store,stripe){
 check(store.root===`projects/${cfg.projectId}/databases/(default)/documents`,'store_project_mismatch');
 async function bind(checkoutId,p){
  for(let i=0;i<5;i++){
   const row=await store.get('stripe_checkout_sessions/'+checkoutId),s=row?.data;check(s,'unknown_checkout');bound(cfg,s,p);
   if(s.sessionId){check(s.sessionId===p.id,'session_binding_mismatch');return s;}
   try{await store.commit([store.write('stripe_checkout_sessions/'+checkoutId,{...s,sessionId:p.id},{updateTime:row.version})]);return {...s,sessionId:p.id};}catch(e){if(e.message!=='write_conflict')throw e;}
  }throw new Fault('database_busy',503);
 }
 return {
  async create(request){
   const normalized=normalizeCodRequest(request),checkoutId=await hash(request.checkoutToken),fingerprint=await hash(JSON.stringify(normalized));
   let row=await store.get('stripe_checkout_sessions/'+checkoutId),s=row?.data;
   if(!s){
    const products={};for(const id of new Set(normalized.items.map(i=>i.id))){const p=await store.get('products/'+id);if(p)products[id]={data:p.data,updateTime:p.version};}
    const orderId='KD-'+String(10000000+crypto.getRandomValues(new Uint32Array(1))[0]%90000000),accessKey=await hash(orderId+'|'+normalized.customer.phone.replace(/\D/g,''));
    const plan=await prepareCodOrder({request,projectId:cfg.projectId,testOnly:!cfg.live,orderId,editToken:random(24),accessKey,products,nowISO:new Date().toISOString()});
    s={checkoutId,fingerprint,orderId,createdAt:plan.order.createdAt,customer:normalized.customer,note:normalized.note,totalFils:Math.round(plan.order.total*100),items:plan.order.items.map(i=>({...i,unitAmount:Math.round(i.price*100)})),mode:cfg.mode,fulfilled:false,reconcilePending:true,editToken:plan.order.editToken,accessKey};
    try{await store.commit([store.write('stripe_checkout_sessions/'+checkoutId,s,{exists:false})]);}catch(e){if(e.message!=='write_conflict')throw e;s=(await store.get('stripe_checkout_sessions/'+checkoutId))?.data;}
   }
   check(s&&s.fingerprint===fingerprint&&s.mode===cfg.mode,'checkout_conflict');
   if(s.fulfilled)return {snapshot:s,complete:true};
   check(Date.now()-Date.parse(s.createdAt)<1800000,'checkout_expired');
   const p=s.sessionId?await stripe.retrieve(s.sessionId):await stripe.create(s);bound(cfg,s,p);
   check(p.status!=='expired','checkout_expired');
   s=await bind(checkoutId,p);
   if(p.status==='complete')return {snapshot:s,complete:true};
   let url;try{url=new URL(p.url);}catch{throw new Fault('invalid_checkout_url',503);}
   check(url.protocol==='https:'&&url.hostname==='checkout.stripe.com'&&!url.username&&!url.password,'invalid_checkout_url');
   return {snapshot:s,url:url.href,complete:false};
  },
  async fulfill(checkoutId,sessionId){
   for(let attempt=0;attempt<5;attempt++){
    const row=await store.get('stripe_checkout_sessions/'+checkoutId),s=row?.data;check(s&&s.mode===cfg.mode,'unknown_checkout');
    // Retrieval remains mandatory for every delivery; neither webhook object nor client is paid proof.
    const p=await stripe.retrieve(sessionId);bound(cfg,s,p);
    if(p.payment_status!=='paid'||p.status!=='complete')return {paid:false,snapshot:s,expired:p.status==='expired'};
    validatePaidSession(p,s,{mode:cfg.mode});
    const existing=(await store.get('orders/'+s.orderId))?.data;
    const claimId=await hash(p.id),claim=(await store.get('stripe_payment_claims/'+claimId))?.data;
    if(claim)check(claim.checkoutId===checkoutId&&claim.orderId===s.orderId,'session_already_claimed');
    if(existing&&!s.fulfilled){check(existing.stripeSessionId===p.id,'existing_order_conflict');continue;}
    if(s.fulfilled)check(existing&&claim,'partial_fulfillment');
    const products={};for(const id of new Set(s.items.map(i=>i.id))){const r=await store.get('products/'+id);if(r)products[id]={data:r.data,updateTime:r.version};}
    const plan=preparePaidFulfillment({session:p,snapshot:s,snapshotVersion:row.version,existingOrder:existing||null,products,editToken:s.editToken,accessKey:s.accessKey,nowISO:new Date().toISOString(),projectId:cfg.projectId,mode:cfg.mode});
    if(!plan.replay){
     if(typeof p.payment_intent==='string'&&/^pi_[A-Za-z0-9]+$/.test(p.payment_intent))plan.writes.push(store.write('stripe_payment_intents/'+await hash(p.payment_intent),{checkoutId,orderId:s.orderId,sessionId:p.id},{exists:false}));
     plan.writes.push(store.write('order_lifecycle/'+s.orderId,{orderId:s.orderId,checkoutId,payment:'card',stockDebits:plan.stockDebits,manageTokenHash:await hash(s.editToken)},{exists:false}));
     plan.writes.push(store.write('stripe_payment_claims/'+claimId,{checkoutId,orderId:s.orderId,sessionId:p.id},{exists:false}));
     const marker=plan.writes.find(w=>w.update.name===store.root+'/stripe_checkout_sessions/'+checkoutId);marker.update.fields.reconcilePending={booleanValue:false};
     if(plan.order.inventoryStatus==='needs_review')plan.writes.push(store.write('stripe_review_queue/'+s.orderId,{orderId:s.orderId,sessionId:p.id,reason:'paid_inventory_shortage',resolved:false,createdAt:new Date().toISOString()},{exists:false}));
     try{await store.commit(plan.writes);}catch(e){if(e.message==='write_conflict')continue;throw e;}
    }
    const settledOrder=stripe.refundState?await syncRefunds(store,stripe,{...s,sessionId:p.id}):plan.order;
    return {paid:true,replay:plan.replay,order:publicOrder(settledOrder),snapshot:s};
   }throw new Fault('database_busy',503);
  },
  async status(claims){
   const s=(await store.get('stripe_checkout_sessions/'+claims.checkoutId))?.data;
   if(!s||s.orderId!==claims.orderId||s.mode!==cfg.mode)throw new Fault('invalid_receipt',401);
   if(!s.sessionId)return {paid:false};
   const r=await this.fulfill(s.checkoutId,s.sessionId);return r.paid?{paid:true,order:r.order}:{paid:false};
  },
  async closePending(checkoutId,uncertain=false){
   const row=await store.get('stripe_checkout_sessions/'+checkoutId),s=row?.data;
   if(!s||s.fulfilled||!s.reconcilePending)return;
   const writes=[store.write('stripe_checkout_sessions/'+checkoutId,{...s,reconcilePending:false,reconcileState:uncertain?'manual_review':'expired'},{updateTime:row.version})];
   if(uncertain)writes.push(store.write('stripe_review_queue/pending_'+checkoutId,{checkoutId,orderId:s.orderId,reason:'checkout_creation_uncertain',resolved:false},{exists:false}));
   try{await store.commit(writes);}catch(e){if(e.message!=='write_conflict')throw e;}
  },
  async reconcile(){
   let paid=0,pending=0,failed=0;
   for(const s of await store.pending()){
    if(s.mode!==cfg.mode)continue;
    try{
     if(!s.sessionId){if(Date.now()-Date.parse(s.createdAt)>=1800000)await this.closePending(s.checkoutId,true);pending++;continue;}
     const r=await this.fulfill(s.checkoutId,s.sessionId);if(r.paid)paid++;else {if(r.expired)await this.closePending(s.checkoutId);pending++;}
    }catch{failed++;}
   }
   return {paid,pending,failed};
  }
 };
}
