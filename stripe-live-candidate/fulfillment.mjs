// Candidate ONLY: pure, side-effect-free plan for eventual server-side LIVE fulfillment.
// NOT deployed; never wire this to the current storefront before a full security review.
export class CheckoutFault extends Error {
 constructor(code){super(code);this.code=code;}
}
const check=(value,code)=>{if(!value)throw new CheckoutFault(code);};
const identity=s=>typeof s==="string"&&/^[A-Za-z0-9_-]{1,150}$/.test(s);
const object=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const money=v=>Number.isSafeInteger(v)&&v>0;
const numberStock=v=>{
 if(typeof v==="number")return Number.isSafeInteger(v)&&v>=0?v:null;
 if(typeof v==="string"&&/^\d{1,12}$/.test(v))return Number(v);
 return null;
};
function typed(value){
 if(value===null)return {nullValue:null};
 if(typeof value==="string")return {stringValue:value};
 if(typeof value==="boolean")return {booleanValue:value};
 if(typeof value==="number"){check(Number.isFinite(value),"invalid_field_value");return Number.isInteger(value)?{integerValue:String(value)}:{doubleValue:value};}
 if(Array.isArray(value))return {arrayValue:{values:value.map(typed)}};
 check(object(value),"invalid_field_value");
 return {mapValue:{fields:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,typed(v)]))}};
}
function fields(value){return typed(value).mapValue.fields;}
function path(root,type,id){check(identity(id),"invalid_document_id");return root+"/"+type+"/"+id;}
const validVersion=v=>typeof v==="string"&&/^\d{4}-\d\d-\d\dT/.test(v);

export function validatePaidSession(session,snapshot){
 check(object(session)&&object(snapshot),"missing_checkout");
 check(/^cs_live_[A-Za-z0-9]+$/.test(session.id||""),"not_live_session");
 check(session.livemode===true&&session.mode==="payment"&&
       session.payment_status==="paid"&&session.status==="complete","payment_not_verified");
 check(session.currency==="aed"&&money(snapshot.totalFils)&&
       Number.isSafeInteger(session.amount_total)&&
       session.amount_total===snapshot.totalFils,"paid_amount_mismatch");
 check(/^KD-\d{8}$/.test(snapshot.orderId||""),"invalid_order_id");
 check(/^[a-f0-9]{64}$/.test(snapshot.checkoutId||""),"invalid_checkout_id");
 check(session.client_reference_id===snapshot.orderId&&
       session.metadata?.order_id===snapshot.orderId&&
       session.metadata?.checkout_id===snapshot.checkoutId,"checkout_binding_mismatch");
 check(!snapshot.sessionId||snapshot.sessionId===session.id,"session_binding_mismatch");
 return true;
}

/**
 * This prepares ONE Firestore documents:commit request, never executes it.
 * caller MUST verify Stripe signature or retrieve Stripe paid Session using a server key;
 * caller MUST read snapshot + all product records and order doc from trusted Firestore;
 * caller MUST generate editToken + accessKey server-side (do not accept them from client);
 * caller MUST atomically commit all writes, retry only on version conflicts, and
 * reconcile signed webhook retries without relying on browser return.
 */
