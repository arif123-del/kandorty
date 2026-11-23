'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const admin=fs.readFileSync('admin.html','utf8');
const css=fs.readFileSync('admin-modern.css','utf8');

const start=admin.indexOf('function normalizeOrderPhone(value){');
const stop=admin.indexOf('function createOrderEditToken(){',start);
const contactStart=admin.indexOf('function koCustomerContactTargets(phone){');
const contactStop=admin.indexOf('function catalogOrderImage(id,code,index){',contactStart);
assert.ok(start>=0&&stop>start&&contactStart>=0&&contactStop>contactStart);
const sandbox={
  normalizeOrderShape:o=>({customer:o.customer||{}}),
  esc:x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')
};
vm.createContext(sandbox);
vm.runInContext(admin.slice(start,stop),sandbox);
vm.runInContext(admin.slice(contactStart,contactStop),sandbox);
const html=sandbox.renderOrderCustomerHtml({customer:{name:'Sami ullah',phone:'052 505 0475',city:'رأس الخيمة'}});
assert.ok(html.includes('href="tel:+971525050475"'), 'Phone must open the Android/Chrome dialer using tel:');
assert.ok(html.includes('href="https://api.whatsapp.com/send?phone=971525050475"'), 'WhatsApp must keep working');
assert.equal((html.match(/<a /g)||[]).length,2, 'Only Call and WhatsApp actions should appear');
assert.ok(!html.includes('نسخ الرقم'),'Copy number button must be absent');
assert.ok(!admin.includes('koCopyCustomerPhone('),'Remove obsolete clipboard code');
assert.ok(!admin.includes('data-copy-customer-phone'),'No clipboard action must be installed');
assert.ok(!admin.includes('data-dial-customer-phone'),'Phone URI should not be hijacked');
assert.ok(!admin.includes("params.get('dialer')!=='1'"),'Old Android fallback must not intercept call');
assert.ok(admin.includes('admin-modern.css?v=20261123-dialer'),'Stylesheet cache must refresh');
assert.ok(css.includes('grid-template-columns:repeat(2,minmax(0,1fr))'),'Only two contact buttons in layout');
assert.ok(!css.includes('.ko-copy-contact'),'Do not retain copy button styling');
console.log('Customer Call / WhatsApp buttons and direct dial URI: passed.');
