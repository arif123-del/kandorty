import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const digest=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
test('unpublished storefront/admin build preserves source and removes unsafe legacy admin auto-writes',()=>{
 const dir=mkdtempSync(join(tmpdir(),'kandorty-unpublished-review-'));
 const before=[digest('index.html'),digest('admin.html')];
 try{
  const run=spawnSync(process.execPath,['stripe-release/build-storefront-candidate.mjs'],{
   env:{...process.env,STRIPE_CANDIDATE_DIR:dir},encoding:'utf8',timeout:45000,
   maxBuffer:2*1024*1024
  });
  assert.equal(run.status,0,'review build failed: '+(run.stderr||'').slice(0,300));
  assert.ok(existsSync(join(dir,'index.html')));
  assert.ok(existsSync(join(dir,'admin.html')));
  const admin=readFileSync(join(dir,'admin.html'),'utf8');
  const shop=readFileSync(join(dir,'index.html'),'utf8');
  for(const forbidden of [
   'async function finalizeCustomerCancellation(order){',
   'async function restoreCustomerCancelledStock(order){',
   'forEach(o=>finalizeCustomerCancellation(o))',
   'forEach(o=>restoreCustomerCancelledStock(o))',
   'ensureCustomerEditForOldOrders(orders).catch(console.warn)',
   'syncOrdersToTracking(orders);'
  ])assert.ok(!admin.includes(forbidden),'unsafe admin auto-write survived: '+forbidden);
  assert.match(admin,/adminOrderClient/);
  assert.match(shop,/startCod\(order\)/);
  assert.match(shop,/secureStripeFlow/);
  assert.deepEqual([digest('index.html'),digest('admin.html')],before,'public source files changed');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
