/**
 * Kandorty Ziina ORDER STAGING Worker
 * IS_TEST is deliberately hard-coded true. Safe staging: saves in ziina_test_orders,
 * never changes live product stock, orders, tracking or Stripe.
 *
 * Deployment requires privately stored Cloudflare secrets:
 * ZIINA_API_KEY, FIREBASE_SERVICE_ACCOUNT_JSON, ZIINA_RECEIPT_SECRET.
 * A service account restricted to Cloud Datastore User is preferable; no JSON in git.
 * DO NOT enable real money / modify IS_TEST without separate security review.
 */
const SHOP = 'https://kandorty.online';
const STAGING = 'https://kandorty-ziina-orders.aliyajan200011.workers.dev';
const ORIGINS = new Set([SHOP, 'https://www.kandorty.online', STAGING]);
const PROJECT = 'kandorty-9378a';
const DATABASE = `projects/${PROJECT}/databases/(default)`;
const FS = `https://firestore.googleapis.com/v1/${DATABASE}/documents`;
const ZIINA = 'https://api-v2.ziina.com/api/payment_intent';
const IS_TEST = true; // IMPORTANT: remains true on staging. DO NOT enable LIVE yet.
const MODE = 'test';
const SESSION_COLLECTION = 'ziina_test_checkout_sessions';
const DELIVERY_FILS = 2500;
let cachedToken = null;
let cachedExpiry = 0;

