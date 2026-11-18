import {Fault,hash,random} from '../cod-staging/security.mjs';
import {pack} from '../cod-staging/firestore.mjs';
import {retrievePayment,validatePayment} from './providers.mjs';
export const PROJECT='kandorty-stripe-test-5f8af';
const root='projects/'+PROJECT+'/databases/(default)/documents';
const check=(ok,code)=>{if(!ok)throw new Fault(code,409);};
const create=(path,data)=>({update:{name:root+'/'+path,fields:pack(data).mapValue.fields},currentDocument:{exists:false}});
export function paidPlan(s,version,p,products,existingOrder,existingClaim){
 validatePayment(s,p);
 check(/^[a-f0-9]{64}$/.test(s.checkoutId||'')&&/^KD-\d{8}$/.test(s.orderId||''),'invalid_snapshot');
 check(typeof version==='string'&&/^\d{4}-\d\d-\d\dT/.test(version),'missing_snapshot_version');
 const binding=s.provider+':'+s.paymentId;
 if(existingOrder||existingClaim||s.fulfilled){
  check(existingOrder&&existingClaim&&s.fulfilled===true&&existingOrder.paymentBinding===binding&&existingOrder.id===s.orderId&&existingOrder.paymentStatus==='paid'&&existingClaim.orderId===s.orderId&&existingClaim.checkoutId===s.checkoutId,'existing_payment_conflict');
  return {replay:true,writes:[],order:existingOrder};
 }
 check(s.order&&s.order.id===s.orderId&&Array.isArray(s.order.items)&&s.order.items.length>0&&s.order.items.length<=20,'invalid_snapshot');
 const byProduct=new Map();let subtotal=0;
 for(const i of s.order.items){
  check(/^[a-zA-Z0-9_-]{1,150}$/.test(i.id)&&Number.isSafeInteger(i.qty)&&i.qty>=1&&i.qty<=99,'invalid_snapshot');
  const fils=Math.round(i.price*100);check(Number.isSafeInteger(fils)&&fils>0,'invalid_snapshot');subtotal+=fils*i.qty;
  byProduct.set(i.id,(byProduct.get(i.id)||0)+i.qty);check(byProduct.get(i.id)<=99,'invalid_snapshot');
 }
 check(subtotal+2500===s.totalFils&&Math.round(s.order.total*100)===s.totalFils,'snapshot_amount_mismatch');
 check(/^[a-f0-9]{48}$/.test(s.order.editToken||'')&&/^[a-f0-9]{64}$/.test(s.accessKey||''),'invalid_snapshot');
 let shortage=false;const debits={},changes=[];
 const now=new Date().toISOString();
 for(const [id,qty] of byProduct){
  const row=products[id];
  if(!row||row.data.active===false){shortage=true;continue;}
  const stock=row.data.stock;
  if(stock===null||stock===undefined||stock==='')continue;
  if(!/^(0|[1-9]\d*)$/.test(String(stock))||!Number.isSafeInteger(Number(stock))||Number(stock)<qty){shortage=true;continue;}
  check(typeof row.version==='string'&&/^\d{4}-\d\d-\d\dT/.test(row.version),'missing_product_version');
  debits[id]=qty;
  changes.push({update:{name:root+'/products/'+id,fields:pack({stock:Number(stock)-qty,updatedAt:now}).mapValue.fields},updateMask:{fieldPaths:['stock','updatedAt']},currentDocument:{updateTime:row.version}});
 }
 const order={...s.order,verificationEvidence:s.verificationEvidence,test:true,payment:'card',paymentProvider:s.provider,paymentBinding:binding,paymentStatus:'paid',paidAt:now,status:'new',inventoryStatus:shortage?'needs_review':'debited',stockDebits:shortage?{}:debits,stockDebited:!shortage&&Object.keys(debits).length>0};
 const writes=[
  create('orders/'+s.orderId,order),
  create('tracking/'+s.orderId,{id:s.orderId,status:order.status,inventoryStatus:order.inventoryStatus,createdAt:order.createdAt}),
  create('order_edits/'+order.editToken,{orderId:order.id,editToken:order.editToken,customer:order.customer,items:order.items,payment:'card',status:'new',createdAt:order.createdAt}),
  create('order_access/'+s.accessKey,{orderId:order.id,editToken:order.editToken,active:true,createdAt:now}),
  create('payment_claims/'+s.paymentClaimId,{checkoutId:s.checkoutId,orderId:s.orderId,paymentBinding:binding}),
  {update:{name:root+'/payment_checkout_intents/'+s.checkoutId,fields:pack({...s,fulfilled:true,inventoryStatus:order.inventoryStatus}).mapValue.fields},currentDocument:{updateTime:version}}
 ];
 if(!shortage)writes.push(...changes);
 return {replay:false,writes,order};
}
export async function settle({env,store,checkoutId,provider,fetchPayment=retrievePayment}){
 if(env.STRIPE_TEST_PROJECT_ID!==PROJECT||env.COD_MODE!=='test'||store.root!==root)throw new Fault('isolated_test_project_required',503);
 if(!/^[a-f0-9]{64}$/.test(checkoutId||'')||!['stripe','ziina'].includes(provider))throw new Fault('invalid_checkout');
 for(let attempt=0;attempt<5;attempt++){
  const row=await store.get('payment_checkout_intents/'+checkoutId),s=row?.data;
  if(!s||s.provider!==provider||s.checkoutId!==checkoutId)throw new Fault('unknown_checkout',404);
  check(s.paymentClaimId===await hash(provider+':'+s.paymentId),'invalid_payment_claim');
  const p=await fetchPayment(env,s); // Re-read provider even for replay; never accept client evidence.
  const existing=(await store.get('orders/'+s.orderId))?.data;
  const claim=(await store.get('payment_claims/'+s.paymentClaimId))?.data;
  // Independent REST reads can straddle another handler's atomic commit.
  // Reread the snapshot rather than treating that legitimate race as corruption.
  if((existing||claim)&&s.fulfilled!==true){
   if(claim&&claim.checkoutId!==checkoutId)throw new Fault('existing_payment_conflict',409);
   if(existing&&existing.paymentBinding!==provider+':'+s.paymentId)throw new Fault('existing_payment_conflict',409);
   continue;
  }
  const products={};for(const id of new Set(s.order.items.map(i=>i.id)))products[id]=await store.get('products/'+id);
  const plan=paidPlan(s,row.version,p,products,existing,claim);
  try{if(plan.writes.length)await store.commit(plan.writes);}catch(e){if(e.message==='write_conflict')continue;throw e;}
  return {...plan,checkoutId};
 }
 throw new Fault('database_busy',503);
}
