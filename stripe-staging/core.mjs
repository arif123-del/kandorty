// Isolated TEST implementation. Production orders and stock are never written.
export const TEST_ONLY = true;
export const DELIVERY = 2500;
const enc = new TextEncoder();
export class Fault extends Error { constructor(code, status=400){super(code);this.status=status;} }
const requireThat=(ok,code,status)=>{if(!ok)throw new Fault(code,status);};
export async function hash(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value))),x=>x.toString(16).padStart(2,'0')).join('');}
function text(value,max,required=true){requireThat(typeof value==='string'&&value.length<=max&&(!required||value.trim().length>0),'invalid_customer');return value.trim();}
export function normalize(body){
 requireThat(/^[a-f0-9]{64}$/.test(body.checkoutToken||''),'invalid_checkout_token');
 requireThat(Array.isArray(body.items)&&body.items.length>0&&body.items.length<=20,'invalid_items');
 const map=new Map();
 for(const i of body.items){
  requireThat(i&&typeof i.id==='string'&&/^[A-Za-z0-9_-]{1,150}$/.test(i.id),'invalid_product');
  requireThat(Number.isSafeInteger(i.qty)&&i.qty>0&&i.qty<=99,'invalid_quantity');
  const imageIndex=i.imageIndex??0;
  requireThat(Number.isSafeInteger(imageIndex)&&imageIndex>=0&&imageIndex<=7,'invalid_variant');
  const key=i.id+'__img'+imageIndex;const qty=(map.get(key)?.qty||0)+i.qty;
  requireThat(qty<=99,'invalid_quantity');map.set(key,{id:i.id,qty,imageIndex});
 }
 const customer=body.customer||{};
 return {items:[...map.values()].sort((a,b)=>a.id.localeCompare(b.id)||a.imageIndex-b.imageIndex),customer:{name:text(customer.name,100),phone:text(customer.phone,30),city:text(customer.city,100),location:text(customer.location,500)},note:text(body.note??'',15,false)};
}
export function money(value){
 requireThat(typeof value==='number'||typeof value==='string','invalid_price');
 requireThat(/^\d+(\.\d{1,2})?$/.test(String(value)),'invalid_price');
 const [whole,frac='']=String(value).split('.');const n=Number(whole)*100+Number(frac.padEnd(2,'0'));
 requireThat(Number.isSafeInteger(n)&&n>0&&n<=100000000,'invalid_price');return n;
}
export async function verifySignature(raw,header,secret,now=Date.now()){
 requireThat(typeof secret==='string'&&secret.startsWith('whsec_'),'webhook_not_configured',503);
 const parts=(header||'').split(',').map(x=>x.trim().split('='));
 const ts=parts.filter(x=>x[0]==='t');const sigs=parts.filter(x=>x[0]==='v1');
 requireThat(ts.length===1&&/^\d+$/.test(ts[0][1]),'invalid_signature',400);
 requireThat(Math.abs(Math.floor(now/1000)-Number(ts[0][1]))<=300,'stale_signature',400);
 const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 for(const [,hex] of sigs){
  if(!/^[a-f0-9]{64}$/i.test(hex))continue;
  const bytes=Uint8Array.from(hex.match(/../g),x=>parseInt(x,16));
  if(await crypto.subtle.verify('HMAC',key,bytes,enc.encode(ts[0][1]+'.'+raw)))return;
 }
 throw new Fault('invalid_signature',400);
}
export function createService({store,stripe,clock=()=>Date.now()}){
 async function create(body){
  let phase='normalize';
  try {
  const normalized=normalize(body),id=await hash(body.checkoutToken),fingerprint=await hash(JSON.stringify(normalized));
  phase='snapshot_read';
  let snapshot=await store.getSnapshot(id);
  if(!snapshot){
   const products=new Map(),quantities=new Map();const items=[];let subtotal=0;
   for(const i of normalized.items){
    let p=products.get(i.id);if(!p){phase='product_read';p=await store.getProduct(i.id);requireThat(p&&p.active!==false,'unavailable_product');products.set(i.id,p);}
    const images=Array.isArray(p.images)?p.images:[];
    requireThat(i.imageIndex===0||i.imageIndex<images.length,'invalid_variant');
    const amount=money(p.salePrice||p.price);subtotal+=amount*i.qty;
    const qty=(quantities.get(i.id)||0)+i.qty;quantities.set(i.id,qty);
    requireThat(qty<=99,'invalid_quantity');
    if(p.stock!==undefined&&p.stock!==null&&p.stock!=='')requireThat(Number.isSafeInteger(Number(p.stock))&&qty<=Number(p.stock),'insufficient_stock');
    items.push({...i,variantKey:i.id+'__img'+i.imageIndex,code:String(p.code||''),name:String(p.nameAr||p.nameEn||'Kandorty').slice(0,120),unitAmount:amount,price:amount/100,imageUrl:String(images[i.imageIndex]||'')});
   }
   requireThat(Number.isSafeInteger(subtotal)&&subtotal+DELIVERY<=100000000,'invalid_total');
   const proposed={id,orderId:'KD-TEST-'+id.slice(0,24),fingerprint,...normalized,items,subtotal,delivery:DELIVERY,total:subtotal+DELIVERY,currency:'aed',livemode:false,createdAt:new Date(clock()).toISOString(),expiresAt:clock()+3600000};
   phase='snapshot_create';snapshot=await store.createSnapshot(id,proposed); // create-if-absent, return winning snapshot
  }
  requireThat(snapshot.fingerprint===fingerprint,'checkout_conflict',409);
  requireThat(snapshot.expiresAt>clock(),'checkout_expired',409); // Never reuse Stripe keys after its retention window.
  phase='stripe_checkout';const session=await stripe.create(snapshot); // Stable params + stable Stripe idempotency key.
  requireThat(session.livemode===false&&/^cs_test_[A-Za-z0-9]+$/.test(session.id||''),'mode_mismatch',502);
  requireThat(typeof session.url==='string'&&new URL(session.url).origin==='https://checkout.stripe.com','invalid_checkout_url',502);
  phase='session_bind';await store.bindSession(id,session.id);
  return {id:session.id,url:session.url,orderId:snapshot.orderId,test:true};
  } catch(e) {
   if(e instanceof Fault)throw e;
   throw new Fault('staging_unexpected_'+phase,503);
  }
 }
 async function fulfill(sessionId,token){
  requireThat(/^cs_test_[A-Za-z0-9]+$/.test(sessionId||''),'invalid_session');
  const s=await stripe.retrieve(sessionId);
  requireThat(s.id===sessionId&&s.mode==='payment'&&s.livemode===false,'mode_mismatch',409);
  const id=s.metadata?.checkout_id;requireThat(/^[a-f0-9]{64}$/.test(id||''),'unknown_checkout',409);
  if(token!==undefined)requireThat(/^[a-f0-9]{64}$/.test(token)&&await hash(token)===id,'forbidden',403);
  const snapshot=await store.getSnapshot(id);requireThat(snapshot,'unknown_checkout',409);
  requireThat(s.client_reference_id===snapshot.orderId&&s.metadata?.order_id===snapshot.orderId&&s.currency==='aed'&&s.amount_total===snapshot.total,'payment_mismatch',409);
  requireThat(!snapshot.sessionId||snapshot.sessionId===sessionId,'session_conflict',409);
  if(s.payment_status!=='paid'||s.status!=='complete')return {paid:false,registered:false,test:true};
  // Bind even if a webhook wins the race with the create response. A different session cannot replace it.
  await store.bindSession(id,sessionId);
  const order={id:snapshot.orderId,customer:snapshot.customer,items:snapshot.items,note:snapshot.note,total:snapshot.total/100,deliveryFee:25,subtotal:snapshot.subtotal/100,payment:'card',paymentStatus:'paid',stripeSessionId:sessionId,status:'new',createdAt:snapshot.createdAt,paidAt:new Date(clock()).toISOString(),test:true};
  const saved=await store.finalize(id,sessionId,order); // Atomic order creation + fulfillment marker.
  return {paid:true,registered:true,orderId:saved.id,test:true};
 }
 async function webhook(raw,header,secret){
  await verifySignature(raw,header,secret,clock());
  let event;try{event=JSON.parse(raw);}catch{throw new Fault('invalid_json');}
  requireThat(event.livemode===false,'mode_mismatch',409);
  if(!['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type))return {received:true};
  await fulfill(event.data?.object?.id);
  return {received:true};
 }
 return {create,fulfill,webhook};
}
