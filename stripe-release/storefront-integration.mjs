// Invoked only by the generated, unpublished storefront candidate.
import {stripeCheckoutClient} from './browser-client.mjs';
export function createStorefrontStripe({storage,net=fetch,redirect,confirmed,getTurnstileToken,endpoint='https://kandorty-stripe-release.aliyajan200011.workers.dev'}){
 const client=stripeCheckoutClient({endpoint,storage,net});
 return {
  async start(order){
   const token=await getTurnstileToken();
   if(!token)throw new Error('anti_bot_required');
   const result=await client.start({customer:order.customer,items:order.items,note:order.notes||'',turnstileToken:token});
   if(result.url){const u=new URL(result.url);if(u.protocol!=='https:'||u.hostname!=='checkout.stripe.com')throw new Error('invalid_checkout_url');redirect(u.href);return;}
   return this.finish();
  },
  async startCod(order){
   const token=await getTurnstileToken();if(!token)throw new Error('anti_bot_required');
   const r=await client.startCod({customer:order.customer,items:order.items,note:order.notes||'',turnstileToken:token});confirmed(r.order);return r;
  },
  async cancel(id){return client.cancel(id);},
  async finish(){
   const result=await client.status();
   if(!result.paid)return {paid:false};
   // Fulfillment and inventory already happened on the server. UI callback must only render/save local state.
   confirmed(result.order);client.archiveConfirmed(result.order);return result;
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
