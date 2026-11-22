'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const admin=fs.readFileSync('admin.html','utf8');
const css=fs.readFileSync('admin-modern.css','utf8');

for(const id of ['adminOrdersTab','ordersDashboardOverview','ordersFoldersView',
 'ordersList','ordersCustomerFileView','ordersCustomerContents','adminOrderSearch',
 'adminCancellationRequests','koStatAll','koStatNew','koStatPreparing',
 'koStatShipping','koResultCount','adminPrimaryNav']){
 const count=(admin.match(new RegExp('id="'+id+'"','g'))||[]).length;
 assert.equal(count,1,id+' must occur exactly once');
}
for(const feature of ['function koSetOrderFilter(next)','function koOrderStatus(o)',
 'function renderOrders()','function renderOpenedOrdersCustomer()',
 'function orderCustomerHistoryCard(raw)','function orderCustomerFolderCard(g,matched)',
 'function backToOrderFolders()','function updateOrderStatus(id,status)',
 'renderOrderItemsHtml(o)','ordersCustomerFileView','data-order-status-id=',
 'onclick="koSetOrderFilter(\'cancelled\')"',
 'https://wa.me/','href="tel:',"showAdminTab('orders',$('ordersTabBtn'))"]){
 assert.ok(admin.includes(feature),'missing admin dashboard feature: '+feature);
}
assert.ok(admin.includes('if(node.value===\'cancelled\'&&!confirm('),'Cancellation must need confirmation');
assert.ok(admin.includes("adminOrderClient({getIdToken:force=>auth.currentUser.getIdToken(force)}).change(id,status)"),
 'Keep server-authorized status writes');
assert.ok(!admin.includes('await db.collection(\'orders\').doc(id).update({status'),
 'Do not introduce client-side status bypasses');
assert.ok(admin.includes('savedData.images.every('),'Keep product photo verification');
assert.ok(admin.includes('pendingImageFiles.push(file)'),'Keep image picker support');
assert.ok(admin.includes('koOrderFilter=next'),'Filter must update actual state');

for(const rule of ['.ko-stat-grid','.ko-primary-nav','.ko-tools','.ko-filter-row',
 '.customer-folder-card','.customer-file-order','.ko-payment-grid',
 '.ko-contact-actions','@media(max-width:620px)']){
 assert.ok(css.includes(rule),'missing responsive style '+rule);
}
// Verify status logic, including customer-initiated cancellation, in isolation.
const start=admin.indexOf('function koOrderStatus(o){');
const end=admin.indexOf('function koAdminDate(raw){',start);
assert.ok(start>=0&&end>start);
const env={isCancelledOrder:o=>o?.status==='cancelled'||!!o?.customerEdit?.cancelRequestedAt};
vm.createContext(env);vm.runInContext(admin.slice(start,end),env);
for(const key of ['new','preparing','shipping','delivered','cancelled']){
 assert.equal(env.koOrderStatus({status:key}),key);
}
assert.equal(env.koOrderStatus({status:'new',customerEdit:{cancelRequestedAt:'now'}}),'cancelled');
assert.equal(env.koOrderStatus({status:'unknown'}),'new');
console.log('Kandorty admin dashboard IDs, features, responsive styles and status safety: passed.');
