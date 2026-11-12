import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {guardLegacyAdminReviewArtifact as guard} from './legacy-admin-candidate-guard.mjs';
const source=()=>fs.readFileSync('admin.html','utf8');
test('draft admin review disables legacy customer auto-cancellation and stock restock from client item quantities',()=>{
 const before=source(),after=guard(before);
 assert.match(before,/async function restoreCustomerCancelledStock\(order\)/);
 assert.doesNotMatch(after,/async function restoreCustomerCancelledStock\(order\)/);
 assert.doesNotMatch(after,/async function finalizeCustomerCancellation\(order\)/);
 assert.doesNotMatch(after,/forEach\(o=>finalizeCustomerCancellation\(o\)\)/);
 assert.doesNotMatch(after,/forEach\(o=>restoreCustomerCancelledStock\(o\)\)/);
 assert.ok(after.includes('DRAFT REVIEW: legacy auto-write deliberately disabled'));
 assert.ok(after.includes('function startAdminOrdersListener(){'));
 assert.ok(after.includes('alertNewCustomerCancellationRequests(docs);'));
 assert.ok(after.includes('renderOrders();'));
 assert.ok(after.includes('renderProfileOrders();'));
 assert.equal(source(),before,'public source is never edited');
});
test('draft admin review disables automatic legacy token and tracking backfills without disabling read-only order listings',()=>{
 const after=guard(source());
 assert.doesNotMatch(after,/ensureCustomerEditForOldOrders\(orders\)\.catch\(console\.warn\)/);
 assert.doesNotMatch(after,/syncOrdersToTracking\(orders\);/);
 assert.ok(after.includes("db.collection('orders').onSnapshot("));
 assert.ok(after.includes('hydrateAdminOrderDetails(orders)'));
});
test('guard fails closed when dangerous source anchor drifts or one callback is duplicated',()=>{
 const original=source();
 assert.throws(()=>guard(original.replace('async function finalizeCustomerCancellation(order){','async function changedFunction(order){')),/unsafe_legacy_admin_anchor_drift/);
 assert.throws(()=>guard(original.replace('function startAdminOrdersListener(){','function changedOrdersListener(){')),/unsafe_legacy_admin_anchor_drift/);
 assert.throws(()=>guard(original+"\n"+'syncOrdersToTracking(orders);'),/unsafe_legacy_admin_anchor_drift/);
});
test('guard does not accept empty, invalid or already transformed source',()=>{
 assert.throws(()=>guard(null),/admin_html_required/);
 assert.throws(()=>guard(''),/unsafe_legacy_admin_anchor_drift/);
 assert.throws(()=>guard(guard(source())),/unsafe_legacy_admin_anchor_drift/);
});


test('draft admin candidate cannot auto-write untrusted totalStock baselines merely on login',()=>{
 const before=source(),after=guard(before);
 assert.match(before,/async function ensureProductTotalStockBaselines\(\)/);
 assert.match(before,/ensureProductTotalStockBaselines\(\)\.catch\(\(\)=>\{\}\)/);
 assert.doesNotMatch(after,/async function ensureProductTotalStockBaselines\(\)/);
 assert.doesNotMatch(after,/ensureProductTotalStockBaselines\(\)\.catch\(\(\)=>\{\}\)/);
 assert.ok(after.includes('auto stock baseline migration disabled'));
 assert.ok(after.includes("$('productForm').onsubmit=async e=>{"));
 assert.ok(after.includes("db.collection('orders').onSnapshot("));
 assert.equal(source(),before,'no change to the original published admin HTML');
});

test('draft guard fails closed if any background stock migration call drifts',()=>{
 const original=source();
 assert.throws(()=>guard(original.replace(
  'ensureProductTotalStockBaselines().catch(()=>{});',
  'ensureProductTotalStockBaselines().catch(console.warn);'
 )),/unsafe_legacy_stock_baseline_anchor_drift/);
});
