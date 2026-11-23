'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const admin=fs.readFileSync('admin.html','utf8');
const store=fs.readFileSync('index.html','utf8');

function extract(text,start,end){
  const i=text.indexOf(start),j=text.indexOf(end,i+start.length);
  assert.ok(i>=0&&j>i,'Missing source '+start);
  return text.slice(i,j);
}
assert.ok(admin.includes('id="kdRestockDialog"'), 'Out-of-stock items need a schedule dialog');
assert.ok(admin.includes('id="kdRestockScheduleDays" type="number" min="3" max="3650"'));
assert.ok(admin.includes('id="restockDays" type="number" min="3" max="3650"'));
assert.ok(admin.includes('restockAdminAction(p)'), 'Stock-0 products should have a schedule button');
assert.ok(admin.includes('await db.runTransaction(async transaction=>'), 'Restock updates must be transactional');
assert.ok(admin.includes('transaction.update(reference,{restockAt:dateString,updatedAt:now})'),
 'Schedule changes must not overwrite live stock, images, or color quantities');
assert.ok(admin.includes("const restockAt=cleanedStock>0"), 'Actual stock restoration clears schedule');
assert.ok(admin.includes("restockDays<3||restockDays>3650"),'Only 3 or more days are valid');

const target=new Date('2026-11-26T12:00:00Z').toISOString();
const attrs={restockAt:target};
const elements={kdRestockDialogStatus:{textContent:''},kdRestockScheduleDays:{value:'3'},
 kdRestockSaveBtn:{disabled:false},kdRestockRemoveBtn:{disabled:false}};
const product={id:'product-1',stock:0,images:['blue','pink'],
 imageStocks:[0,0],totalStock:24,price:35,nameAr:'مخوار'};
const data={...product,...attrs};
let savedPatch=null;
const documentMock={
 getElementById:id=>elements[id]||null,
 querySelectorAll:()=>[]
};
let galleryRenderCount=0;
const scope={
  document:documentMock,products:[product],Date,console,confirm:()=>true,
  auth:{currentUser:{uid:'test-admin'}},
  db:{
    collection(collection){
      assert.equal(collection,'products');
      return{doc(id){
        assert.equal(id,product.id);
        return{get:async()=>({exists:true,data:()=>({...data})})};
      }};
    },
    async runTransaction(executor){
      return executor({
        get:async()=>({exists:true,data:()=>({...data})}),
        update(ref,patch){savedPatch=patch;Object.assign(data,patch);}
      });
    }
  },
  getProductStock:p=>Number(p.stock),
  $:id=>elements[id]||null,
  writeFastProductCache:()=>{},renderAdminList:()=>{galleryRenderCount++;},
  render:()=>{},kdUpdateRestockCountdowns:()=>{}
};
vm.createContext(scope);
vm.runInContext('var kdRestockProductId="product-1";',scope);
vm.runInContext(extract(admin,'function restockAdminDate(iso){','function renderAdminList(){'),scope);
(async()=>{
  await scope.updateRestockSchedule(target);
  assert.equal(savedPatch.restockAt,target,'Admin date must persist');
  assert.equal(Object.keys(savedPatch).length,2,'Schedule may update only date and update timestamp');
  assert.deepEqual(data.imageStocks,[0,0],'Per-color inventory must remain unchanged');
  assert.equal(data.stock,0,'Schedule must not invent inventory');
  assert.equal(galleryRenderCount,1);
  await scope.updateRestockSchedule(null);
  assert.equal(data.restockAt,null,'Cancellation should clear the schedule');
  scope.products[0]={...product,stock:2};
  data.stock=2;
  await assert.rejects(scope.updateRestockSchedule(target),/المنتج لم يعد نافداً/);
  assert.equal(data.stock,2,'Existing inventory remains unchanged');

  // Live public countdown must show DD:HH:MM:SS, decreasing by seconds.
  const box={dataset:{restockAt:target},
    span:null,strong:null,
    querySelector(selector){return selector==='span'?this.span:this.strong;}};
  box.span={textContent:''};box.strong={textContent:''};
  const clock=Date.parse(target)-3*86400000;
  let now=clock;
  const TestDate=class extends Date{static now(){return now;}};
  const storefront={
    document:{querySelectorAll:()=>[box]},Date:TestDate,
    setInterval:()=>{},lang:'ar',
    isSoldOut:p=>p.stock===0
  };
  vm.createContext(storefront);
  vm.runInContext(extract(store,'function kdRestockHtml(p){','function renderProductCard(p){'),storefront);
  assert.ok(storefront.kdRestockHtml({...product,restockAt:target}).includes('kd-restock-countdown'));
  storefront.kdUpdateRestockCountdowns();
  assert.equal(box.strong.textContent,'03:00:00:00');
  now+=1000;storefront.kdUpdateRestockCountdowns();
  assert.equal(box.strong.textContent,'02:23:59:59');
  now=Date.parse(target);
  storefront.kdUpdateRestockCountdowns();
  assert.equal(box.strong.textContent,'00:00:00:00');
  assert.ok(box.span.textContent.includes('بانتظار تحديث المخزون'), 'Do not advertise fake stock on expiry');
  assert.equal(storefront.kdRestockHtml({...product,stock:1,restockAt:target}),'',
    'Countdown disappears once actual stock is restored');
  console.log('Restock schedule security, 3-day countdown and zero-stock expiration passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
