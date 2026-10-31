// Kandorty COD candidate — pure server-only plan, not deployed.
// Client requests are untrusted. All prices, IDs, stock and ownership come
// from trusted server-side product reads / verified auth / generated IDs.
export class CodFault extends Error {
 constructor(code){super(code);this.code=code;}
}
const check=(ok,code)=>{if(!ok)throw new CodFault(code);};
const idOK=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{1,150}$/.test(s);
const versionOK=s=>typeof s==='string'&&/^\d{4}-\d\d-\d\dT/.test(s);
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const digits=s=>String(s||'').replace(/\D/g,'');
const cents=x=>{
 check(typeof x==='number'||typeof x==='string','invalid_catalog_price');
 check(/^\d+(\.\d{1,2})?$/.test(String(x)),'invalid_catalog_price');
 const [whole,fraction='']=String(x).split('.');
 const n=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 check(Number.isSafeInteger(n)&&n>0&&n<=100000000,'invalid_catalog_price');
 return n;
};
const storeValue=v=>{
 if(v===null)return {nullValue:null};
 if(typeof v==='string')return {stringValue:v};
 if(typeof v==='boolean')return {booleanValue:v};
 if(typeof v==='number'){
  check(Number.isFinite(v),'invalid_value');
  return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};
 }
 if(Array.isArray(v))return {arrayValue:{values:v.map(storeValue)}};
 check(obj(v),'invalid_value');
 return {mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,storeValue(x)]))}};
};
const fields=x=>storeValue(x).mapValue.fields;
const doc=(root,collection,key)=>{check(idOK(key),'invalid_document_id');return root+'/'+collection+'/'+key;};
const put=(root,collection,key,data)=>({
 update:{name:doc(root,collection,key),fields:fields(data)},currentDocument:{exists:false}
});
const updated=(root,key,stock,totalStock,updatedAt,version)=>({
 update:{name:doc(root,'products',key),fields:fields({stock,totalStock,updatedAt})},
 updateMask:{fieldPaths:['stock','totalStock','updatedAt']},
 currentDocument:{updateTime:version}
});
async function digest(input){
 const bytes=new TextEncoder().encode(input);
 const result=await crypto.subtle.digest('SHA-256',bytes);
 return [...new Uint8Array(result)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export function normalizeCodRequest(input){
 check(obj(input),'invalid_request');
 check(Object.keys(input).every(k=>['checkoutToken','items','customer','note','payment'].includes(k)),
       'unsupported_client_fields');
 check(input.payment===undefined||input.payment==='cod','invalid_payment_mode');
 check(typeof input.checkoutToken==='string'&&/^[a-f0-9]{64}$/.test(input.checkoutToken),
       'invalid_checkout_token');
 check(obj(input.customer),'invalid_customer');
 const customer={};
 for(const [field,max] of [['name',100],['phone',30],['city',100],['location',500]]){
  const value=input.customer[field];
  check(typeof value==='string'&&value.trim().length>0&&value.length<=max,'invalid_customer');
  customer[field]=value.trim();
 }
 check(digits(customer.phone).length>=6&&digits(customer.phone).length<=18,'invalid_customer_phone');
 check(Array.isArray(input.items)&&input.items.length>=1&&input.items.length<=20,'invalid_items');
 const merged=new Map();
 for(const i of input.items){
  check(obj(i)&&Object.keys(i).every(k=>['id','qty','imageIndex'].includes(k)),'invalid_items');
  check(idOK(i.id),'invalid_product_id');
  check(Number.isSafeInteger(i.qty)&&i.qty>=1&&i.qty<=99,'invalid_quantity');
  const imageIndex=i.imageIndex??0;
  check(Number.isSafeInteger(imageIndex)&&imageIndex>=0&&imageIndex<=7,'invalid_variant');
  const key=i.id+'__img'+imageIndex;
  const qty=(merged.get(key)?.qty||0)+i.qty;
  check(qty<=99,'invalid_quantity');
  merged.set(key,{id:i.id,qty,imageIndex});
 }
 const note=input.note??'';
 check(typeof note==='string'&&note.length<=15,'invalid_note');
 return {customer,items:[...merged.values()].sort((a,b)=>a.id.localeCompare(b.id)||a.imageIndex-b.imageIndex),note:note.trim()};
}
/**
 * All values not in "request" must be produced/read by the trusted backend:
 * checkoutId = sha256(request.checkoutToken); orderId = random collision-resistant
 * numeric 8-digit ID, generated server-side and protected by create-only precondition;
 * editToken = 24-byte random hex; accessKey = hash(orderId|phone) for legacy shape,
 * but guest access must be mediated by an authenticated/rate-limited backend.
 *
 * Firestore documents:commit is atomic. On conflict, reread all trusted documents.
 * No email, payment authorizations, Firebase Rules or production data are accessed.
 */
export async function prepareCodOrder({
 request,projectId,orderId,editToken,accessKey,products,
 nowISO,testOnly=false,existingIntent=null,existingOrder=null,verifiedIdentity=null
}){
 const normalized=normalizeCodRequest(request);
 check(/^[a-z][a-z0-9-]{4,60}$/.test(projectId||'')&&
       (testOnly ? projectId==='kandorty-stripe-test-5f8af' : projectId!=='kandorty-stripe-test-5f8af'),'invalid_project');
 check(/^KD-[0-9]{8}$/.test(orderId||''),'invalid_order_id');
 check(/^[a-f0-9]{48}$/.test(editToken||''),'invalid_server_edit_token');
 check(typeof nowISO==='string'&&!Number.isNaN(Date.parse(nowISO)),'invalid_timestamp');
 check(obj(products),'missing_catalog');
 const checkoutId=await digest(request.checkoutToken);
 const fingerprint=await digest(JSON.stringify(normalized));
 check(accessKey===await digest(orderId.toUpperCase()+'|'+digits(normalized.customer.phone)),
       'invalid_server_access_key');
 if(existingIntent!==null||existingOrder!==null){
  check(obj(existingIntent)&&obj(existingOrder),'partial_existing_order');
  check(existingIntent.checkoutId===checkoutId&&existingIntent.fingerprint===fingerprint&&
        existingIntent.orderId===existingOrder.id&&
        existingOrder.id===orderId&&existingOrder.payment==='cod'&&
        existingOrder.paymentStatus==='unpaid'&&
        existingIntent.fulfilled===true,'checkout_conflict');
  return {replay:true,writes:[],order:existingOrder,checkoutId};
 }
 const root='projects/'+projectId+'/databases/(default)/documents';
 const productQuantities=new Map();
 const items=[];let subtotal=0;
 for(const item of normalized.items){
  const row=products[item.id];
  check(obj(row)&&obj(row.data)&&row.data.active!==false,'unavailable_product');
  const p=row.data;
  const images=Array.isArray(p.images)?p.images:[];
  check(item.imageIndex===0||item.imageIndex<images.length,'invalid_variant');
  const unitAmount=cents(p.salePrice||p.price);
  subtotal+=unitAmount*item.qty;
  check(Number.isSafeInteger(subtotal)&&subtotal<=100000000,'invalid_total');
  const qty=(productQuantities.get(item.id)||0)+item.qty;
  check(qty<=99,'invalid_quantity');
  productQuantities.set(item.id,qty);
  items.push({
   id:item.id,code:String(p.code||'').slice(0,120),
   name:String(p.nameAr||p.nameEn||'Kandorty').slice(0,120),
   price:unitAmount/100,qty:item.qty,imageIndex:item.imageIndex,
   variantKey:item.id+'__img'+item.imageIndex,
   imageUrl:String(images[item.imageIndex]||'').slice(0,1200)
  });
 }
 const totalFils=subtotal+2500;
 check(totalFils<=100000000,'invalid_total');
 const stockDebits={},stockWrites=[];
 for(const [id,qty] of productQuantities){
  const row=products[id],p=row.data;
  if(p.stock===''||p.stock===undefined||p.stock===null)continue;
  check((typeof p.stock==='number'||typeof p.stock==='string')&&
        /^(0|[1-9]\d*)$/.test(String(p.stock)),'invalid_stock');
  const current=Number(p.stock);
  check(Number.isSafeInteger(current)&&current>=qty,'insufficient_stock');
  check(versionOK(row.updateTime),'missing_product_version');
  const totalStock=Number(p.totalStock);
  stockDebits[id]=qty;
  stockWrites.push(updated(root,id,current-qty,
    Number.isSafeInteger(totalStock)&&totalStock>0?Math.max(totalStock,current):current,
    nowISO,row.updateTime));
 }
 const customer=normalized.customer;
 const order={
  id:orderId,customer,customerName:customer.name,
  customerPhone:customer.phone,customerCity:customer.city,
  customerLocation:customer.location,createdAt:nowISO,status:'new',
  payment:'cod',paymentStatus:'unpaid',
  subtotal:subtotal/100,deliveryFee:25,deliveryPayment:'with_order',
  total:totalFils/100,notes:normalized.note,
  items,stockDebits,inventoryStatus:'debited',
  stockDebited:Object.keys(stockDebits).length>0,editToken
 };
 // Identity must be verified by the server against the user's ID token.
 if(verifiedIdentity!==null){
  check(obj(verifiedIdentity)&&idOK(verifiedIdentity.uid)&&
    digits(verifiedIdentity.phoneNumber)===digits(customer.phone),'unverified_customer_identity');
  order.customerUid=verifiedIdentity.uid;
  order.authPhone=verifiedIdentity.phoneNumber;
 }
 const quantities=Object.fromEntries(items.map(i=>[i.variantKey,i.qty]));
 const intent={
  checkoutId,fingerprint,orderId,fulfilled:true,
  status:'created',payment:'cod',createdAt:nowISO,totalFils
 };
 const edit={orderId,editToken,status:'new',createdAt:nowISO,customer,
  payment:'cod',notes:normalized.note,items,quantities,updatedAt:nowISO};
 const access={orderId,editToken,active:true,createdAt:nowISO};
 const writes=[
  put(root,'cod_checkout_intents',checkoutId,intent),
  put(root,'orders',orderId,order),
  put(root,'tracking',orderId,{id:orderId,status:'new',createdAt:nowISO}),
  put(root,'order_edits',editToken,edit),
  put(root,'order_access',accessKey,access),
  ...stockWrites
 ];
 check(writes.length<=25,'too_many_writes');
 return {replay:false,writes,checkoutId,order,stockDebits};
}
