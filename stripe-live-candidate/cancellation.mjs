// Pure cancellation stock-release candidate, deliberately not deployed.
// ONLY uses stockDebits recorded by a trusted server-paid commit, never cart item quantities.
// The production admin/client cancellation code must be migrated before this is released.
import {CheckoutFault} from './fulfillment.mjs';
const ensure=(p,msg)=>{if(!p)throw new CheckoutFault(msg)};
const goodId=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,150}$/.test(s);
const version=s=>typeof s==='string'&&/^\d{4}-\d\d-\d\dT/.test(s);
const isObject=s=>typeof s==='object'&&s!==null&&!Array.isArray(s);
const typed=n=>({integerValue:String(n)});
function nStock(v){
 if(typeof v==='number'&&Number.isSafeInteger(v)&&v>=0)return v;
 if(typeof v==='string'&&/^\d{1,12}$/.test(v))return Number(v);
 return null;
}

export function preparePaidCancellationRestock({projectId,order,orderUpdateTime,products,nowISO}){
 ensure(/^[a-z][a-z0-9-]{4,60}$/.test(projectId||''),'invalid_project');
 ensure(projectId!=='kandorty-stripe-test-5f8af','test_project_not_live');
 ensure(isObject(order)&&/^KD-\d{8}$/.test(order.id||''),'invalid_order_id');
 ensure(version(orderUpdateTime),'missing_order_version');
 ensure(order.payment==='card'&&order.paymentStatus==='paid','not_paid_card_order');
 ensure(order.status==='cancelled'&&order.cancelledBy==='customer','not_customer_canceled');
 // Idempotent no-op, even if another tab received the same cancellation.
 if(order.cancelStockRestoredAt)return {replay:true,writes:[],restored:{}};
 ensure(isObject(order.stockDebits),'missing_server_stock_debits');
 ensure(isObject(products),'missing_product_snapshots');
 ensure(typeof nowISO==='string'&&!Number.isNaN(Date.parse(nowISO)),'invalid_timestamp');
 const root='projects/'+projectId+'/databases/(default)/documents/';
 const paths=[],restored={};
 for(const [id,rawNeed] of Object.entries(order.stockDebits)){
  ensure(goodId(id)&&Number.isSafeInteger(rawNeed)&&rawNeed>0&&rawNeed<=99,'invalid_stock_debit');
  const row=products[id];
  ensure(isObject(row)&&isObject(row.data)&&version(row.updateTime),'missing_product_version');
  const current=nStock(row.data.stock);
  ensure(current!==null&&Number.isSafeInteger(current+rawNeed),'invalid_product_stock');
  const totalStock=Number(row.data.totalStock);
  // Product may have been restocked separately by admin; never cap inventory arbitrarily.
  // Quantity is increased exactly once using version-based commit precondition.
  restored[id]=rawNeed;
  paths.push({
   update:{name:root+'products/'+id,fields:{
    stock:typed(current+rawNeed),
    ...(Number.isSafeInteger(totalStock)&&totalStock>0?{totalStock:typed(Math.max(totalStock,current+rawNeed))}:{}),
    updatedAt:{stringValue:nowISO}
   }},
   updateMask:{fieldPaths:[
    'stock', ...(Number.isSafeInteger(totalStock)&&totalStock>0?['totalStock']:[]),'updatedAt'
   ]},
   currentDocument:{updateTime:row.updateTime}
  });
 }
 // A single Firestore commit guarantees that the marker and every stock increment
 // succeed together, or not at all; a conflicting concurrent transaction retries from fresh versions.
 const marker={
  update:{name:root+'orders/'+order.id,fields:{
   cancelStockRestoredAt:{stringValue:nowISO},
   cancelStockRestoreVersion:{stringValue:'trusted_paid_debits_v1'}
  }},
  updateMask:{fieldPaths:['cancelStockRestoredAt','cancelStockRestoreVersion']},
  currentDocument:{updateTime:orderUpdateTime}
 };
 return {replay:false,writes:[marker,...paths],restored};
}
