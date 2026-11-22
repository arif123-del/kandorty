'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const admin=fs.readFileSync('admin.html','utf8');
const css=fs.readFileSync('admin-modern.css','utf8');
const start=admin.indexOf('async function koCopyCustomerPhone(phone){');
const end=admin.indexOf('(function initOrdersCustomerFolders(){',start);
assert.ok(start>=0&&end>start,'Phone copier must be callable');
const copyCode=admin.slice(start,end);

let copied='';
const sandbox={navigator:{clipboard:{writeText:async phone=>{copied=phone;}}},console};
vm.createContext(sandbox);
vm.runInContext(copyCode,sandbox);
(async()=>{
  assert.equal(await sandbox.koCopyCustomerPhone('+971554529099'),true);
  assert.equal(copied,'+971554529099');
  assert.equal(await sandbox.koCopyCustomerPhone('0554529099'),true);
  assert.equal(copied,'0554529099');
  assert.equal(await sandbox.koCopyCustomerPhone('javascript:evil'),false);
  assert.equal(await sandbox.koCopyCustomerPhone('tel:+971554529099'),false);
  assert.equal(await sandbox.koCopyCustomerPhone(''),false);
  for(const pattern of [
    'data-dial-customer-phone=','data-copy-customer-phone=',
    "params.get('source')==='android-admin'",
    "params.get('dialer')!=='1'",
    "if(!copy&&!legacy)return;",
    'href="tel:',"https://api.whatsapp.com/send?phone="
  ])assert.ok(admin.includes(pattern),'Missing legacy/new-app contact behavior '+pattern);
  assert.ok(css.includes('#adminOrdersTab .ko-contact-actions button'),'Copy button must be styled');
  assert.ok(admin.includes('admin-modern.css?v=20261123-contact-fallback'),'Updated style should not be stale');
  console.log('Customer copy fallback works; legacy Android and native dialer split validated.');
})().catch(e=>{console.error(e);process.exitCode=1;});
