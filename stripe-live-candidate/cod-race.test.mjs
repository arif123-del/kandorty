import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareCodOrder,normalizeCodRequest} from './cod.mjs';
const sha=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const version=n=>'2026-10-27T15:00:0'+n+'.000000Z';
const root='projects/kandorty-production-shape/databases/(default)/documents/';
const decode=v=>{
 if('integerValue'in v)return Number(v.integerValue);
 if('doubleValue'in v)return Number(v.doubleValue);
 if('stringValue'in v)return v.stringValue;
 if('booleanValue'in v)return v.booleanValue;
 if('arrayValue'in v)return (v.arrayValue.values||[]).map(decode);
 return Object.fromEntries(Object.entries(v.mapValue?.fields||{}).map(([k,x])=>[k,decode(x)]));
};
function mockDB(){
 const map=new Map();let sequence=0;
 const insert=(path,data)=>{const d={data,updateTime:version(++sequence)};map.set(path,d);return d;};
 const get=path=>map.get(path)||null;
 function commit(writes){
  // Check ALL write preconditions first, just like one atomic Firestore commit.
  for(const w of writes){
   const old=get(w.update.name);
   if(w.currentDocument?.exists===false && old)throw Error('ALREADY_EXISTS');
   if(w.currentDocument?.updateTime!==undefined&&
     (!old||old.updateTime!==w.currentDocument.updateTime))throw Error('FAILED_PRECONDITION');
  }
  for(const w of writes){
   const old=get(w.update.name)?.data||{};
   const data=Object.fromEntries(Object.entries(w.update.fields).map(([k,v])=>[k,decode(v)]));
   insert(w.update.name,w.updateMask?{...old,...data}:data);
  }
 }
 return {get,insert,commit,map};
}
test('two concurrent COD retries with one checkout token cannot double-decrement inventory',async()=>{
 const db=mockDB();
 const p=db.insert(root+'products/dressA',{nameAr:'Dress',price:10,stock:4,totalStock:8});
 const request={
  checkoutToken:'a'.repeat(64),payment:'cod',note:'test',
  customer:{name:'Guest',phone:'+971 50 123 4567',city:'Dubai',location:'Test location'},
  items:[{id:'dressA',qty:2,imageIndex:0}]
 };
 const common={
  request,orderId:'KD-12345678',editToken:'c'.repeat(48),
  accessKey:await sha('KD-12345678|'+request.customer.phone.replace(/\D/g,'')),
  projectId:'kandorty-production-shape',nowISO:'2026-10-27T15:01:00.000Z',
  products:{dressA:{data:p.data,updateTime:p.updateTime}}
 };
 const first=await prepareCodOrder(common);
 const second=await prepareCodOrder(common);
 db.commit(first.writes);
 assert.throws(()=>db.commit(second.writes),/ALREADY_EXISTS|FAILED_PRECONDITION/);
 assert.equal(db.get(root+'products/dressA').data.stock,2);
 assert.equal(db.get(root+'orders/KD-12345678').data.paymentStatus,'unpaid');
 assert.equal(db.get(root+'cod_checkout_intents/'+first.checkoutId).data.fulfilled,true);
 assert.equal([...db.map.keys()].filter(k=>k.includes('/orders/')).length,1);

 // Retry handler reloads existing intent+order from server and returns same order.
 const replay=await prepareCodOrder({...common,
  existingIntent:db.get(root+'cod_checkout_intents/'+first.checkoutId).data,
  existingOrder:db.get(root+'orders/KD-12345678').data});
 assert.equal(replay.replay,true);
 assert.equal(replay.writes.length,0);
 assert.equal(db.get(root+'products/dressA').data.stock,2);
});
test('concurrent distinct COD orders competing for the last stock unit cannot overdraw',async()=>{
 const db=mockDB();
 const p=db.insert(root+'products/dressA',{nameAr:'Dress',price:10,stock:1,totalStock:1});
 const customer={name:'Guest',phone:'+971501234567',city:'Dubai',location:'Test'};
 async function make(token,orderId){
  return prepareCodOrder({
   request:{checkoutToken:token,customer,items:[{id:'dressA',qty:1}]},
   orderId,projectId:'kandorty-production-shape',
   editToken:'c'.repeat(48),accessKey:await sha(orderId+'|'+customer.phone.replace(/\D/g,'')),
   nowISO:'2026-10-27T15:01:00.000Z',
   products:{dressA:{data:p.data,updateTime:p.updateTime}}
  });
 }
 const a=await make('a'.repeat(64),'KD-12345678');
 const b=await make('b'.repeat(64),'KD-12345679');
 db.commit(a.writes);
 assert.throws(()=>db.commit(b.writes),/FAILED_PRECONDITION/);
 assert.equal(db.get(root+'products/dressA').data.stock,0);
 assert.equal([...db.map.keys()].filter(k=>k.includes('/orders/')).length,1);
});
