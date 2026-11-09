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
