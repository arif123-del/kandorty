import {chromium} from 'playwright';
import {createHash, sign} from 'node:crypto';

const origin='https://kandorty-stripe-orders-test.aliyajan200011.workers.dev';
if(!origin.includes('kandorty-stripe-orders-test.')||origin.includes('kandorty.online'))throw new Error('Not isolated');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1280,height:840},locale:'en-US'});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const cards=['4242 4242 4242 4242'];
let token='', sessionId='';
async function fillAny(selectors,value,waitMs=18000){
 const end=Date.now()+waitMs;
 while(Date.now()<end){
  for(const frame of page.frames()){
   for(const sel of selectors){
    const input=frame.locator(sel).first();
    try {
     if(await input.count()&&await input.isVisible()){
       await input.fill(value,{timeout:3000});
       return true;
     }
    }catch{}
   }
  }
  await sleep(350);
 }
 return false;
}
async function visibleInputTypes(){
 const found=[];
 for(const frame of page.frames()){
  const elems=await frame.locator('input').evaluateAll(xs=>xs.map(x=>({name:x.getAttribute('name'),placeholder:x.getAttribute('placeholder'),autocomplete:x.getAttribute('autocomplete'),type:x.getAttribute('type')}))).catch(()=>[]);
  found.push(...elems);
 }
 return found.slice(0,30);
}
try {
 await page.goto(origin+'/test',{waitUntil:'domcontentloaded',timeout:30000});
 if(!await page.getByText('TEST ONLY').count())throw Error('Test-only warning absent, refusing card entry');
 await page.locator('#start').click();
 await page.waitForURL(u=>u.hostname==='checkout.stripe.com',{timeout:40000});
 token=await page.evaluate(()=>sessionStorage.getItem('kandorty_stripe_test_checkout_token')).catch(()=>null)||'';
 // The token lives on origin only; it can still be obtained from page's sessionStorage after returning.
 console.log('Stripe hosted Sandbox checkout launched successfully.');
 const email=await fillAny(['input[type="email"]','input[autocomplete="email"]','input[name="email"]'],'stripe-sandbox-test@example.com',7000);
 if(email)console.log('Test email filled.');
 const number=await fillAny(['input[name="cardNumber"]','input[autocomplete="cc-number"]','input[placeholder*="1234"]','input[aria-label*="card number" i]'],'4242424242424242');
 const exp=await fillAny(['input[name="cardExpiry"]','input[autocomplete="cc-exp"]','input[placeholder*="MM"]','input[aria-label*="expiration" i]'],'1230',10000);
 const cvc=await fillAny(['input[name="cardCvc"]','input[autocomplete="cc-csc"]','input[placeholder*="CVC"]','input[aria-label*="security code" i]'],'123',10000);
 const name=await fillAny(['input[name="billingName"]','input[autocomplete="cc-name"]','input[placeholder*="Full name"]'],'TEST USER',1800);
 console.log('Test form fields found (card, expiry, cvc, optional name):',number,exp,cvc,name);
 if(!number||!exp||!cvc){
  console.log('Visible field metadata (no values):',JSON.stringify(await visibleInputTypes()));
  throw Error('Stripe hosted TEST form fields could not be completed automatically');
 }
 const pay=page.locator('button[type="submit"]').filter({visible:true}).last();
 if(!(await pay.count()))throw Error('Stripe Sandbox Pay button unavailable');
 await pay.click({timeout:12000});
 console.log('Submitted Stripe TEST card, awaiting order confirmation...');
 await page.waitForURL(u=>u.origin===origin,{timeout:60000});
 const status=page.locator('#status');
 await status.waitFor({timeout:30000});
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('order registered'),{timeout:45000});
 const message=await status.textContent();
 const orderId=message?.match(/KD-TEST-[a-f0-9]{24}/)?.[0];
 if(!orderId)throw Error('No TEST order ID in browser confirmation');
 console.log('TEST Checkout verified and registered:',orderId);
 console.log('No live payment made.');
} finally {
 await browser.close();
}
