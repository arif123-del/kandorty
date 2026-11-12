import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assessLegacyClientCutover} from './legacy-client-cutover-readiness.mjs';
const inputs=()=>({
 storefront:fs.readFileSync('index.html','utf8'),
 admin:fs.readFileSync('admin.html','utf8'),
 proposedRules:fs.readFileSync('stripe-live-candidate/firestore.rules','utf8')
});
test('actual published source has legacy direct checkout and auto-stock writes',()=>{
 const before=inputs(),r=assessLegacyClientCutover(before);
 assert.equal(r.checks.storefrontDirectOrderWrite,true);
 assert.equal(r.checks.storefrontDirectTrackingWrite,true);
 assert.equal(r.checks.adminDirectOrderBatch,true);
 assert.equal(r.checks.adminAutomaticStockBaseline,true);
 assert.equal(r.checks.adminLegacyClientRestock,true);
 assert.equal(r.checks.candidateRulesBlockBrowserOrderWrites,true);
 assert.equal(r.checks.candidateRulesBlockBrowserTrackingWrites,true);
 assert.equal(r.legacyDirectWritePathsPresent,true);
 assert.equal(r.candidateRulesWouldRejectLegacyClientWrites,true);
 assert.equal(r.allowProductionRulesPublication,false);
 assert.equal(r.allowStripeLive,false);
 assert.deepEqual(inputs(),before,'the published storefront/admin cannot be changed');
});
test('incomplete or missing source cannot be treated as cutover proof',()=>{
 for(const v of [undefined,'',null])assert.throws(()=>
  assessLegacyClientCutover({storefront:v,admin:'x',proposedRules:'x'}),
  /missing_source_for_cutover_audit/);
 const x=assessLegacyClientCutover({
  storefront:'some new candidate',admin:'clean',proposedRules:'allow read: if true;'});
 assert.equal(x.legacyDirectWritePathsPresent,false);
 assert.equal(x.allowProductionRulesPublication,false);
 assert.equal(x.installedAndroidClientsValidated,false);
});
test('a hypothetical candidate without browser write ban is never accepted',()=>{
 const src=inputs();
 const modified=assessLegacyClientCutover({...src,proposedRules:'rules_version=2;'});
 assert.equal(modified.legacyDirectWritePathsPresent,true);
 assert.equal(modified.candidateRulesWouldRejectLegacyClientWrites,false);
 assert.equal(modified.allowProductionRulesPublication,false);
});
test('no private customer data or document IDs are returned from static audit',()=>{
 const src=inputs();
 src.storefront+=' CUSTOMER_SECRET_FAKE_DONT_PRINT';
 const serialized=JSON.stringify(assessLegacyClientCutover(src));
 assert.ok(!serialized.includes('CUSTOMER_SECRET_FAKE_DONT_PRINT'));
 assert.ok(!serialized.includes('KD-000000'));
 assert.equal(serialized.includes('allowProductionRulesPublication'),true);
});
