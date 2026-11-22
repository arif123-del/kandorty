'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const store=fs.readFileSync('index.html','utf8');
const admin=fs.readFileSync('admin.html','utf8');
function extract(src,start,end){
 const a=src.indexOf(start),b=src.indexOf(end,a);
 assert.ok(a>=0 && b>a,'Missing function under test: '+start);
 return src.slice(a,b);
}
// Execute the actual cart mapping functions, rather than a replica.
const cartSource=extract(store,'function cartVariantIndex(item){','function productQtyInCart(productId){');
const sandbox={products:[{id:'dress',images:['red','blue','green'],imageStocks:[3,3,3],stock:9}]};
vm.createContext(sandbox);
vm.runInContext(cartSource,sandbox);
const oldCartItem={id:'dress',imageIndex:0,imageUrl:'blue',variantKey:'dress__img0'};
assert.equal(sandbox.cartVariantIndex(oldCartItem),1,'photo, not stale index, owns inventory');
assert.equal(sandbox.cartVariantKey(oldCartItem),'dress__img1','checkout uses current image index');
sandbox.products[0].images=['green','red','blue'];
assert.equal(sandbox.cartVariantIndex(oldCartItem),2,'reordering must not switch colors');
sandbox.products[0].images=['green','red'];
assert.equal(sandbox.cartVariantIndex(oldCartItem),-1,'removed color must not select a different one');
sandbox.products[0].images=['red','blue','green'];
assert.equal(sandbox.cartVariantIndex({id:'dress',imageIndex:1}),1,'legacy item stays compatible');
assert.equal(sandbox.cartVariantIndex({id:'dress',imageIndex:5}),-1,'invalid legacy index fails closed');
assert.ok(store.includes('if(d>0 && idx<0)'), 'increasing a removed color must be blocked');
assert.ok(store.includes('groupedByColor.get(String(row.item.id)'), 'checkout must validate per-color totals');

const phoneSource=extract(admin,'function normalizeOrderPhone(value){','function createOrderEditToken(){');
const phones={};
vm.createContext(phones);
vm.runInContext(phoneSource,phones);
const expected='0501234567';
for(const input of ['0501234567','501234567','+971 50 123 4567','00971 50 123 4567']){
 assert.equal(phones.normalizeOrderPhone(input),expected,'same customer should not get duplicate UAE folders');
}
assert.notEqual(phones.normalizeOrderPhone('0501234568'),expected,'different numbers must remain separate');
assert.ok(admin.includes('images.slice(0,8).map((src,index)=>'), 'list should expose all eight photos');
assert.ok(!admin.includes("images.slice(0,3).map((src,index)=>"), 'three-image cap must be removed');
assert.ok(admin.includes('pendingImageFiles.push(file)'), 'new gallery selections must be retained');
assert.ok(admin.includes('savedData.images.every('), 'uploaded images must be server-verified');
assert.ok(!admin.includes("'🔔 تفعيل إشعارات الطلبات في الخلفية'"), 'bell must not return on status button');
console.log('Color cart mapping, customer folder normalization and admin photo visibility passed.');