function reply(data, status = 200, origin = '') {
  const h = new Headers({ 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'Vary':'Origin' });
  if (ORIGINS.has(origin)) h.set('Access-Control-Allow-Origin', origin);
  return new Response(JSON.stringify(data), { status, headers:h });
}
function bad(message, status=400) { const e = new Error(message); e.status=status; throw e; }
function b64(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let s=''; for (const b of bytes) s+=String.fromCharCode(b);
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function unb64(s) {
  const binary=atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4));
  return Uint8Array.from(binary,c=>c.charCodeAt(0));
}
async function signReceipt(data, secret) {
  const bytes=new TextEncoder().encode(secret);
  const key=await crypto.subtle.importKey('raw',bytes,{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
  const payload=b64(JSON.stringify(data));
  const sig=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(payload));
  return payload+'.'+b64(new Uint8Array(sig));
}
async function readReceipt(token, secret) {
  if (typeof token !== 'string' || token.length>4096) bad('Invalid receipt',403);
  const parts=token.split('.');
  if(parts.length!==2 || !parts[0] || !parts[1]) bad('Invalid receipt',403);
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  let ok=false;
  try { ok=await crypto.subtle.verify('HMAC',key,unb64(parts[1]),new TextEncoder().encode(parts[0])); } catch(_) {}
  if(!ok) bad('Unverified receipt',403);
  const data=JSON.parse(new TextDecoder().decode(unb64(parts[0])));
  if(!data || data.mode!==MODE || !Number.isFinite(data.created) || data.created>Date.now()+60000 || Date.now()-data.created>7*24*3600e3) bad('Expired receipt',403);
  return data;
}
function val(x) {
  if(x===null || x===undefined)return {nullValue:'NULL_VALUE'};
  if(typeof x==='string')return {stringValue:x};
  if(typeof x==='boolean')return {booleanValue:x};
  if(typeof x==='number')return Number.isInteger(x)?{integerValue:String(x)}:{doubleValue:x};
  if(Array.isArray(x))return {arrayValue:{values:x.map(val)}};
  if(typeof x==='object')return {mapValue:{fields:Object.fromEntries(Object.entries(x).map(([k,v])=>[k,val(v)]))}};
  bad('Unsupported Firestore value');
}
function decode(v) {
  if (!v)return null;
  if(v.stringValue!==undefined)return v.stringValue;
  if(v.integerValue!==undefined)return Number(v.integerValue);
  if(v.doubleValue!==undefined)return Number(v.doubleValue);
  if(v.booleanValue!==undefined)return v.booleanValue;
  if(v.arrayValue)return (v.arrayValue.values||[]).map(decode);
  if(v.mapValue)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)]));
  return null;
}
function document(name, data) { return {name,fields:Object.fromEntries(Object.entries(data).map(([k,x])=>[k,val(x)]))}; }
function unpack(doc) { return doc?Object.fromEntries(Object.entries(doc.fields||{}).map(([k,x])=>[k,decode(x)])):null; }
function docName(path) {return DATABASE+'/documents/'+path;}
async function firebaseToken(env) {
  if(cachedToken && Date.now()<cachedExpiry) return cachedToken;
  if(!env.FIREBASE_SERVICE_ACCOUNT_JSON) bad('Firebase server credential has not been configured',503);
  const sa=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if(sa.project_id!==PROJECT || typeof sa.client_email!=='string' || !sa.private_key) bad('Unexpected Firebase account',503);
  const pem=sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'');
  const pk=await crypto.subtle.importKey('pkcs8',unb64(b64(Uint8Array.from(atob(pem),c=>c.charCodeAt(0)))),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const now=Math.floor(Date.now()/1000);
  const header=b64(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const body=b64(JSON.stringify({iss:sa.client_email,scope:'https://www.googleapis.com/auth/datastore',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600}));
  const signing=header+'.'+body;
  const sig=b64(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pk,new TextEncoder().encode(signing))));
  const response=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:signing+'.'+sig})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok || !data.access_token) bad('Firebase authentication unavailable',503);
  cachedToken=data.access_token;
  cachedExpiry=Date.now()+Math.min(50*60e3,(Number(data.expires_in)||3600)*1000-120000);
  return cachedToken;
}
async function fsPost(env, suffix, body) {
  // Enforce the write boundary independently of route logic and configuration.
  if (IS_TEST !== true) bad('This Worker is TEST only',503);
  if (suffix === ':commit') {
    if (!Array.isArray(body.writes) || !body.writes.length) bad('Empty staging write',503);
    for (const write of body.writes) {
      const name = write.update?.name;
      const prefix = DATABASE + '/documents/';
      const path = typeof name === 'string' && name.startsWith(prefix) ? name.slice(prefix.length) : '';
      if (!/^(ziina_test_checkout_sessions|ziina_test_orders)\/[\w-]{1,160}$/.test(path) || write.delete || write.transform)
        bad('Staging write outside test collections blocked',503);
    }
  }
  const token=await firebaseToken(env);
  const response=await fetch(FS+suffix,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const raw=await response.text();
  let result;
  try{result=JSON.parse(raw);}catch(_){result=raw.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));}
  if(!response.ok)bad('Firestore operation failed ('+response.status+')',response.status===409?409:503);
  return result;
}
async function fsRead(env, names, transaction) {
  const result=await fsPost(env,':batchGet',{documents:names,...(transaction?{transaction}:{})});
  const values=Array.isArray(result)?result:[result];
  const rows=new Map();
  for(const row of values){if(row.found)rows.set(row.found.name,row.found);else if(row.missing)rows.set(row.missing,null);}
  for(const name of names)if(!rows.has(name))bad('Firestore read incomplete',503);
  return rows;
}
function extractCart(input, rows) {
  if(!Array.isArray(input)||input.length<1||input.length>20)bad('Invalid cart');
  const counts=new Map();
  const variants=[];
  for(const i of input){
    const id=String(i?.id||'');
    const qty=Number(i?.qty);
    const idx=Number(i?.imageIndex||0);
    if(!/^[\w-]{1,100}$/.test(id)||!Number.isInteger(qty)||qty<1||qty>99||!Number.isInteger(idx)||idx<0||idx>7)bad('Invalid item');
    counts.set(id,(counts.get(id)||0)+qty);
    variants.push({id,qty,imageIndex:idx});
  }
  let subtotal=0;
  const items=[];
  for(const i of variants){
    const p=rows.get(i.id);
    if(!p||p.active===false)bad('Product unavailable',409);
    const stock=Number(p.stock);
    if(!Number.isInteger(stock)||stock<0||counts.get(i.id)>stock)bad('Not enough stock for item',409);
    const cost=Number(p.salePrice||p.price);
    const fils=Math.round(cost*100);
    if(!Number.isSafeInteger(fils)||fils<1||fils>10000000)bad('Invalid price',409);
    subtotal+=fils*i.qty;
    const images=Array.isArray(p.images)?p.images:[];
    items.push({id:i.id,qty:i.qty,code:String(p.code||'').slice(0,60),name:String(p.nameAr||p.name||'').slice(0,160),
      price:fils/100,imageIndex:i.imageIndex,variantKey:i.id+'__img'+i.imageIndex,imageUrl:String(images[i.imageIndex]||images[0]||'').slice(0,1000)});
  }
  const total=subtotal+DELIVERY_FILS;
  if(!Number.isSafeInteger(total)||total<200||total>100000000)bad('Invalid total');
  return {items,total,subtotal,quantities:Object.fromEntries(counts)};
}
function customerFrom(data) {
  if(!data||typeof data!=='object')bad('Invalid customer');
  const c={};
  for(const k of ['name','phone','city','location']){
    const v=data[k];
    if(typeof v!=='string'||!v.trim()||v.length>160)bad('Invalid '+k);
    c[k]=v.trim();
  }
  if(c.phone.replace(/\D/g,'').length<6)bad('Invalid phone');
  return c;
}
async function ziinaGet(env,id){
  const res=await fetch(ZIINA+'/'+encodeURIComponent(id),{headers:{Authorization:'Bearer '+env.ZIINA_API_KEY}});
  if(!res.ok)bad('Ziina payment verification unavailable',503);
  return res.json();
}
async function createCheckout(env,input){
  if(!input || typeof input!=='object' || Array.isArray(input))bad('Invalid request');
  const orderId=String(input.orderId||'');
  if(!/^KD-[0-9]{8}$/.test(orderId))bad('Invalid order ID');
  const customer=customerFrom(input.customer);
  const note=String(input.notes||'').slice(0,1000);
  const items=input.items;
  if(!Array.isArray(items)||items.length<1||items.length>20)bad('Invalid items');
  for(const item of items){
    if(!item || !/^[\w-]{1,100}$/.test(String(item.id||'')) || !Number.isInteger(Number(item.qty)) || Number(item.qty)<1 || Number(item.qty)>99 || !Number.isInteger(Number(item.imageIndex??0)) || Number(item.imageIndex??0)<0 || Number(item.imageIndex??0)>7)bad('Invalid item');
  }
  const ids=[...new Set(items.map(x=>String(x?.id||'')))];
  if(ids.length<1||ids.length>20)bad('Invalid cart');
  const productNames=ids.map(id=>docName('products/'+id));
  const snapshots=await fsRead(env,productNames);
  const products=new Map(ids.map(id=>[id,unpack(snapshots.get(docName('products/'+id)))]));
  const cart=extractCart(items,products);
  const callback=STAGING+'/test';
  const created=await fetch(ZIINA,{method:'POST',headers:{Authorization:'Bearer '+env.ZIINA_API_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({amount:cart.total,currency_code:'AED',message:'Kandorty TEST Order '+orderId,
      test:IS_TEST,allow_tips:false,success_url:callback+'?ziina=success',cancel_url:callback+'?ziina=cancel',failure_url:callback+'?ziina=failed'})});
  const intent=await created.json().catch(()=>({}));
  if(!created.ok||!intent.id||!intent.redirect_url)bad('Ziina TEST checkout unavailable',502);
  const redirect=new URL(intent.redirect_url);
  if(redirect.protocol!=='https:' || !(redirect.hostname==='ziina.com'||redirect.hostname.endsWith('.ziina.com')) || redirect.username || redirect.password)bad('Invalid Ziina checkout URL',502);
  if(!/^[\w-]{10,160}$/.test(String(intent.id)))bad('Invalid Ziina intent ID',502);
  if(intent.test===false)bad('TEST worker rejected LIVE checkout',502);
  const session={orderId,paymentIntentId:String(intent.id),mode:MODE,amount:cart.total,currency:'AED',customer,
    items:cart.items,quantities:cart.quantities,subtotal:cart.subtotal/100,deliveryFee:DELIVERY_FILS/100,notes:note,
    createdAt:new Date().toISOString(),status:'pending'};
  // Immutable server-side order snapshot. A failure here never returns the payment URL.
  await fsPost(env,':commit',{writes:[{update:document(docName(SESSION_COLLECTION+'/'+intent.id),session),currentDocument:{exists:false}}]});
  const receipt=await signReceipt({id:String(intent.id),orderId,mode:MODE,amount:cart.total,created:Date.now()},env.ZIINA_RECEIPT_SECRET);
  return {url:intent.redirect_url,receipt,paymentIntentId:intent.id,test:IS_TEST};
}

async function finalizeCheckout(env,receipt){
  const claims=await readReceipt(receipt,env.ZIINA_RECEIPT_SECRET);
  if(!/^[\w-]{10,160}$/.test(String(claims.id||''))||!/^KD-[0-9]{8}$/.test(String(claims.orderId||'')))bad('Invalid checkout receipt',403);
  const intent=await ziinaGet(env,claims.id);
  if(String(intent.id)!==String(claims.id)||intent.status!=='completed'||intent.currency_code!=='AED'||Number(intent.amount)!==Number(claims.amount))bad('Payment not verified',409);
  if(IS_TEST && intent.test===false)bad('TEST worker cannot accept a LIVE payment',403);
  const sessionName=docName(SESSION_COLLECTION+'/'+claims.id);
  const orderName=docName('ziina_test_orders/'+claims.orderId);
  for(let attempt=0;attempt<3;attempt++){
    const begin=await fsPost(env,':beginTransaction',{options:{readWrite:{}}});
    const tx=begin.transaction;
    try{
      const snapshot=await fsRead(env,[sessionName,orderName],tx);
      const session=unpack(snapshot.get(sessionName)),existing=unpack(snapshot.get(orderName));
      if(!session||session.mode!==MODE||session.paymentIntentId!==claims.id||session.orderId!==claims.orderId||Number(session.amount)!==Number(claims.amount))bad('Payment session mismatch',403);
      if(existing){
        if(existing.ziinaPaymentIntentId!==claims.id)bad('Order ID used by another payment',409);
        await fsPost(env,':rollback',{transaction:tx});
        return {orderId:session.orderId,alreadySaved:true,test:true};
      }
      const now=new Date().toISOString();
      const result={
        id:session.orderId,status:'test_paid',payment:'card',paymentStatus:'test_paid',
        ziinaPaymentIntentId:claims.id,createdAt:session.createdAt,paidAt:now,
        customer:session.customer,items:session.items,total:session.amount/100,
        subtotal:session.subtotal,deliveryFee:session.deliveryFee,notes:session.notes,
        test:true
      };
      const writes=[
        {update:document(orderName,result),currentDocument:{exists:false}},
        {update:document(sessionName,{status:'finalized',finalizedAt:now}),updateMask:{fieldPaths:['status','finalizedAt']},currentDocument:{exists:true}}
      ];
      await fsPost(env,':commit',{transaction:tx,writes});
      return {orderId:session.orderId,alreadySaved:false,test:true};
    }catch(error){
      await fsPost(env,':rollback',{transaction:tx}).catch(()=>{});
      if(error.status===409 && attempt<2)continue;
      throw error;
    }
  }
  bad('Transaction retry limit exceeded',503);
}

export default {
  async fetch(request,env){
    const url=new URL(request.url),origin=request.headers.get('Origin')||'';
    if(IS_TEST!==true)return reply({error:'This Worker is TEST only'},503,origin);
    if(request.method==='GET'&&url.pathname==='/test')return testPage();
    if(request.method==='GET'&&url.pathname==='/')return new Response('Kandorty Ziina ORDER STAGING (TEST only, no stock writes)');
    if(!ORIGINS.has(origin))return reply({error:'Origin forbidden'},403,origin);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{
      'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin'}});
    if(request.method!=='POST')return reply({error:'Method not allowed'},405,origin);
    if(!env.ZIINA_API_KEY||!env.FIREBASE_SERVICE_ACCOUNT_JSON||!env.ZIINA_RECEIPT_SECRET) return reply({error:'Staging credentials are not configured'},503,origin);
    if(!['/create-checkout-session','/finalize-checkout-session'].includes(url.pathname))return reply({error:'Not found'},404,origin);
    if(!(request.headers.get('Content-Type')||'').toLowerCase().startsWith('application/json'))return reply({error:'Expected application/json'},415,origin);
    try{
      const raw=await request.text();
      if(raw.length>20000)bad('Request too large',413);
      let data;
      try{data=JSON.parse(raw);}catch(_){bad('Invalid JSON');}
      if(!data || typeof data!=='object' || Array.isArray(data))bad('Invalid request');
      if(url.pathname==='/create-checkout-session')return reply(await createCheckout(env,data),200,origin);
      if(url.pathname==='/finalize-checkout-session')return reply(await finalizeCheckout(env,data.receipt),200,origin);
      return reply({error:'Not found'},404,origin);
    }catch(e){return reply({error:e?.status ? e.message : 'Staging request failed'},e?.status||500,origin);}
  }
};


