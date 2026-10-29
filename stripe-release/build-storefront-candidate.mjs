// Produce a review artifact only. Never modifies index.html or publishes Pages.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const source=fs.readFileSync('index.html','utf8');
const expected='dbabdbc414e49ad3f571373e6e7b1bfdea3fc8d31d5046dad16c873d8aa0bd82';assert.equal(createHash('sha256').update(source).digest('hex'),expected,'Storefront changed: review replacement anchors before rebuilding');
let html=source;
// Turnstile site key is PUBLIC and is used only in the unpublished storefront candidate.
// The separate Turnstile secret remains encrypted in Cloudflare; never put it here.
const turnstileSiteKey='0x4AAAAAAFroUm7gBp-V9_Ta';
assert.match(turnstileSiteKey,/^0x4[A-Za-z0-9_-]{15,}$/);

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
    getTurnstileToken:()=>turnstileToken('${turnstileSiteKey}'),
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
// All new COD orders also use the trusted server; no customer stock transaction.
const codStart=html.indexOf("    checkoutMessage(lang==='ar'?'جارٍ تسجيل الطلب...",html.indexOf('async function submitCheckoutOrder'));
const codEnd=html.indexOf('  }catch(error){',codStart);assert.ok(codStart>0&&codEnd>codStart);
html=html.slice(0,codStart)+"    await (await secureStripeFlow()).startCod(order);\n"+html.slice(codEnd);
html=html.replace("localStorage.setItem('kandorty_last_order_id',order.id);", "localStorage.setItem('kandorty_last_order_id',order.id);saveCustomerOwnOrders([order,...readCustomerOwnOrders().filter(o=>o.id!==order.id)]);");
html=html.replace("?'تم تأكيد الدفع. رقم الطلب: ':'Payment confirmed. Order: '","?'تم تسجيل الطلب. رقم الطلب: ':'Order registered: '");
const cancelAnchor="async function cancelOrderFromMyOrders(orderId,button){";assert.ok(html.includes(cancelAnchor));
html=html.replace(cancelAnchor,cancelAnchor+`
  const secure=await secureStripeFlow();
  if(secure.ownsReceipt(orderId)){
    button.disabled=true;
    try{const result=await secure.cancel(orderId);saveCustomerOwnOrders(readCustomerOwnOrders().map(o=>o.id===orderId?{...o,...result.order}:o));renderMyOrders();alert(result.order.payment==='card'?'تم إلغاء الطلب. حالة الاسترداد: '+result.order.refundStatus:'تم إلغاء الطلب.');}
    catch{alert('تعذر إلغاء الطلب. ربما بدأ تجهيزه؛ تواصلي مع المتجر.');}
    finally{button.disabled=false;}return;
  }
`);
// A separately reviewed admin page uses a verified Firebase token for state transitions.
let admin=fs.readFileSync('admin.html','utf8');
assert.equal(createHash('sha256').update(admin).digest('hex'),'b073297b9289ca5846afcf6e99fe67d8acf7f93a440b3c46ba037ffae82ea669','Admin source changed');
const adminStart=admin.indexOf('async function updateOrderStatus(id,status){'),adminEnd=admin.indexOf("const SETTINGS_KEY=",adminStart);assert.ok(adminStart>0&&adminEnd>adminStart);
admin=admin.slice(0,adminStart)+`async function updateOrderStatus(id,status){
 if(!auth.currentUser)return;
 try{const {adminOrderClient}=await import('./stripe-release/admin-client.mjs');const updated=await adminOrderClient({getIdToken:force=>auth.currentUser.getIdToken(force)}).change(id,status);orders=orders.map(o=>o.id===id?{...o,...updated}:o);renderOrders();renderProfileOrders();}
 catch(error){alert('تعذر تحديث الطلب: '+error.message);renderOrders();}
}
\n`+admin.slice(adminEnd);
const out=process.env.STRIPE_CANDIDATE_DIR||'/tmp/kandorty-stripe-storefront-review';assert.ok(path.resolve(out)!==process.cwd());fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'index.html'),html);fs.writeFileSync(path.join(out,'admin.html'),admin);fs.cpSync('stripe-release',path.join(out,'stripe-release'),{recursive:true,filter:p=>!p.includes('/public')&&!p.endsWith('sandbox-e2e.mjs')});
assert.ok(!html.includes('https://kandorty-stripe.aliyajan200011.workers.dev/'));
assert.ok(html.includes("getTurnstileToken:()=>turnstileToken('"+turnstileSiteKey+"')"),'Turnstile widget site key missing from candidate');
assert.ok(!html.includes("turnstileToken('NOT_CONFIGURED')"),'Turnstile placeholder must not ship in review candidate');assert.ok(!html.slice(html.indexOf('async function completeStripeCheckoutReturn'),html.indexOf('setTimeout(()=>{completeStripeCheckoutReturn')).includes('submitCustomerOrder'));
console.log('Unpublished storefront review artifact built; live index unchanged. Public Turnstile Site Key configured in review copy. New COD/admin state transitions use server endpoints; legacy-order migration remains a separate release check.');
