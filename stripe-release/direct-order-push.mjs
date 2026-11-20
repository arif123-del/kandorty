import {Fault,hash} from '../cod-staging/security.mjs';

// Existing Kandorty checkout saves a newly created order directly to
// Firestore (with stock decrement in the same transaction). Unlike Stripe/COD
// Worker-created orders, it never triggers onNewOrder server notifications.
// A customer may request push *only* for their own already-saved fresh order
// by proving possession of its random editToken. The token is never stored in
// this notification ledger or included in a notification payload.
const ORDER_ID=/^KD-\d{8}$/;
const PROOF=/^[a-f0-9]{48}$/;
const WINDOW_MS=15*60*1000;
const LOCK_MS=25*1000;
const retryable=x=>x?.message==='write_conflict';

export async function claimDirectOrderNotification(store,input,now=Date.now()){
 if(!input || Object.keys(input).some(k=>!['orderId','editToken'].includes(k)) ||
    !ORDER_ID.test(input.orderId||'') || !PROOF.test(input.editToken||'')) {
  throw new Fault('invalid_direct_order_notification',400);
 }
 const existing=await store.get('orders/'+input.orderId);
 const order=existing?.data;
 // Compare fixed-length hashes; never expose which field was invalid.
 if(!order || typeof order.editToken!=='string' ||
    await hash(order.editToken)!==await hash(input.editToken)) {
  throw new Fault('invalid_direct_order_proof',403);
 }
 const created=Date.parse(order.createdAt);
 if(!Number.isFinite(created) || created<now-WINDOW_MS || created>now+120000 ||
    order.status!=='new' || order.id!==input.orderId) {
  throw new Fault('order_not_recent',409);
 }
 const path='admin_direct_order_notifications/'+await hash(input.orderId);
 for(let i=0;i<4;i++){
  const previous=await store.get(path),record=previous?.data;
  if(record?.state==='delivered')return {claimed:false,duplicate:true,path};
  if(record?.state==='pending' && Number(record.startedAt)>now-LOCK_MS)
   return {claimed:false,duplicate:true,path};
  // A failed or timed-out previous attempt can be retried after the lock.
  const data={state:'pending',startedAt:now,attempt:Number(record?.attempt||0)+1};
  try{
   await store.commit([store.write(path,data,
     previous?{updateTime:previous.version}:{exists:false})]);
   return {claimed:true,duplicate:false,path};
  }catch(error){if(!retryable(error))throw error;}
 }
 throw new Fault('database_busy',503);
}

export async function deliverClaimedOrderNotification(store,claim,sendBrowser,sendNative,now=Date.now()){
 if(!claim?.claimed)return {queued:false,duplicate:!!claim?.duplicate};
 const outcomes=await Promise.allSettled([sendBrowser(),sendNative()]);
 // The Android notification is the primary goal. A successful browser push
 // must never hide a failed native delivery; allow a later retry of FCM.
 const delivered=outcomes[1].status==='fulfilled';
 const old=await store.get(claim.path);
 // If this update loses a race to a later claim, do not overwrite its status.
 if(old?.data?.state==='pending'){
  try{
   await store.commit([store.write(claim.path,
     {state:delivered?'delivered':'failed',
       startedAt:old.data.startedAt,attempt:old.data.attempt,
       ...(delivered?{deliveredAt:now}:{failedAt:now})},
     {updateTime:old.version})]);
  }catch(error){if(!retryable(error))throw error;}
 }
 if(!delivered)throw new Fault('direct_order_push_unavailable',503);
 return {queued:true,duplicate:false};
}
