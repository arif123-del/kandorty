// Executed in GitHub CI only, using Stripe's public TEST card and isolated Firebase.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createStore} from './firestore.mjs';
import {releaseConfig} from './configuration.mjs';
import {stripeClient} from './stripe.mjs';
import {createService} from './service.mjs';
import {hash,random,sign} from '../cod-staging/security.mjs';
const cfg=releaseConfig(process.env);assert.equal(cfg.mode,'test');assert.equal(cfg.projectId,'kandorty-stripe-test-5f8af');
const base='https://'+cfg.host,store=createStore(process.env),service=createService(cfg,store,stripeClient(cfg));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function api(path,body,headers={}){const r=await fetch(base+path,{method:'POST',redirect:'error',headers:{Origin:base,'Content-Type':'application/json','X-Staging-Key':process.env.STAGING_ACCESS_SECRET,...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});return {status:r.status,body:await r.json()};}
let ready=false;for(let i=0;i<12;i++){try{if((await api('/checkout/status',{})).status===401){ready=true;break;}}catch{}await pause(5000);}assert.ok(ready,'New release Worker not ready');
const product='release-e2e-'+random(8);
await store.commit([store.write('products/'+product,{nameAr:'STRIPE RELEASE TEST ONLY',price:10,stock:3,totalStock:3},{exists:false})]);
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
const page=await browser.newPage({locale:'en-US'});
// Prevent the success page status call from doing fulfillment: webhook must register the order alone.
await page.route(base+'/checkout/status',r=>r.abort());
async function fillAny(selectors,value,wait=12000){const end=Date.now()+wait;while(Date.now()<end){for(const f of page.frames())for(const sel of selectors){const el=f.locator(sel).first();try{if(await el.count()&&await el.isVisible()){await el.fill(value,{timeout:1500});return true;}}catch{}}await pause(250);}return false;}
async function payHosted(){
 assert.ok(await fillAny(['input[name="email"]','input[type="email"]','input[autocomplete="email"]'],'stripe-release-test@example.com',7000),'Sandbox email required');
 assert.ok(await fillAny(['input[name="cardNumber"]','input[autocomplete="cc-number"]'],'4242424242424242'));
 assert.ok(await fillAny(['input[name="cardExpiry"]','input[autocomplete="cc-exp"]'],'1230'));
 assert.ok(await fillAny(['input[name="cardCvc"]','input[autocomplete="cc-csc"]'],'123'));
 await fillAny(['input[name="billingName"]','input[autocomplete="cc-name"]'],'SYNTHETIC TEST',2000);
 for(const f of page.frames()){const c=f.locator('select[name="billingCountry"],select[autocomplete="country"]').first();if(await c.count()&&await c.isVisible())await c.selectOption('AE');}
 await fillAny(['input[name="billingPostalCode"]','input[autocomplete="postal-code"]'],'00000',2000);
 await fillAny(['input[name="phoneNumber"]','input[autocomplete="tel"]'],'+971500000000',2000);
 await page.locator('button[type="submit"]').filter({visible:true}).last().click();
 try{await page.waitForURL(u=>u.origin===base,{timeout:45000,waitUntil:'domcontentloaded'});}catch{
  console.log('Sandbox checkout host:',new URL(page.url()).hostname);
  for(const frame of page.frames()){
   console.log('Visible required/invalid field metadata:',JSON.stringify(await frame.locator('input').evaluateAll(xs=>xs.filter(x=>x.offsetParent!==null).map(x=>({name:x.name,type:x.type,required:x.required,invalid:x.getAttribute('aria-invalid'),empty:!x.value}))).catch(()=>[])));
   console.log('Sandbox form alerts:',JSON.stringify(await frame.locator('[role=alert],.InputError').allTextContents().catch(()=>[])));
  }
  console.log('Sandbox submit labels:',JSON.stringify(await page.locator('button[type=submit]').allTextContents()));
  throw new Error('Sandbox hosted form did not return; inspect field metadata only');
 }
}
try{
 await page.goto(base,{waitUntil:'domcontentloaded'});assert.ok(await page.getByText('TEST ONLY',{exact:false}).count());
 await page.locator('#gate').fill(process.env.STAGING_ACCESS_SECRET);await page.locator('#product').fill(product);await page.locator('#start').click();
 await page.waitForURL(u=>u.hostname==='checkout.stripe.com',{timeout:45000});
 await payHosted();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('kandorty_server_stripe_v1')));
 assert.ok(saved.receipt&&saved.checkoutToken&&saved.orderId);
 const checkoutId=await hash(saved.checkoutToken);
 let order,audit;for(let i=0;i<30;i++){order=(await store.get('orders/'+saved.orderId))?.data;audit=(await store.get('stripe_webhook_receipts/'+checkoutId))?.data;if(order&&audit?.paid)break;await pause(2000);}
 assert.equal(order?.paymentStatus,'paid','Signed real Stripe webhook must register order without browser status');assert.equal(audit?.paid,true);
 assert.equal(order.total,35);assert.equal((await store.get('products/'+product)).data.stock,2);
 assert.ok(await store.get('tracking/'+order.id));assert.ok(await store.get('order_edits/'+order.editToken));
 const snapshot=(await store.get('stripe_checkout_sessions/'+checkoutId)).data;
 const session=await stripeClient(cfg).retrieve(snapshot.sessionId);assert.equal(session.livemode,false);assert.equal(session.amount_total,3500);
 // Deliver signed duplicates with the actual paid session, then retrieve paid state through the guest receipt.
 const event={type:'checkout.session.completed',livemode:false,data:{object:session}},raw=JSON.stringify(event),t=Math.floor(Date.now()/1000),signature='t='+t+',v1='+await sign(process.env.STRIPE_WEBHOOK_SECRET,t+'.'+raw);
 const deliveries=await Promise.all([1,2,3].map(()=>fetch(base+'/webhook',{method:'POST',headers:{'Stripe-Signature':signature},body:raw})));
 assert.ok(deliveries.every(r=>r.status===200));assert.equal((await store.get('products/'+product)).data.stock,2);
 assert.equal((await api('/checkout/status',{}, {Authorization:'Bearer '+saved.receipt+'bad'})).status,401);
 const status=await api('/checkout/status',{}, {Authorization:'Bearer '+saved.receipt});assert.equal(status.status,200);assert.equal(status.body.order.id,order.id);assert.equal(status.body.order.customer,undefined);assert.equal(status.body.order.editToken,undefined);
 await page.unroute(base+'/checkout/status');await page.locator('#refresh').click();await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('Order registered:'),{timeout:30000});
 const reconcile=await service.reconcile();assert.equal(reconcile.failed,0);assert.equal((await store.get('products/'+product)).data.stock,2);
 // Cancellation requires a distinct manage token, then restores recorded stock once.
 assert.match(saved.manageToken,/^[a-f0-9]{48}$/);
 const cancel=()=>api('/orders/cancel',{orderId:order.id,manageToken:saved.manageToken},{Authorization:'Bearer '+saved.receipt});
 const cancellations=await Promise.all([cancel(),cancel()]);
 // The same valid cancellation may race a Firestore transaction and return a transient
 // 503. Only that response is retried; the endpoint must remain idempotent, and
 // recorded stock must still be restored exactly once.
 for(let i=0;i<cancellations.length;i++){
  for(let attempt=0;attempt<4&&cancellations[i].status===503;attempt++){
   await pause(300*(attempt+1));
   cancellations[i]=await cancel();
  }
 }
 assert.ok(cancellations.every(r=>r.status===200),'Concurrent cancellation responses (no PII): '+JSON.stringify(cancellations.map(r=>({status:r.status,error:r.body?.error||null}))));
 assert.equal((await store.get('products/'+product)).data.stock,3);
 await service.fulfill(checkoutId,session.id);assert.equal((await store.get('products/'+product)).data.stock,3);
 // Refund only this run's test PaymentIntent; no live or pre-existing payment can enter this branch.
 assert.match(session.payment_intent,/^pi_/);assert.equal(session.livemode,false);
 const refund=await fetch('https://api.stripe.com/v1/refunds',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+cfg.key,'Idempotency-Key':'release-test-refund-'+checkoutId},body:new URLSearchParams({payment_intent:session.payment_intent})});assert.ok(refund.ok,'Sandbox refund request failed');const returned=await refund.json();assert.equal(returned.status,'succeeded');assert.equal(returned.amount,3500);
 for(let i=0;i<20;i++){if((await store.get('orders/'+order.id)).data.refundStatus==='full')break;await pause(1000);}
 assert.equal((await store.get('orders/'+order.id)).data.refundStatus,'full','Refund webhook must sync order without browser return');
 assert.equal((await store.get('stripe_refund_queue/'+order.id)).data.resolved,true);assert.equal((await store.get('products/'+product)).data.stock,3);
 const codInput={checkoutToken:random(32),customer:{name:'COD TEST',phone:'+971500000000',city:'Dubai',location:'TEST ONLY'},items:[{id:product,qty:1}]};
 const cod=await api('/cod/orders',codInput);assert.equal(cod.status,201);assert.equal(cod.body.order.total,35);assert.equal((await api('/cod/orders',codInput)).status,200);assert.equal((await store.get('products/'+product)).data.stock,2);
 assert.equal((await api('/orders/cancel',{orderId:cod.body.order.id,manageToken:cod.body.manageToken},{Authorization:'Bearer '+cod.body.receipt})).status,200);assert.equal((await store.get('products/'+product)).data.stock,3);
 assert.equal((await api('/admin/orders/status',{orderId:order.id,status:'preparing'})).status,403);
 console.log('PASS: deployed COD creation/replay/cancellation, paid Stripe cancellation with exactly-once restock, webhook-only refund status/queue resolution, unauthorized admin rejection.');
 // Two hosted sessions are created while only one unit is available; both can pay.
 const last='release-last-'+random(8);
 await store.commit([store.write('products/'+last,{nameAr:'LAST UNIT TEST ONLY',price:10,stock:1,totalStock:1},{exists:false})]);
 const request=()=>({checkoutToken:random(32),customer:{name:'SYNTHETIC TEST',phone:'+971500000000',city:'Dubai',location:'TEST ONLY'},items:[{id:last,qty:1}]});
 const buyers=[request(),request()],checkouts=[];
 for(const buyer of buyers){const r=await api('/create-checkout-session',buyer);assert.equal(r.status,200);checkouts.push(r.body);}
 await page.route(base+'/checkout/status',r=>r.abort());
 for(let n=0;n<2;n++){
  await page.goto(checkouts[n].url,{waitUntil:'domcontentloaded'});await payHosted();
  const id=await hash(buyers[n].checkoutToken);let o;
  for(let i=0;i<30;i++){o=(await store.get('orders/'+checkouts[n].orderId))?.data;if(o&&(await store.get('stripe_webhook_receipts/'+id))?.data.paid)break;await pause(2000);}
  assert.equal(o?.paymentStatus,'paid');assert.equal(o.inventoryStatus,n===0?'debited':'needs_review');assert.equal((await store.get('products/'+last)).data.stock,0);
  if(n===1){assert.deepEqual(o.stockDebits,{});assert.equal((await store.get('stripe_review_queue/'+o.id)).data.reason,'paid_inventory_shortage');}
  const snap=(await store.get('stripe_checkout_sessions/'+id)).data,session=await stripeClient(cfg).retrieve(snap.sessionId);assert.equal(session.livemode,false);assert.equal(session.amount_total,3500);
  // A private replay performs no second debit, including the paid-shortage case.
  await service.fulfill(id,session.id);assert.equal((await store.get('products/'+last)).data.stock,0);
  const refund=await fetch('https://api.stripe.com/v1/refunds',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+cfg.key,'Idempotency-Key':'release-test-refund-'+id},body:new URLSearchParams({payment_intent:session.payment_intent})});assert.ok(refund.ok);assert.equal((await refund.json()).status,'succeeded');
  for(let i=0;i<20;i++){if((await store.get('orders/'+o.id)).data.refundStatus==='full')break;await pause(1000);}
  assert.equal((await store.get('orders/'+o.id)).data.refundStatus,'full');if(n===1)assert.equal((await store.get('stripe_review_queue/'+o.id)).data.resolved,true);
 }
 console.log('PASS: two real Sandbox hosted payments compete for one unit; one debit, one durable paid-shortage review, no negative stock, both test refunds succeeded.');
 console.log('PASS: real hosted Sandbox AED35, signed provider webhook without browser fulfillment, guest return, invalid receipt rejection, concurrent webhook replay, exactly one stock debit, reconciliation and Sandbox refund.');
 console.log('Synthetic test records retained. No production, Live or Ziina operations.');
}finally{await browser.close();}
