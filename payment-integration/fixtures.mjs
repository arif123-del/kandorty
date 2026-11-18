// Mock provider evidence is used ONLY by tests; never imported by Worker routes.
import {pack,unpack} from '../cod-staging/firestore.mjs';
import {Fault,random} from '../cod-staging/security.mjs';
import {PROJECT} from './settlement.mjs';
export function memoryStore(stock=5){
 const root=`projects/${PROJECT}/databases/(default)/documents`,rows=new Map();let counter=0;
 const put=(p,data)=>rows.set(p,{data,version:'2026-10-27T00:00:00.'+String(++counter).padStart(6,'0')+'Z'});
 put('products/p1',{price:10,stock,nameAr:'TEST ONLY'});
 const store={root,rows,put,get:async p=>structuredClone(rows.get(p)||null),write:(path,data,currentDocument)=>({update:{name:root+'/'+path,fields:pack(data).mapValue.fields},currentDocument}),commit:async writes=>{
  for(const w of writes){const path=w.update.name.split('/documents/')[1],row=rows.get(path),c=w.currentDocument;
   if(w.update.name!==root+'/'+path)throw new Fault('unsafe_destination',503);
   if(c.exists===false&&row||c.updateTime&&c.updateTime!==row?.version)throw new Fault('write_conflict',409);
  }
  for(const w of writes){const path=w.update.name.split('/documents/')[1],data=unpack({mapValue:{fields:w.update.fields}});put(path,w.updateMask?{...rows.get(path).data,...data}:data);}
 }};return store;
}
export const request=(id='p1')=>({checkoutToken:random(32),customer:{name:'SYNTHETIC TEST',phone:'+971500000000',city:'Dubai',location:'SYNTHETIC TEST ADDRESS'},items:[{id,qty:1}]});
export function evidence(s){return s.provider==='stripe'?{__simulated:true,id:'pi_test'+random(10),livemode:false,status:'succeeded',amount:s.totalFils,amount_received:s.totalFils,currency:'aed',metadata:{checkout_id:s.checkoutId,order_id:s.orderId}}:{__simulated:true,id:crypto.randomUUID(),test:true,status:'completed',amount:s.totalFils,currency_code:'AED',tip_amount:0,vat_amount:0,account_id:'test_account',operation_id:crypto.randomUUID()};}
