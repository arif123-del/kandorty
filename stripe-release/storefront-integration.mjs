// Invoked only by the generated, unpublished storefront candidate.
import {stripeCheckoutClient} from './browser-client.mjs?v=retry3';
export function createStorefrontStripe({storage,net=fetch,redirect,confirmed,confirmResume,getTurnstileToken,endpoint='https://kandorty-stripe-release.aliyajan200011.workers.dev'}){
 const client=stripeCheckoutClient({endpoint,storage,net});
 async function submit(method,order){
  const send=async request=>{
   const turnstileToken=await getTurnstileToken();
   if(!turnstileToken)throw new Error('anti_bot_required');
   return client[method]({...request,turnstileToken});
  };
  try{return await send({customer:order.customer,items:order.items,note:order.notes||''});}
  catch(error){
   if(error.message!=='checkout_conflict')throw error;
   if(!confirmResume?.())return null;
   // A confirmed conflict means this token is already bound on the server.
   // Replaying a matching request recovers that checkout, including its receipt.
   for(const saved of client.savedRequests(method==='start'?'card':'cod')){
    try{return await send(saved);}catch(retryError){
     if(retryError.message!=='checkout_conflict')throw retryError;
    }
   }
   throw error;
  }
 }
 return {
  async start(order){
   const result=await submit('start',order);
   if(!result)return;
   if(result.url){const u=new URL(result.url);if(u.protocol!=='https:'||u.hostname!=='checkout.stripe.com')throw new Error('invalid_checkout_url');redirect(u.href);return;}
   return this.finish();
  },
  async startCod(order){
   const r=await submit('startCod',order);
   if(r)confirmed(r.order);
   return r;
  },
  async cancel(id){return client.cancel(id);},
  async finish(){
   const result=await client.status();
   if(!result.paid)return {paid:false};
   // Fulfillment and inventory already happened on the server. UI callback must only render/save local state.
   // Persist the server-issued receipt only after validating the paid order.
   // Never clear the cart or show a success message for an inconsistent response.
   client.archiveConfirmed(result.order);confirmed(result.order);return result;
  },
  ownsReceipt:id=>client.hasReceipt(id),
  async track(id){const result=await client.track(id);if((!result.paid&&!result.registered)||result.order.id!==id)throw new Error('order_not_confirmed');return result.order;}
 };
}
export async function turnstileToken(sitekey,document=globalThis.document){
 if(typeof sitekey!=='string'||!sitekey||sitekey==='NOT_CONFIGURED')throw new Error('anti_bot_not_configured');
 if(!globalThis.turnstile){
  await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.onload=resolve;script.onerror=()=>reject(new Error('anti_bot_unavailable'));document.head.append(script);});
 }
 return new Promise((resolve,reject)=>{
  const container=document.createElement('div');container.setAttribute('role','dialog');container.style.cssText='position:fixed;z-index:99999;top:30%;left:50%;transform:translateX(-50%);background:white;padding:20px';document.body.append(container);
  let widget;const cleanup=()=>{if(widget!==undefined)globalThis.turnstile.remove(widget);container.remove();};
  const timer=setTimeout(()=>{cleanup();reject(new Error('anti_bot_timeout'));},120000);
  const done=(token,error)=>{clearTimeout(timer);cleanup();error?reject(new Error(error)):resolve(token);};
  widget=globalThis.turnstile.render(container,{sitekey,action:'checkout',callback:token=>done(token),'error-callback':()=>done(null,'anti_bot_failed'),'expired-callback':()=>done(null,'anti_bot_expired')});
 });
}