export function preparePaidFulfillment({
 session,snapshot,snapshotVersion,existingOrder=null,products,
 editToken,accessKey,nowISO,projectId
}){
 validatePaidSession(session,snapshot);
 check(/^[a-z][a-z0-9-]{4,60}$/.test(projectId||""),"invalid_project");
 check(projectId!=="kandorty-stripe-test-5f8af","test_project_not_live");
 check(validVersion(snapshotVersion),"missing_snapshot_version");
 check(typeof nowISO==="string"&&!Number.isNaN(Date.parse(nowISO)),"invalid_timestamp");
 const root="projects/"+projectId+"/databases/(default)/documents";
 if(existingOrder!==null){
  check(existingOrder.id===snapshot.orderId&&
    existingOrder.stripeSessionId===session.id&&
    existingOrder.paymentStatus==="paid","existing_order_conflict");
  return {replay:true,writes:[],order:existingOrder,inventoryStatus:existingOrder.inventoryStatus};
 }
 check(/^[a-f0-9]{48}$/.test(editToken||""),"invalid_server_edit_token");
 check(/^[a-f0-9]{64}$/.test(accessKey||""),"invalid_server_access_key");
 const customer=snapshot.customer;
 check(object(customer)&&[customer.name,customer.phone,customer.city,customer.location]
   .every(x=>typeof x==="string"&&x.length>0&&x.length<=500),"invalid_customer");
 check(Array.isArray(snapshot.items)&&snapshot.items.length>0&&snapshot.items.length<=20,"invalid_items");
 check(object(products),"missing_products");
 const byProduct=new Map(),quantities={};
 let subtotal=0;
 for(const item of snapshot.items){
  check(object(item)&&identity(item.id)&&Number.isSafeInteger(item.qty)&&
        item.qty>0&&item.qty<=99&&money(item.unitAmount),"invalid_items");
  const imageIndex=item.imageIndex??0;
  check(Number.isInteger(imageIndex)&&imageIndex>=0&&imageIndex<=7,"invalid_variant");
  const lineKey=item.id+"__img"+imageIndex;
  check(!Object.hasOwn(quantities,lineKey),"duplicate_line_item");
  quantities[lineKey]=item.qty;
  const accumulated=(byProduct.get(item.id)||0)+item.qty;
  check(accumulated<=99,"invalid_quantity");
  byProduct.set(item.id,accumulated);
  subtotal+=item.unitAmount*item.qty;
  check(Number.isSafeInteger(subtotal),"invalid_total");
 }
 check(subtotal+2500===snapshot.totalFils,"snapshot_total_mismatch");
 // A successful payment must ALWAYS be recorded, even if stock became unavailable after checkout.
 // In that case do not debit ANY stock, mark the paid order for manual review/refund.
 const stockDebits={},updates=[];
 let shortages=false;
 for(const [productId,need] of byProduct){
  const row=products[productId];
  if(!object(row)||!object(row.data)){shortages=true;continue;}
  const value=row.data.stock;
  if(value!==null&&value!==undefined&&value!==""){
   const current=numberStock(value);
   if(current===null||current<need){shortages=true;continue;}
   check(validVersion(row.updateTime),"missing_product_version");
   stockDebits[productId]=need;
   const priorTotal=Number(row.data.totalStock);
   updates.push({
    path:path(root,"products",productId),
    updateTime:row.updateTime,
    stock:current-need,
    totalStock:Number.isSafeInteger(priorTotal)&&priorTotal>0?Math.max(priorTotal,current):current
   });
  }
 }
 const inventoryStatus=shortages?"needs_review":"debited";
 const recordedDebits=shortages?{}:stockDebits;
 const order={
  id:snapshot.orderId,createdAt:snapshot.createdAt||nowISO,
  customer,customerName:customer.name,customerPhone:customer.phone,
  customerCity:customer.city,customerLocation:customer.location,
  payment:"card",paymentStatus:"paid",paidAt:nowISO,
  stripeSessionId:session.id,
  items:snapshot.items.map(i=>({
   id:i.id,code:String(i.code||""),name:String(i.name||"Kandorty").slice(0,120),
   price:i.unitAmount/100,qty:i.qty,variantKey:i.id+"__img"+(i.imageIndex??0),
   imageIndex:i.imageIndex??0,imageUrl:String(i.imageUrl||"").slice(0,1200)
  })),
  subtotal:subtotal/100,deliveryFee:25,deliveryPayment:"with_card",
  total:snapshot.totalFils/100,
  notes:String(snapshot.note||"").slice(0,15),
  status:"new",inventoryStatus,
  stockDebited:!shortages&&Object.keys(recordedDebits).length>0,
  stockDebits:recordedDebits,
  editToken
 };
 // Never transfer an unauthenticated browser-provided uid into privileged order ownership.
 if(snapshot.verifiedCustomerUid&&identity(snapshot.verifiedCustomerUid)&&
    snapshot.customerUidVerifiedByServer===true)order.customerUid=snapshot.verifiedCustomerUid;
 const edit={
  orderId:order.id,editToken,status:"new",createdAt:order.createdAt,customer,
  payment:"card",notes:order.notes,items:order.items,quantities,updatedAt:nowISO
 };
 const access={orderId:order.id,editToken,active:true,createdAt:nowISO};
 const put=(collection,id,data,condition={exists:false})=>({
  update:{name:path(root,collection,id),fields:fields(data)},
  currentDocument:condition
 });
 const writes=[
  put("orders",order.id,order),
  put("tracking",order.id,{id:order.id,status:"new",createdAt:order.createdAt}),
  put("order_edits",editToken,edit),
  put("order_access",accessKey,access),
  put("stripe_checkout_sessions",snapshot.checkoutId,{
   ...snapshot,sessionId:session.id,fulfilled:true,
   paidAt:nowISO,inventoryStatus,orderId:order.id,stockDebits:recordedDebits
  },{updateTime:snapshotVersion})
 ];
 if(!shortages)for(const u of updates)writes.push({
  update:{name:u.path,fields:fields({
   stock:u.stock,totalStock:u.totalStock,updatedAt:nowISO
  })},
  updateMask:{fieldPaths:["stock","totalStock","updatedAt"]},
  currentDocument:{updateTime:u.updateTime}
 });
 return {replay:false,writes,order,inventoryStatus,stockDebits:recordedDebits};
}
