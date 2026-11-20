'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

function checkInlineScripts(file) {
  const html = fs.readFileSync(file,'utf8');
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let count = 0;
  for (const match of html.matchAll(pattern)) {
    const attrs = match[1];
    const code = match[2];
    if (/\bsrc\s*=/.test(attrs)) continue;
    const kind = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1] || 'text/javascript';
    if (kind !== 'text/javascript' && kind !== 'module' && kind !== 'application/javascript') continue;
    if (!code.trim()) continue;
    const args = ['--check'];
    if (kind === 'module') args.push('--input-type=module');
    const parsed = spawnSync(process.execPath,args,{input:code,encoding:'utf8'});
    assert.equal(parsed.status,0,`Invalid script in ${file}, block ${count + 1}:\n${parsed.stderr}`);
    count++;
  }
  assert.ok(count>0,file + ' should have inline JavaScript');
  console.log(file + ': ' + count + ' inline script blocks parsed');
  return html;
}
const admin = checkInlineScripts('admin.html');
const store = checkInlineScripts('index.html');

for (const snippet of [
  'id="adminDiscountsTab"', "showAdminTab('discounts',this)",
  'id="adminDiscountsList"', 'function renderDiscountList()',
  'class="photo-qty-input"', 'imageStocks,',
  'pendingPhotoQuantities', 'const perImageTotal'
]) {
  assert.ok(admin.includes(snippet),'admin missing '+snippet);
}
// The public storefront's payment/stock pathway is intentionally unchanged
// until the Stripe/COD Workers support transactional per-image decrements.
assert.ok(store.includes('function kandortyIsDiscountProduct('));
assert.ok(store.includes('kandortyDiscountFab'));
assert.ok(admin.includes('id="adminProductQuickAccess"'));
assert.ok(admin.includes('الكمي' + 'ة لكل صورة'));
assert.ok(admin.includes('photo-qty-input'));
console.log('Discount and per-image quantity UI smoke checks passed.');
