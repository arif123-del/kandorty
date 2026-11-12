// Server/IAM-only test setup. This is not a public checkout route.
import {prepareCodOrder} from '../stripe-live-candidate/cod.mjs';
import {hash,random,Fault} from '../cod-staging/security.mjs';
import {PROJECT} from './settlement.mjs';
export async function pricedSnapshot(store,request,provider){
 if(store.root!==`projects/${PROJECT}/databases/(default)/documents`)throw new Fault('isolated_test_project_required',503);
 if(!['stripe','ziina'].includes(provider))throw new Fault('unknown_provider');
 const orderId='KD-'+String(10000000+crypto.getRandomValues(new Uint32Array(1))[0]%90000000);
 const checkoutId=await hash(provider+':'+request.checkoutToken);
 const products={};for(const i of request.items){const row=await store.get('products/'+i.id);if(row)products[i.id]={data:row.data,updateTime:row.version};}
 const accessKey=await hash(orderId+'|'+request.customer.phone.replace(/\D/g,''));
 const plan=await prepareCodOrder({request,projectId:PROJECT,testOnly:true,orderId,editToken:random(24),accessKey,products,nowISO:new Date().toISOString()});
 return {checkoutId,orderId,order:plan.order,provider,accessKey,totalFils:Math.round(plan.order.total*100),test:true,fulfilled:false};
}
export async function bindPayment(store,s,p){
 if(store.root!==`projects/${PROJECT}/databases/(default)/documents`)throw new Fault('isolated_test_project_required',503);
 // Bind only a payment just created by trusted TEST setup, never arbitrary client IDs.
 if(s.provider==='stripe'){
  if(p.livemode!==false||p.amount!==s.totalFils||p.currency!=='aed'||p.metadata?.checkout_id!==s.checkoutId||p.metadata?.order_id!==s.orderId)throw new Fault('invalid_created_payment',409);
 }else if(p.test===false||p.amount!==s.totalFils||p.currency_code!=='AED'||!p.account_id||!p.operation_id)throw new Fault('invalid_created_payment',409);
 const snap={...s,verificationEvidence:p.__simulated===true?'simulated_provider':'provider_api',paymentId:p.id,paymentClaimId:await hash(s.provider+':'+p.id),creationVerifiedByServer:true,...(s.provider==='ziina'?{createdWithTestFlag:true,providerAccountId:p.account_id,operationId:p.operation_id}:{})};
 await store.commit([store.write('payment_checkout_intents/'+s.checkoutId,snap,{exists:false})]);
 return snap;
}
