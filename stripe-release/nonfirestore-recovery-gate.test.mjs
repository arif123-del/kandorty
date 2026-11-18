import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessNonFirestoreRecovery as assess} from './nonfirestore-recovery-gate.mjs';
test('metadata read alone never proves production recovery even when all sources readable',()=>{
 const x=assess({auth:true,storage:true,rules:true});
 assert.equal(x.authReadAccess,'CONFIRMED');
 assert.equal(x.storageReadAccess,'CONFIRMED');
 assert.equal(x.rulesReadAccess,'CONFIRMED');
 for(const key of ['authUsersExportedAndRestored','storageObjectsExportedAndRestored',
 'publishedRulesExportedAndRestored','managedPointInTimeRestoreVerified','stage4ProductionReleaseAuthorized'])
   assert.equal(x[key],false,key);
});
test('all denied read permissions fail closed rather than make completeness claims',()=>{
 const x=assess({auth:'DENIED',storage:'DENIED',rules:'DENIED'});
 for(const k of ['authReadAccess','storageReadAccess','rulesReadAccess'])
  assert.equal(x[k],'UNVERIFIED');
 assert.equal(x.stage4ProductionReleaseAuthorized,false);
});
test('empty-or-unknown status does not imply prior backups',()=>{
 const x=assess({auth:false,storage:'UNAVAILABLE',rules:false});
 assert.equal(x.authReadAccess,'EMPTY_OR_NOT_CONFIGURED');
 assert.equal(x.storageReadAccess,'UNVERIFIED');
 assert.equal(x.rulesReadAccess,'NO_RELEASES');
 assert.equal(x.publishedRulesExportedAndRestored,false);
});
test('invalid probe result rejects optimistic statuses',()=>{
 for(const v of [null,undefined,1,'COMPLETE','YES',{}])
  assert.throws(()=>assess({auth:v,storage:true,rules:true}),/invalid_recovery_probe_result/);
});
