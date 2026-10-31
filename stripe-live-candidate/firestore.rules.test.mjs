import test, {before, beforeEach, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {initializeTestEnvironment, assertSucceeds, assertFails} from '@firebase/rules-unit-testing';
import {
 doc, collection, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
 query, where
} from 'firebase/firestore';

let env;
let anon, phone, wrongPhone, admin;
const seedOrder = {
 id:'KD-12345678',createdAt:'2026-10-27T00:00:00.000Z',status:'new',
 payment:'card',paymentStatus:'paid',total:35,
 customerUid:'customer1',customer:{name:'TEST',phone:'+971500001111',city:'Dubai',location:'test'},
 items:[{id:'dressA',qty:1,price:10}],notes:'',editToken:'secret-edit-token'
};

before(async()=>{
 env=await initializeTestEnvironment({
  projectId:'demo-kandorty-stripe-rules-only',
  firestore:{
   host:'127.0.0.1',port:8088,
   rules:fs.readFileSync(new URL('./firestore.rules',import.meta.url),'utf8')
  }
 });
 anon=env.unauthenticatedContext().firestore();
 phone=env.authenticatedContext('customer1',{phone_number:'+971500001111'}).firestore();
 wrongPhone=env.authenticatedContext('customer2',{phone_number:'+971500002222'}).firestore();
 admin=env.authenticatedContext('trustedAdmin',{admin:true}).firestore();
});
beforeEach(async()=>{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async context=>{
  const db=context.firestore();
  await Promise.all([
   setDoc(doc(db,'products/dressA'),{stock:5,price:10,nameAr:'فستان',updatedAt:'t0'}),
   setDoc(doc(db,'orders/KD-12345678'),seedOrder),
   setDoc(doc(db,'tracking/KD-12345678'),{id:'KD-12345678',status:'new'}),
   setDoc(doc(db,'order_edits/secret-edit-token'),{orderId:'KD-12345678',editToken:'secret-edit-token',
    customer:seedOrder.customer,items:seedOrder.items}),
   setDoc(doc(db,'order_access/capability-secret'),{orderId:'KD-12345678',editToken:'secret-edit-token',active:true}),
   setDoc(doc(db,'customers/customer1'),{name:'Buyer',phone:'+971500001111',location:'Dubai',updatedAt:'t0'})
  ]);
 });
});
after(async()=>{if(env)await env.cleanup()});

