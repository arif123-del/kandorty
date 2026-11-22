'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const admin=fs.readFileSync('admin.html','utf8');
function section(start,end){
 const i=admin.indexOf(start),j=admin.indexOf(end,i+start.length);
 assert.ok(i>=0&&j>i,'Missing source section: '+start);
 return admin.slice(i,j);
}

const htmlSearch={value:''};
const elements={
  adminOrderSearch:htmlSearch,
  ordersCustomerFileView:{classList:{add(){},remove(){},contains(){return true;}}},
  ordersCustomerContents:{innerHTML:''},
  adminOrdersTab:{classList:{add(){},remove(){}}},
  ordersFoldersView:{classList:{add(){},remove(){}}},
  ordersCustomerHeading:{textContent:''}
};
const context={
  console,
  isCancelledOrder:o=>o.status==='cancelled',
  effectiveOrderView:o=>o,
  normalizeOrderShape:o=>({customer:o.customer||{}}),
  esc:x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
  statusText:s=>({new:'طلب جديد',preparing:'قيد التجهيز',shipping:'قيد التوصيل',delivered:'تم التسليم',cancelled:'ملغي'})[s]||s,
  koAdminDate:()=> '2026/11/23',
  money:()=> '30 AED',
  renderOrderCustomerHtml:()=>'<div>Customer</div>',
  orderCustomerHistoryCard:o=>'<article data-test-order="'+o.id+'"></article>',
  ordersAdminScroll:()=>null,
  returnToOrdersList:()=>{throw Error('Unexpected folder exit')},
  $:id=>elements[id]||null
};
vm.createContext(context);
vm.runInContext(section('function normalizeOrderPhone(value){','function createOrderEditToken(){'),context);
vm.runInContext(section('function koCustomerContactTargets(phone){','function catalogOrderImage(id,code,index){'),context);
vm.runInContext(section('function koOrderStatus(o){','function koAdminDate(raw){'),context);
vm.runInContext("let koOrderFilter='all'; const KO_ORDER_FILTERS=['all','new','preparing','shipping','delivered','cancelled'];",context);
vm.runInContext(section('const KO_ORDER_FILTER_LABELS=','function orderCustomerHistoryCard(raw){'),context);
vm.runInContext(section('function renderOpenedOrdersCustomer(){','function renderOrders(){'),context);

const phone='0554529099';
for(const raw of [phone,'554529099','971554529099','00971554529099','+971 55 452 9099']){
 const target=context.koCustomerContactTargets(raw);
 assert.equal(target.tel,'+971554529099','dialer target should be UAE international');
 assert.equal(target.whatsapp,'971554529099','WhatsApp target should be digits without plus');
}
const customerMarkup=context.renderOrderCustomerHtml({customer:{name:'Faiz',phone,city:'أبوظبي'}});
assert.ok(customerMarkup.includes('href="tel:+971554529099"'));
assert.ok(customerMarkup.includes('https://api.whatsapp.com/send?phone=971554529099'));
assert.ok(!customerMarkup.includes('target="_blank"'),'WhatsApp must not open blocked WebView popups');

const statuses=['new','preparing','shipping','delivered','cancelled'];
const records=statuses.map((status,i)=>({
 id:'KD-'+String(70000001+i),status,createdAt:'2026-11-2'+i+'T12:00:00Z',
 customer:{name:'Faiz',phone},items:[]
}));
const group={key:'phone:0554529099',name:'Faiz',phone,city:'أبوظبي',history:records,
 location:'tibh',registered:false};
context.fixture=group;
vm.runInContext('var selectedOrdersCustomer=fixture.key; var orderCustomerGroups=new Map([[fixture.key,fixture]]);',context);
for(let i=0;i<statuses.length;i++){
 const state=statuses[i];
 vm.runInContext('koOrderFilter='+JSON.stringify(state),context);
 const actual=Array.from(context.koMatchingOrders(group),o=>o.id);
 assert.deepEqual(actual,[records[i].id],state+' filter must contain only matching orders');
 const card=context.orderCustomerFolderCard(group);
 assert.ok(card.includes('data-status="'+state+'"'),state+' folder badge must match filter');
 assert.ok(card.includes(records[i].id),state+' folder should highlight matching code');
 for(let j=0;j<statuses.length;j++)if(i!==j)
   assert.ok(!card.includes(records[j].id),'Other statuses should not leak into '+state+' folder summary');
 context.renderOpenedOrdersCustomer();
 const detail=elements.ordersCustomerContents.innerHTML;
 assert.ok(detail.includes('data-test-order="'+records[i].id+'"'),state+' order must be visible in file');
 for(let j=0;j<statuses.length;j++)if(i!==j)
   assert.ok(!detail.includes('data-test-order="'+records[j].id+'"'), 'Other status shown in '+state+' customer file');
}
// Older and imported orders with missing/unknown states must never be shown
// as "جديد". They stay under "الكل" and "تحتاج مراجعة" instead.
const ambiguous=[
  {id:'KD-80000001',createdAt:'2026-11-01T10:00:00Z',customer:{name:'Faiz',phone}},
  {id:'KD-80000002',status:'pending',createdAt:'2026-11-02T10:00:00Z',customer:{name:'Faiz',phone}},
  {id:'KD-80000003',status:'',createdAt:'2026-11-03T10:00:00Z',customer:{name:'Faiz',phone}}
];
for(const order of ambiguous)group.history.push(order);
vm.runInContext("koOrderFilter='new'",context);
assert.deepEqual(Array.from(context.koMatchingOrders(group),o=>o.id),[records[0].id],
 'New filter must include ONLY explicit new orders');
assert.equal(context.koOrderStatus({status:' NEW '}),'new','Normalized explicit new is valid');
for(const order of ambiguous)assert.equal(context.koOrderStatus(order),'unclassified',
 'Missing/unknown status must not be fabricated as new');
vm.runInContext("koOrderFilter='unclassified'",context);
assert.deepEqual(Array.from(context.koMatchingOrders(group),o=>o.id),ambiguous.map(o=>o.id),
 'Review must collect unclassified orders without changing the saved data');
context.renderOpenedOrdersCustomer();
for(const order of ambiguous)assert.ok(elements.ordersCustomerContents.innerHTML.includes(order.id),
 'Review customer file must retain ambiguous order '+order.id);
assert.ok(admin.includes('value="unclassified"')||admin.includes("'unclassified','new','preparing'"),
 'Unknown orders should be explicitly selectable/reviewable');
vm.runInContext("koOrderFilter='all'",context);
assert.equal(context.koMatchingOrders(group).length,8,'All filter should show full customer history');
htmlSearch.value=records[2].id;
assert.deepEqual(Array.from(context.koMatchingOrders(group),o=>o.id),[records[2].id],'Search should match one order ID');
htmlSearch.value='Faiz';
assert.equal(context.koMatchingOrders(group).length,8,'Customer name search should show customer orders, including review items');

assert.ok(admin.includes("visible.map(({group,matching})=>orderCustomerFolderCard(group,matching))"),'List must render filtered order set');
assert.ok(admin.includes("matching.map(orderCustomerHistoryCard)"),'Customer file must render filtered orders');
assert.ok(admin.includes("KO_ORDER_FILTER_LABELS[koOrderFilter]"),'Folder detail should identify selected section');
assert.ok(admin.includes("adminOrderClient({getIdToken:force=>auth.currentUser.getIdToken(force)}).change(id,status)"),'Status changes must use secure Worker');
console.log('Contact links, UAE phone normalization, filtered folder badges and customer orders: passed.');
