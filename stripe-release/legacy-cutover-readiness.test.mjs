import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {legacyCutoverReadiness,LEGACY_CLIENT_GATES} from './legacy-cutover-readiness.mjs';
const input=()=>({
 storefront:fs.readFileSync('index.html','utf8'),
 admin:fs.readFileSync('admin.html','utf8'),
 rules:fs.readFileSync('stripe-live-candidate/firestore.rules','utf8')
});
test('actual old storefront/admin and proposed rules are a documented NO-GO, never auto-certified',()=>{
 const v=legacyCutoverReadiness(input());
 assert.equal(v.currentLegacyReadiness,'NO_GO');
 assert.equal(v.deployAuthorized,false);
 assert.equal(v.requiresIndependentOwnerApproval,true);
 assert.deepEqual(v.acceptanceStillNeeded,LEGACY_CLIENT_GATES);
 for(const mustFind of [
   'browserCheckoutWrites',
   'browserCustomerCancellationWrites',
   'adminStatusWrites',
   'adminCustomerCancellationWrites',
   'adminRestocksFromLegacyQuantities',
   'candidateDeniesLegacyOrderTrackingWrites'
 ])assert.ok(v.codeRiskIndicators.includes(mustFind),`Risk indicator missing: ${mustFind}`);
});
test('caller-supplied claimed acceptance does not authorize production or bypass owner approval',()=>{
 const claimed=Object.fromEntries(LEGACY_CLIENT_GATES.map(x=>[x,true]));
 const v=legacyCutoverReadiness({...input(),acceptance:claimed});
 assert.deepEqual(v.acceptanceStillNeeded,[]);
 assert.equal(v.deployAuthorized,false);
 assert.equal(v.currentLegacyReadiness,'NO_GO');
});
test('missing code inputs fail instead of being interpreted as compatible',()=>{
 for(const patch of [{storefront:null},{admin:null},{rules:null}])
  assert.throws(()=>legacyCutoverReadiness({...input(),...patch}),/source_text_required/);
});
test('removing an apparent code risk from a fixture cannot grant deploy permission',()=>{
 const v=legacyCutoverReadiness({storefront:'',admin:'',rules:'',acceptance:{}});
 assert.deepEqual(v.codeRiskIndicators,[]);
 assert.equal(v.deployAuthorized,false);
 assert.equal(v.currentLegacyReadiness,'NO_GO');
});
test('report never includes any order identifier, customer data or credential material',()=>{
 const s=input();
 s.storefront+="\n/* never-print-order-KD-99999999 customer-secret@example.invalid */";
 const result=legacyCutoverReadiness(s);
 const serial=JSON.stringify(result);
 for(const forbidden of ['never-print-order-KD-99999999','customer-secret@example.invalid','sk_live_','whsec_'])
  assert.ok(!serial.includes(forbidden));
});
