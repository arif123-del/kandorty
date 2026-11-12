import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import vm from 'node:vm';

const checksum=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');

test('unpublished Stage5 web/admin review routes NEW COD+card through server, never edits published source',()=>{
 const before={web:checksum('index.html'),admin:checksum('admin.html')};
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kandorty-stage5-review-'));
 try{
  const run=spawnSync(process.execPath,['stripe-release/build-storefront-candidate.mjs'],{
   cwd:process.cwd(),env:{...process.env,STRIPE_CANDIDATE_DIR:dir},
   encoding:'utf8',timeout:25000,maxBuffer:1024*1024});
  assert.equal(run.status,0,'unpublished review build must pass');
  const web=fs.readFileSync(path.join(dir,'index.html'),'utf8');
  const admin=fs.readFileSync(path.join(dir,'admin.html'),'utf8');

  // Compile ALL executable inline scripts in both generated pages. Prior
  // regression used a literal backslash-n in the guard, swallowing the
  // product editor's onsubmit handler inside a one-line JS comment. Simple
  // text-presence assertions missed it; vm.Script syntax checks alone also
  // miss comment-swallowed code, so assert onsubmit starts on a live line.
  for (const [name,markup,minScripts] of [['web',web,15],['admin',admin,2]]) {
    let checked=0;
    for (const m of markup.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
      const attrs=m[1],code=m[2];
      if (/\bsrc\s*=|\btype\s*=\s*['"](?:application\/json|module)/i.test(attrs)||!code.trim())continue;
      assert.doesNotThrow(()=>new vm.Script(code,{filename:name+'-inline-'+checked+'.js'}));
      checked++;
    }
    assert.ok(checked>=minScripts,name+' expected executable inline scripts missing');
  }
  assert.ok(admin.includes("// DRAFT REVIEW ONLY: do not infer historical totalStock from client state.\n$('productForm').onsubmit=async e=>{"),
    'admin product form onsubmit MUST start on its own line after safety comment');

  // Limit assertions to the active checkout entrypoint; the legacy helper
  // functions remain available as a distinct historical-client cutover gate.
  const start=web.indexOf('async function submitCheckoutOrder(){');
  const end=web.indexOf('  }catch(error){',start);
  assert.ok(start>0&&end>start,'checkout source anchors present');
  const flow=web.slice(start,end);
  assert.match(flow,/secureStripeFlow\(\)\)\.start\(order\)/);
  assert.match(flow,/secureStripeFlow\(\)\)\.startCod\(order\)/);
  assert.doesNotMatch(flow,/submitCustomerOrder\s*\(/);
  assert.doesNotMatch(flow,/saveOrderWithStock\s*\(/);
  assert.doesNotMatch(flow,/db\.collection\s*\(\s*['"]orders['"]\s*\)/);

  // Server-authorized new receipts can cancel; a historical/unknown order
  // must not fall through to legacy browser Firestore cancellation and restock.
  const cancelStart=web.indexOf('async function cancelOrderFromMyOrders(orderId,button){');
  assert.ok(cancelStart>0,'customer cancellation handler exists');
  const cancelGateStart=web.indexOf('  // Historical/unknown client orders have NO verified server manage receipt.',cancelStart);
  const cancelGateEnd=web.indexOf('  return;',cancelGateStart)+ '  return;'.length;
  assert.ok(cancelGateStart>cancelStart&&cancelGateEnd>cancelGateStart);
  const guardedCancel=web.slice(cancelStart,cancelGateEnd);
  assert.ok(guardedCancel.includes('if(secure.ownsReceipt(orderId))'));
  assert.ok(guardedCancel.includes('await secure.cancel(orderId)'));
  assert.match(guardedCancel,/Legacy order cannot be cancelled here/);
  assert.ok(!['db.collection','runTransaction','batch.commit','restoreCustomerCancelledStock'].some(x=>guardedCancel.includes(x)));

  // The new My Orders refresh must use its private server-issued receipt
  // rather than reading legacy Firestore tracking directly under strict Rules.
  const refreshStart=web.indexOf('async function refreshCustomerOwnOrderStatuses(){');
  const refreshEnd=web.indexOf('async function refreshMyOrders(){',refreshStart);
  assert.ok(refreshStart>0&&refreshEnd>refreshStart,'My Orders refresh handler missing');
  const refresh=web.slice(refreshStart,refreshEnd);
  assert.ok(refresh.includes('secure.ownsReceipt(String(o.id))'));
  assert.ok(refresh.includes('await secure.track(String(o.id))'));
  assert.doesNotMatch(refresh,/db\.collection|runTransaction|db\.batch/);
  assert.ok(refresh.includes('saveCustomerOwnOrders(refreshed)'));

  const adminStart=admin.indexOf('async function updateOrderStatus(id,status){');
  const adminEnd=admin.indexOf('const SETTINGS_KEY=',adminStart);
  assert.ok(adminStart>0&&adminEnd>adminStart);
  const statusFlow=admin.slice(adminStart,adminEnd);
  assert.match(statusFlow,/adminOrderClient/);
  assert.doesNotMatch(statusFlow,/db\.runTransaction/);

  // Old auto-cancellation/restock and guessed historical baseline removed
  // only in this review copy; original live admin source is unchanged.
  assert.doesNotMatch(admin,/async function ensureProductTotalStockBaselines\(\)/);
  assert.doesNotMatch(admin,/async function restoreCustomerCancelledStock\(order\)/);
  assert.doesNotMatch(admin,/async function finalizeCustomerCancellation\(order\)/);
  assert.doesNotMatch(admin,/ensureProductTotalStockBaselines\(\)\.catch/);

  assert.deepEqual({web:checksum('index.html'),admin:checksum('admin.html')},before,
   'no writes to published site/admin source');
  assert.notEqual(checksum(path.join(dir,'index.html')),before.web);
  assert.notEqual(checksum(path.join(dir,'admin.html')),before.admin);
 }finally{
  fs.rmSync(dir,{recursive:true,force:true});
 }
});

test('no old Android acceptance may be inferred from a new webview review build',()=>{
 const docs=fs.readFileSync('stripe-release/ANDROID-APP-COMPATIBILITY.md','utf8');
 assert.ok(docs.includes('2.3.3'));
 assert.match(docs,/not complete payment\/order compatibility acceptance/i);
 const rules=fs.readFileSync('stripe-live-candidate/firestore.rules','utf8');
 assert.match(rules,/match \/orders\/\{orderId\}/);
 assert.match(rules,/allow create, update, delete: if false;/);
 // A passing browser build does NOT certify already-installed native apps.
 assert.equal(false,Boolean(process.env.STAGE5_INSTALLED_ANDROID_CONFIRMED));
});
