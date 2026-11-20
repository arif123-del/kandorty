import test from 'node:test';
import assert from 'node:assert/strict';
import {claimDirectOrderNotification,deliverClaimedOrderNotification} from './direct-order-push.mjs';

const ID='KD-12345678',PROOF='a'.repeat(48),T=Date.parse('2026-11-20T08:00:00.000Z');
function fixture(changes={}){
 const rows=new Map();let version=0;
 rows.set('orders/'+ID,{data:{
   id:ID,editToken:PROOF,status:'new',createdAt:new Date(T-2000).toISOString(),
   customer:{name:'Fixture'},items:[{id:'test-p1',qty:1}]
   ,...changes},version:'1'});
 return {
  rows,
  get:async path=>rows.get(path)||null,
  write:(path,data,condition)=>({path,data,condition}),
  commit:async writes=>{
   for(const w of writes){
    const before=rows.get(w.path);
    if(w.condition?.exists===false && before)throw Error('write_conflict');
    if(w.condition?.updateTime && before?.version!==w.condition.updateTime)throw Error('write_conflict');
    rows.set(w.path,{data:w.data,version:String(++version+10)});
   }
  }
 };
}
test('verified newly saved customer order sends one native and browser push',async()=>{
 const store=fixture(),body={orderId:ID,editToken:PROOF};
 const claimed=await claimDirectOrderNotification(store,body,T);
 assert.equal(claimed.claimed,true);
 let browser=0,native=0;
 const sent=await deliverClaimedOrderNotification(store,claimed,async()=>{browser++;},async()=>{native++;return {sent:1}},T);
 assert.equal(sent.queued,true);
 assert.equal(browser,1);
 assert.equal(native,1);
 const again=await claimDirectOrderNotification(store,body,T+100);
 assert.equal(again.claimed,false);
 assert.equal(again.duplicate,true);
 const mark=(await store.get(claimed.path)).data;
 assert.equal(mark.state,'delivered');
 assert.equal(Object.keys(mark).some(x=>x.toLowerCase().includes('token')),false);
});
test('bad proof, unknown order or wrong new-order status never notify',async()=>{
 const f=fixture();
 await assert.rejects(claimDirectOrderNotification(f,{orderId:ID,editToken:'b'.repeat(48)},T),/invalid_direct_order_proof/);
 await assert.rejects(claimDirectOrderNotification(f,{orderId:'KD-99999999',editToken:PROOF},T),/invalid_direct_order_proof/);
 await assert.rejects(claimDirectOrderNotification(f,{orderId:ID,editToken:'not hex'},T),/invalid_direct_order_notification/);
 await assert.rejects(claimDirectOrderNotification(fixture({status:'cancelled'}),{orderId:ID,editToken:PROOF},T),/order_not_recent/);
 assert.equal([...f.rows.keys()].some(s=>s.includes('admin_direct_order_notifications')),false);
});
test('old historical orders and future-dated orders cannot replay new alerts',async()=>{
 for(const createdAt of [new Date(T-16*60*1000).toISOString(),new Date(T+5*60*1000).toISOString()]){
  await assert.rejects(claimDirectOrderNotification(fixture({createdAt}),{orderId:ID,editToken:PROOF},T),/order_not_recent/);
 }
});
test('simultaneous duplicate requests claim only one delivery',async()=>{
 const f=fixture(),body={orderId:ID,editToken:PROOF};
 const results=await Promise.all([claimDirectOrderNotification(f,body,T),claimDirectOrderNotification(f,body,T)]);
 assert.equal(results.filter(x=>x.claimed).length,1);
});
test('failed FCM (even with successful browser push) records retriable failure',async()=>{
 const f=fixture(),body={orderId:ID,editToken:PROOF};
 const claim=await claimDirectOrderNotification(f,body,T);
 await assert.rejects(deliverClaimedOrderNotification(f,claim,async()=>{},async()=>{throw Error('FCM_FAIL')},T),/direct_order_push_unavailable/);
 const row=await f.get(claim.path);
 assert.equal(row.data.state,'failed');
 const retry=await claimDirectOrderNotification(f,body,T+5000);
 assert.equal(retry.claimed,true);
 const ok=await deliverClaimedOrderNotification(f,retry,async()=>{},async()=>({sent:1}),T+5010);
 assert.equal(ok.queued,true);
});
