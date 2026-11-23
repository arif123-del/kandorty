const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
const contract = JSON.parse(source('shared/mobile-app-contract.json'));
const ios = source('ios/KandortyIOS/Kandorty/StorefrontView.swift');
const android = source('android/CustomerApp/app/src/main/java/online/kandorty/store/MainActivity.java');

test('both production customer shells use the canonical Kandorty storefront', () => {
  assert.equal(contract.publicStorefront, 'https://kandorty.online/');
  assert.ok(ios.includes('URL(string: "' + contract.publicStorefront + '")!'));
  assert.ok(android.includes('STOREFRONT_URL = "' + contract.publicStorefront + '"'));
});

test('customer shells never point at staging or the admin panel', () => {
  for (const [name, code] of [['iOS', ios], ['Android', android]]) {
    assert.doesNotMatch(code, /release-test|stripe-test|\.workers\.dev|admin\.html|localhost|127\.0\.0\.1/i, name);
  }
  assert.equal(contract.adminSeparated, true);
});

test('shared feature contract covers essential storefront flows', () => {
  for (const feature of ['catalog', 'pricing', 'discounts', 'cart', 'orders', 'tracking', 'checkout']) {
    assert.ok(contract.sharedFeatures.includes(feature), feature);
  }
});

console.log('Kandorty: both customer shells target the same hosted storefront; native behavior still needs device QA.');