test('anonymous users can read public catalog',async()=>{
 const result=await assertSucceeds(getDoc(doc(anon,'products/dressA')));
 assert.equal(result.data().stock,5);
});
test('anonymous attacker cannot decrement inventory even when only stock and updatedAt changed',async()=>{
 await assertFails(updateDoc(doc(anon,'products/dressA'),{stock:0,updatedAt:'t1'}));
});
test('authenticated phone buyer cannot decrement inventory or change price',async()=>{
 await assertFails(updateDoc(doc(phone,'products/dressA'),{stock:4,updatedAt:'t1'}));
 await assertFails(updateDoc(doc(phone,'products/dressA'),{price:0.01}));
});
test('admin custom claim can update product, create and delete product',async()=>{
 await assertSucceeds(updateDoc(doc(admin,'products/dressA'),{stock:4,updatedAt:'t1'}));
 await assertSucceeds(setDoc(doc(admin,'products/second'),{stock:2}));
 await assertSucceeds(deleteDoc(doc(admin,'products/second')));
});
test('mere matching email without admin claim does not get admin authority',async()=>{
 const impostor=env.authenticatedContext('impostor',{email:'example@example.com'}).firestore();
 await assertFails(updateDoc(doc(impostor,'products/dressA'),{stock:0,updatedAt:'t1'}));
});
test('anonymous cannot create fraudulent paid card order',async()=>{
 await assertFails(setDoc(doc(anon,'orders/KD-12345679'),{
  ...seedOrder,id:'KD-12345679',paymentStatus:'paid',customerUid:null
 }));
});
test('authenticated phone buyer cannot create forged card order',async()=>{
 await assertFails(setDoc(doc(phone,'orders/KD-12345679'),{
  ...seedOrder,id:'KD-12345679',paymentStatus:'paid'
 }));
});
test('anonymous cannot write even an otherwise valid COD order until server migration',async()=>{
 await assertFails(setDoc(doc(anon,'orders/KD-12345679'),{
  ...seedOrder,id:'KD-12345679',payment:'cod',paymentStatus:'unpaid'
 }));
});
test('client cannot mark an order paid or mutate items',async()=>{
 await assertFails(updateDoc(doc(phone,'orders/KD-12345678'),{paymentStatus:'paid',total:1,items:[]}));
 await assertFails(updateDoc(doc(anon,'orders/KD-12345678'),{paymentStatus:'paid'}));
});
test('browser admin claim cannot forge paid order, alter payment or delete an order',async()=>{
 await assertFails(setDoc(doc(admin,'orders/KD-12345679'),{
  ...seedOrder,id:'KD-12345679',customerUid:'customer2'
 }));
 await assertFails(updateDoc(doc(admin,'orders/KD-12345678'),{paymentStatus:'paid',total:1}));
 await assertFails(deleteDoc(doc(admin,'orders/KD-12345678')));
 await assertSucceeds(getDoc(doc(admin,'orders/KD-12345678')));
});
test('phone buyer may read own order but not another buyer order',async()=>{
 await assertSucceeds(getDoc(doc(phone,'orders/KD-12345678')));
 await assertFails(getDoc(doc(wrongPhone,'orders/KD-12345678')));
 await assertFails(getDoc(doc(anon,'orders/KD-12345678')));
});
test('phone buyer query scoped to own UID is allowed; unscoped query denied',async()=>{
 const q=query(collection(phone,'orders'),where('customerUid','==','customer1'));
 await assertSucceeds(getDocs(q));
 await assertFails(getDocs(collection(phone,'orders')));
});
test('order edit token and access token do not expose customer PII to anonymous users',async()=>{
 await assertFails(getDoc(doc(anon,'order_edits/secret-edit-token')));
 await assertFails(getDoc(doc(anon,'order_access/capability-secret')));
 await assertFails(getDocs(collection(anon,'order_edits')));
});
test('tracking by guessed order ID is denied, including logged-in non-owner',async()=>{
 await assertFails(getDoc(doc(anon,'tracking/KD-12345678')));
 await assertFails(getDoc(doc(wrongPhone,'tracking/KD-12345678')));
});
test('admin can inspect tracking and edit access documents',async()=>{
 await assertSucceeds(getDoc(doc(admin,'tracking/KD-12345678')));
 await assertSucceeds(getDoc(doc(admin,'order_edits/secret-edit-token')));
});
test('even authenticated browser admin cannot forge tracking or guest access capabilities',async()=>{
 await assertFails(updateDoc(doc(admin,'tracking/KD-12345678'),{status:'delivered'}));
 await assertFails(setDoc(doc(admin,'tracking/KD-99999999'),{id:'KD-99999999',status:'delivered'}));
 await assertFails(updateDoc(doc(admin,'order_edits/secret-edit-token'),{status:'cancelled'}));
 await assertFails(deleteDoc(doc(admin,'order_access/capability-secret')));
 await assertFails(setDoc(doc(admin,'order_access/fake'),{active:true}));
 await assertSucceeds(getDoc(doc(admin,'tracking/KD-12345678')));
 await assertSucceeds(getDoc(doc(admin,'order_edits/secret-edit-token')));
});
test('customer can view and update profile if phone matches verified claim',async()=>{
 await assertSucceeds(getDoc(doc(phone,'customers/customer1')));
 await assertSucceeds(updateDoc(doc(phone,'customers/customer1'),{
  name:'New Buyer',phone:'+971500001111',location:'Sharjah',updatedAt:'t1'
 }));
});
test('customer cannot update profile phone to unverified number',async()=>{
 await assertFails(updateDoc(doc(phone,'customers/customer1'),{phone:'+971588888888'}));
});
test('customer cannot inject privileged profile fields',async()=>{
 await assertFails(updateDoc(doc(phone,'customers/customer1'),{admin:true}));
});
test('another customer cannot view or edit phone account data',async()=>{
 await assertFails(getDoc(doc(wrongPhone,'customers/customer1')));
 await assertFails(updateDoc(doc(wrongPhone,'customers/customer1'),{name:'HACK'}));
});
test('newsletter guest create accepted but unauthenticated read/update blocked',async()=>{
 await assertSucceeds(setDoc(doc(anon,'newsletter_subscribers/example'),{
  email:'sandbox@example.com',createdAt:'t0',source:'website'
 }));
 await assertFails(getDoc(doc(anon,'newsletter_subscribers/example')));
 await assertFails(updateDoc(doc(anon,'newsletter_subscribers/example'),{createdAt:'t1'}));
});
test('newsletter record cannot inject extra key or source',async()=>{
 await assertFails(setDoc(doc(anon,'newsletter_subscribers/fake'),{
  email:'sandbox@example.com',createdAt:'t0',source:'website',paid:true
 }));
 await assertFails(setDoc(doc(anon,'newsletter_subscribers/fake2'),{
  email:'sandbox@example.com',createdAt:'t0',source:'attacker'
 }));
});
test('unknown collections are denied and settings public read but privileged write',async()=>{
 await assertFails(setDoc(doc(anon,'stripe_receipts/forged'),{paid:true}));
 await assertFails(setDoc(doc(anon,'settings/shop'),{price:0}));
 await assertSucceeds(setDoc(doc(admin,'settings/shop'),{delivery:25}));
 await assertSucceeds(getDoc(doc(anon,'settings/shop')));
});
test('client cannot edit tracking or customer-edit records even with known token',async()=>{
 await assertFails(updateDoc(doc(anon,'tracking/KD-12345678'),{status:'delivered'}));
 await assertFails(updateDoc(doc(anon,'order_edits/secret-edit-token'),{quantities:{dressA:0}}));
 await assertFails(updateDoc(doc(phone,'order_access/capability-secret'),{active:false}));
});
test('no browser including admin can grant server administrator membership',async()=>{
 for(const db of [anon,phone,admin])await assertFails(setDoc(doc(db,'admin_access/trustedAdmin'),{active:true,validAfter:0}));
});
test('browser cannot forge cancellation ledger or payment-intent mapping',async()=>{
 for(const db of [anon,phone,admin]){
  await assertFails(setDoc(doc(db,'order_lifecycle/KD-12345678'),{stockDebits:{dressA:99}}));
  await assertFails(setDoc(doc(db,'stripe_payment_intents/forged'),{orderId:'KD-12345678'}));
 }
});
test('refund/review queues and audit records are server-owned',async()=>{
 for(const name of ['stripe_refund_queue','stripe_review_queue','order_audit'])for(const db of [anon,phone,admin])await assertFails(setDoc(doc(db,name+'/forged'),{resolved:true}));
});