function testPage(){
  return new Response(String.raw`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kandorty Ziina TEST</title>
<style>body{font:18px system-ui;max-width:600px;margin:40px auto;padding:20px;line-height:1.7}input,button{font:inherit;padding:12px;box-sizing:border-box;width:100%;margin:8px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}small{display:block}</style>
<h1>Kandorty — اختبار Ziina</h1><p>TEST فقط. رسوم التوصيل 25 د.إ. لا يتم تعديل الطلبات الحقيقية أو المخزون.</p>
<form id="checkout"><label>معرّف منتج موجود (Product ID)<input name="product" required pattern="[A-Za-z0-9_-]{1,100}"></label><label>الكمية<input name="qty" type="number" min="1" max="99" value="1" required></label><label>رقم الصورة (0–7)<input name="image" type="number" min="0" max="7" value="0" required></label><button>فتح دفع تجريبي</button></form>
<button id="retry" hidden>إعادة التحقق</button><pre id="result" role="status"></pre><small>تُستخدم بيانات عميل تجريبية فقط. تبقى السلة الأصلية كما هي.</small>
<script>
const form=document.getElementById('checkout'),result=document.getElementById('result'),retry=document.getElementById('retry');
const key='kandorty_orders_staging_receipt';
async function post(path,body){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(d.error||'فشل الاختبار');if(d.test!==true)throw new Error('نتيجة ليست TEST');return d;}
async function finalize(){retry.disabled=true;result.textContent='جارٍ التحقق من الدفع التجريبي...';try{const receipt=sessionStorage.getItem(key);if(!receipt)throw new Error('لا يوجد إيصال اختبار في هذا المتصفح. ابدئي تجربة جديدة من هذه الصفحة.');const d=await post('/finalize-checkout-session',{receipt});result.textContent='تم حفظ الطلب التجريبي: '+d.orderId+(d.alreadySaved?' (محفوظ مسبقاً)':'')+'\nلم تتغير الطلبات الحقيقية أو المخزون.';sessionStorage.removeItem(key);retry.hidden=true;}catch(e){result.textContent=e.message;retry.hidden=false;}finally{retry.disabled=false;}}
retry.onclick=finalize;
form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button');button.disabled=true;try{const f=new FormData(form),n=new Uint32Array(1);crypto.getRandomValues(n);const d=await post('/create-checkout-session',{orderId:'KD-'+String(n[0]%100000000).padStart(8,'0'),customer:{name:'TEST Customer',phone:'0000000000',city:'TEST',location:'TEST — no delivery'},items:[{id:f.get('product'),qty:Number(f.get('qty')),imageIndex:Number(f.get('image'))}]});sessionStorage.setItem(key,d.receipt);location.assign(d.url);}catch(e){result.textContent=e.message;}finally{button.disabled=false;}};
const state=new URLSearchParams(location.search).get('ziina');if(state){history.replaceState(null,'','/test');if(state==='success')finalize();else{result.textContent='لم يكتمل الدفع التجريبي.';retry.hidden=!sessionStorage.getItem(key);}}else retry.hidden=!sessionStorage.getItem(key);
</script></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'"}});
}
