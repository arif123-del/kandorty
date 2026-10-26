import {createService,Fault} from './core.mjs';
import {createStore} from './firestore.mjs';
import {TEST_HTML,TEST_JS} from './test-page.mjs';
function stripeClient(key,net=fetch){
 async function api(path,params,idempotency){
  const r=await net('https://api.stripe.com/v1/checkout/sessions'+path,{method:params?'POST':'GET',redirect:'error',headers:{Authorization:'Bearer '+key,'Stripe-Version':'2024-06-20',...(params?{'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':idempotency}:{})},...(params?{body:params}:{}),signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new Fault('stripe_unavailable',502);return r.json();
 }
 return {
  retrieve:id=>api('/'+encodeURIComponent(id)),
  create(s){
   const p=new URLSearchParams({mode:'payment',client_reference_id:s.orderId,'metadata[checkout_id]':s.id,'metadata[order_id]':s.orderId,success_url:s.returnBase+'/?stripe=success&session_id={CHECKOUT_SESSION_ID}',cancel_url:s.returnBase+'/?stripe=cancel',expires_at:String(Math.floor(s.expiresAt/1000)),'payment_method_types[0]':'card'});
   const lines=[...s.items.map(i=>({name:i.name,amount:i.unitAmount,qty:i.qty})),{name:'رسوم التوصيل',amount:2500,qty:1}];
   lines.forEach((i,n)=>{p.set(`line_items[${n}][price_data][currency]`,'aed');p.set(`line_items[${n}][price_data][unit_amount]`,String(i.amount));p.set(`line_items[${n}][price_data][product_data][name]`,i.name);p.set(`line_items[${n}][quantity]`,String(i.qty));});
   return api('',p,'kandorty-stripe-test-'+s.id);
  }
 };
}
async function boundedBody(request){
 if(Number(request.headers.get('Content-Length'))>65536)throw new Fault('body_too_large',413);
 const reader=request.body?.getReader();if(!reader)return '';const chunks=[];let length=0;
 for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>65536){await reader.cancel();throw new Fault('body_too_large',413);}chunks.push(value);}
 const all=new Uint8Array(length);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.length;}return new TextDecoder('utf-8',{fatal:true}).decode(all);
}
export function createHandler(factory){return async(request,env)=>{
 const path=new URL(request.url).pathname,origin=request.headers.get('Origin')||'';
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
 const respond=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
 try{
  // Hard fail closed: this implementation cannot switch to Live via an environment toggle.
  if(env.STRIPE_MODE!=='test'||!/^sk_test_[A-Za-z0-9_]+$/.test(env.STRIPE_SECRET_KEY||''))throw new Fault('test_key_required',503);
  const base=new URL(env.STRIPE_TEST_SITE_URL);if(base.protocol!=='https:'||base.origin!==env.STRIPE_TEST_SITE_URL||['https://kandorty.online','https://www.kandorty.online'].includes(base.origin))throw new Fault('isolated_test_site_required',503);
  // A standalone TEST-only payment page; never served on the production store.
  if(request.method==='GET' && new URL(request.url).origin===base.origin){
   if(path==='/'||path==='/test')return new Response(TEST_HTML,{
    headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',
     'Content-Security-Policy':"default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'","X-Content-Type-Options":"nosniff"}
   });
   if(path==='/test.js')return new Response(TEST_JS,{
    headers:{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
   });
  }
  if(path!=='/webhook'){
   if(origin!==base.origin)throw new Fault('origin_denied',403);
   headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Methods']='POST, OPTIONS';headers['Access-Control-Allow-Headers']='Content-Type';
   if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  }
  if(request.method!=='POST')throw new Fault('method_not_allowed',405);
  if(!['/create-checkout-session','/verify-checkout-session','/webhook'].includes(path))throw new Fault('not_found',404);
  const service=factory(env),raw=await boundedBody(request);
  if(path==='/webhook')return respond(await service.webhook(raw,request.headers.get('Stripe-Signature'),env.STRIPE_WEBHOOK_SECRET));
  let body;try{body=JSON.parse(raw);}catch{throw new Fault('invalid_json');}
  if(!body||typeof body!=='object'||Array.isArray(body))throw new Fault('invalid_json');
  if(path==='/create-checkout-session')return respond(await service.create(body));
  if(typeof body.checkoutToken!=='string')throw new Fault('checkout_token_required',403);
  return respond(await service.fulfill(body.session_id,body.checkoutToken));
 }catch(e){return respond({error:e instanceof Fault?e.message:'temporarily_unavailable',test:true},e instanceof Fault?e.status:503);}
};}
export default {fetch:createHandler(env=>{
 const store=createStore(env),stripe=stripeClient(env.STRIPE_SECRET_KEY);
 // Freeze the return URL into the server snapshot so retries preserve Stripe parameters.
 const original=store.createSnapshot;
 store.createSnapshot=(id,s)=>original(id,{...s,returnBase:env.STRIPE_TEST_SITE_URL});
 return createService({store,stripe});
})};
export {stripeClient};
