// Produce a review artifact only. Never modifies index.html or publishes Pages.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const source=fs.readFileSync('index.html','utf8');
const expected='dbabdbc414e49ad3f571373e6e7b1bfdea3fc8d31d5046dad16c873d8aa0bd82';assert.equal(createHash('sha256').update(source).digest('hex'),expected,'Storefront changed: review replacement anchors before rebuilding');
let html=source;
const start=html.indexOf("    if(order.payment==='card'){",html.indexOf('async function submitCheckoutOrder'));
const end=html.indexOf("\n    checkoutMessage(lang==='ar'?'جارٍ تسجيل الطلب...",start);assert.ok(start>0&&end>start);
html=html.slice(0,start)+`    if(order.payment==='card'){
      checkoutMessage(lang==='ar'?'جارٍ فتح صفحة الدفع الآمن...':'Opening secure payment page...');
      await (await secureStripeFlow()).start(order);
      return;
    }
`+html.slice(end);
const a=html.indexOf('async function completeStripeCheckoutReturn(){'),b=html.indexOf('setTimeout(()=>{completeStripeCheckoutReturn();},150);',a);assert.ok(a>0&&b>a);
html=html.slice(0,a)+`let secureStripePromise;
function secureStripeFlow(){
  if(!secureStripePromise)secureStripePromise=import('./stripe-release/storefront-integration.mjs').then(({createStorefrontStripe,turnstileToken})=>createStorefrontStripe({
    storage:localStorage,redirect:url=>window.location.assign(url),
    getTurnstileToken:()=>turnstileToken('NOT_CONFIGURED'),
    confirmed:order=>{
      localStorage.setItem('kandorty_last_order_id',order.id);
      cart=[];saveCart();closeCheckout();
      alert((lang==='ar'?'تم تأكيد الدفع. رقم الطلب: ':'Payment confirmed. Order: ')+order.id+(order.inventoryStatus==='needs_review'?(lang==='ar'?' — الطلب قيد المراجعة، يرجى التواصل مع المتجر.':' — Under review; please contact the store.') : ''));
    }
  }));
  return secureStripePromise;
}
async function completeStripeCheckoutReturn(){
  if(new URLSearchParams(location.search).get('stripe')!=='success')return;
  try{const r=await (await secureStripeFlow()).finish();if(!r.paid)alert(lang==='ar'?'الدفع قيد التأكيد. يرجى التحقق من الطلب لاحقاً.':'Payment confirmation pending. Check your order shortly.');}
  catch{alert(lang==='ar'?'تعذر التحقق من الطلب. لا تعيدي الدفع؛ تحققي من الطلب أو تواصلي مع المتجر.':'Unable to verify. Do not pay again; check your order or contact the store.');}
}

`+html.slice(b);
// Route receipts issued by this version through the server; legacy paths remain clearly outside this Stripe patch.
const trackAnchor="async function trackOrder(){\n  const num=$('trackingNumber').value.trim().toUpperCase();";assert.ok(html.includes(trackAnchor));
html=html.replace(trackAnchor,trackAnchor+`
  const secure=await secureStripeFlow();
  if(secure.ownsReceipt(num)){
    activeEditableOrder=null;activeOrderAccessKey='';
    try{renderTrackingResult(await secure.track(num));}catch{ $('trackingResult').textContent='تعذر التحقق من الطلب. يرجى التواصل مع المتجر.'; }
    return;
  }
`);
const out=process.env.STRIPE_CANDIDATE_DIR||'/tmp/kandorty-stripe-storefront-review';assert.ok(path.resolve(out)!==process.cwd());fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'index.html'),html);fs.cpSync('stripe-release',path.join(out,'stripe-release'),{recursive:true,filter:p=>!p.includes('/public')&&!p.endsWith('sandbox-e2e.mjs')});
assert.ok(!html.includes('https://kandorty-stripe.aliyajan200011.workers.dev/'));assert.ok(!html.slice(html.indexOf('async function completeStripeCheckoutReturn'),html.indexOf('setTimeout(()=>{completeStripeCheckoutReturn')).includes('submitCustomerOrder'));
console.log('Unpublished storefront review artifact built; live index unchanged. Turnstile remains NOT_CONFIGURED. COD/admin migration is separate.');
