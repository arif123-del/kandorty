import {Fault,hash} from '../cod-staging/security.mjs';
import {publicOrder} from './service.mjs';
const check=(p,c)=>{if(!p)throw new Fault(c,409);};
export function lifecycle(cfg,store){
 check(store.root===`projects/${cfg.projectId}/databases/(default)/documents`,'store_project_mismatch');
 return {
  async change(orderId,target,actor){
   check(/^KD-\d{8}$/.test(orderId||''),'invalid_order');check(['preparing','shipping','delivered','cancelled'].includes(target),'invalid_transition');
   for(let n=0;n<5;n++){
    const row=await store.get('orders/'+orderId),ledger=await store.get('order_lifecycle/'+orderId);check(row&&ledger,'managed_order_required');
    const o=row.data,l=ledger.data;check(l.orderId===orderId&&l.payment===o.payment,'order_binding_mismatch');
    if(actor.kind==='guest')check(target==='cancelled'&&actor.checkoutId===l.checkoutId&&await hash(actor.manageToken||'')===l.manageTokenHash,'invalid_manage_token');
    else check(actor.kind==='admin'&&typeof actor.uid==='string'&&actor.uid.length>0,'admin_required');
    if(o.status===target)return publicOrder(o);
    const allowed={new:['preparing','cancelled'],preparing:['shipping'],shipping:['delivered']};
    check(allowed[o.status]?.includes(target),'order_state_locked');
    // Never prepare an order whose paid stock still needs operator resolution or whose refund is in progress.
    if(target!=='cancelled')check(o.inventoryStatus==='debited'&&(!o.refundStatus||o.refundStatus==='none'),'order_requires_review');
    const at=new Date().toISOString(),next={...o,status:target,updatedAt:at},writes=[];
    if(target==='cancelled'){
     if(l.restockedAt){
      // Firestore REST GETs below are separate reads, not one atomic snapshot.
      // A concurrent successful cancellation may therefore leave us seeing an
      // older order status alongside the already-restocked lifecycle ledger.
      // Re-read the order and only acknowledge success once it is actually
      // cancelled; never return success for an inconsistent ledger/order pair.
      const fresh=await store.get('orders/'+orderId);
      if(fresh?.data?.status==='cancelled')return publicOrder(fresh.data);
      if(fresh?.data?.status!=='new')throw new Fault('restock_state_conflict',409);
      await new Promise(resolve=>setTimeout(resolve,40*(n+1)));
      continue;
     }
     for(const [id,qty] of Object.entries(l.stockDebits||{})){
      check(/^[A-Za-z0-9_-]{1,150}$/.test(id)&&Number.isSafeInteger(qty)&&qty>0&&qty<=99,'invalid_recorded_debit');
      const p=await store.get('products/'+id),stock=Number(p?.data.stock);check(p&&p.data.stock!==null&&p.data.stock!==''&&Number.isSafeInteger(stock)&&stock>=0&&Number.isSafeInteger(stock+qty),'invalid_stock');
      writes.push(store.write('products/'+id,{...p.data,stock:stock+qty,totalStock:Math.max(Number(p.data.totalStock)||0,stock+qty),updatedAt:at},{updateTime:p.version}));
     }
     next.cancelledBy=actor.kind;next.cancelStockRestoredAt=at;next.inventoryStatus='restored';
     if(o.payment==='card'){
      next.refundStatus=!o.refundStatus||o.refundStatus==='none'?'required':o.refundStatus;
      writes.push(store.write('stripe_refund_queue/'+orderId,{orderId,checkoutId:l.checkoutId,resolved:false,reason:'cancelled_paid_order',createdAt:at}));
     }
     writes.push(store.write('order_lifecycle/'+orderId,{...l,restockedAt:at},{updateTime:ledger.version}));
    }
    writes.push(store.write('orders/'+orderId,next,{updateTime:row.version}));
    const tracking=await store.get('tracking/'+orderId);check(tracking,'missing_tracking');writes.push(store.write('tracking/'+orderId,{...tracking.data,status:target,updatedAt:at},{updateTime:tracking.version}));
    const edit=await store.get('order_edits/'+o.editToken);if(edit)writes.push(store.write('order_edits/'+o.editToken,{...edit.data,status:target,updatedAt:at},{updateTime:edit.version}));
    writes.push(store.write('order_audit/'+orderId+'_'+target,{orderId,status:target,actor:actor.kind,actorUid:actor.uid||null,at},{exists:false}));
    try{await store.commit(writes);return publicOrder(next);}catch(e){if(e.message!=='write_conflict')throw e;}
   }throw new Fault('database_busy',503);
  }
 };
}
