import {Fault} from '../cod-staging/security.mjs';
// Never initiates a refund. Reconcile authoritative Stripe refund outcomes only.
export async function syncRefunds(store,stripe,snapshot){
 const state=await stripe.refundState(snapshot.sessionId,snapshot);
 for(let n=0;n<5;n++){
  const row=await store.get('orders/'+snapshot.orderId);if(!row||row.data.stripeSessionId!==snapshot.sessionId)throw new Fault('refund_order_mismatch',409);
  const old=row.data;
  if(state.amount<Math.round(Number(old.refundedAmount||0)*100))return old; // A slower pre-refund read must never undo verified money returned.
  const status=state.status==='none'&&old.refundStatus==='required'?'required':state.status;
  if(old.refundStatus===status&&old.refundedAmount===state.amount/100)return old;
  const updated={...old,refundStatus:status,refundedAmount:state.amount/100,refundCheckedAt:new Date().toISOString()};
  const writes=[store.write('orders/'+old.id,updated,{updateTime:row.version})];
  for(const collection of ['stripe_refund_queue','stripe_review_queue']){
   const q=await store.get(collection+'/'+old.id);if(q&&state.status==='full')writes.push(store.write(collection+'/'+old.id,{...q.data,resolved:true,resolution:'full_refund_verified',resolvedAt:updated.refundCheckedAt},{updateTime:q.version}));
  }
  try{await store.commit(writes);return updated;}catch(e){if(e.message!=='write_conflict')throw e;}
 }throw new Fault('database_busy',503);
}
