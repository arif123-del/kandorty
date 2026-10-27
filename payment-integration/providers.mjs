// TEST-only provider evidence retrieval. Never trusts a browser's paid flag.
import {Fault} from '../cod-staging/security.mjs';
const check=(ok,code)=>{if(!ok)throw new Fault(code,409);};
export function validatePayment(s,p){
 check(s.test===true&&s.creationVerifiedByServer===true,'test_snapshot_required');
 check(['stripe','ziina'].includes(s.provider),'unknown_provider');
 check(p?.id===s.paymentId,'payment_binding_mismatch');
 check(Number.isSafeInteger(s.totalFils)&&s.totalFils>=2501,'invalid_snapshot_amount');
 if(s.provider==='stripe'){
  check(/^pi_[A-Za-z0-9]+$/.test(p.id)&&p.livemode===false,'test_payment_required');
  check(p.status==='succeeded','payment_not_paid');
  check(p.amount===s.totalFils&&p.amount_received===s.totalFils&&p.currency==='aed','payment_amount_mismatch');
  check(p.metadata?.checkout_id===s.checkoutId&&p.metadata?.order_id===s.orderId,'payment_binding_mismatch');
 }else{
  // Ziina GET does not guarantee a `test` field. Require a trusted snapshot
  // made from our own test:true CREATE response; reject any explicit LIVE marker.
  check(s.createdWithTestFlag===true&&p.test!==false,'test_payment_required');
  check(p.status==='completed','payment_not_paid');
  check(p.amount===s.totalFils&&p.currency_code==='AED'&&Number(p.tip_amount||0)===0&&Number(p.vat_amount||0)===0,'payment_amount_mismatch');
  check(p.account_id===s.providerAccountId&&typeof s.providerAccountId==='string'&&s.providerAccountId.length>0&&p.operation_id===s.operationId&&typeof s.operationId==='string'&&s.operationId.length>0,'payment_binding_mismatch');
 }
 return true;
}
export async function retrievePayment(env,s,net=fetch){
 if(s.verificationEvidence!=='provider_api')throw new Fault('real_provider_evidence_required',409);
 let url,key;
 if(s.provider==='stripe'){
  if(!/^sk_test_[A-Za-z0-9_]+$/.test(env.STRIPE_SECRET_KEY||''))throw new Fault('stripe_test_key_required',503);
  if(!/^pi_[A-Za-z0-9]+$/.test(s.paymentId||''))throw new Fault('invalid_payment_id');
  url='https://api.stripe.com/v1/payment_intents/'+s.paymentId;key=env.STRIPE_SECRET_KEY;
 }else if(s.provider==='ziina'){
  if(!env.ZIINA_TEST_API_KEY)throw new Fault('ziina_test_key_required',503);
  if(!/^[a-zA-Z0-9_-]{10,160}$/.test(s.paymentId||''))throw new Fault('invalid_payment_id');
  url='https://api-v2.ziina.com/api/payment_intent/'+s.paymentId;key=env.ZIINA_TEST_API_KEY;
 }else throw new Fault('unknown_provider');
 const r=await net(url,{headers:{Authorization:'Bearer '+key},redirect:'manual',signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw new Fault('provider_verification_unavailable',503);
 const p=await r.json();validatePayment(s,p);return p;
}
