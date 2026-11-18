import {test} from 'node:test';
import assert from 'node:assert/strict';
import {legacyStatusPatchWrite} from './firestore.mjs';

// Pure offline assertions: no Firebase credentials, token, network or live writes.
const ROOT='projects/kandorty-stripe-test-5f8af/databases/(default)/documents';
const VERSION='2026-11-10T10:00:00.000000Z';
const AT='2026-11-10T10:00:01.000Z';
const condition={updateTime:VERSION};
test('legacy status write emits a Firestore updateMask, never full-document overwrite',()=>{
 const row=legacyStatusPatchWrite(ROOT,'orders/KD-12345678',
   {status:'preparing',cancellationLockedAt:AT,updatedAt:AT},condition);
 assert.equal(row.update.name,ROOT+'/orders/KD-12345678');
 assert.deepEqual(row.updateMask.fieldPaths,['cancellationLockedAt','status','updatedAt']);
 assert.deepEqual(Object.keys(row.update.fields).sort(),row.updateMask.fieldPaths);
 assert.deepEqual(row.currentDocument,condition);
 assert.equal(row.update.fields.status.stringValue,'preparing');
 assert.equal(row.update.fields.updatedAt.stringValue,AT);
 assert.equal('customer' in row.update.fields,false);
 assert.equal('payment' in row.update.fields,false);
 assert.equal('items' in row.update.fields,false);
});
test('tracking can only set valid top-level status, lock and update timestamp',()=>{
 const row=legacyStatusPatchWrite(ROOT,'tracking/KD-12345678',
   {status:'cancelled',updatedAt:AT},condition);
 assert.deepEqual(row.updateMask.fieldPaths,['status','updatedAt']);
 for(const bad of [{status:'cancelled',cancelledBy:'admin',updatedAt:AT},
  {status:'cancelled',paymentStatus:'paid',updatedAt:AT},
  {status:'cancelled',stock:5,updatedAt:AT},
  {status:'cancelled',items:[],updatedAt:AT}
 ])assert.throws(()=>legacyStatusPatchWrite(ROOT,'tracking/KD-12345678',bad,condition),/invalid_legacy_patch_fields/);
});
test('legacy patch can never target main production Firebase, other collections or path traversal',()=>{
 const patch={status:'preparing',updatedAt:AT};
 for(const root of [
  'projects/kandorty-9378a/databases/(default)/documents',
  'projects/other/databases/(default)/documents',
  '',ROOT+'/x'
 ])assert.throws(()=>legacyStatusPatchWrite(root,'orders/KD-12345678',patch,condition),/legacy_patch_test_only/);
 for(const path of ['products/KD-12345678','order_lifecycle/KD-12345678',
  'orders/../../test','orders/KD/1234','orders/'])
  assert.throws(()=>legacyStatusPatchWrite(ROOT,path,patch,condition),/invalid_legacy_patch/);
});
test('client-derived money, inventory, PII, payment or refund flags are not accepted',()=>{
 const base={status:'cancelled',updatedAt:AT};
 for(const key of ['customer','customerEdit','phone','total','stock','stockDebits','payment','paymentStatus','refundStatus','refundedAmount','accessKey','ownerId','updatedBy']){
  assert.throws(()=>legacyStatusPatchWrite(ROOT,'orders/KD-12345678',
    {...base,[key]:'untrusted'},condition),/invalid_legacy_patch_fields/);
 }
});
test('status, lock, cancellation actor, audit time, version and missing data fail closed',()=>{
 for(const patch of [
  {status:'paid',updatedAt:AT},
  {status:'preparing'},
  {status:'preparing',updatedAt:'invalid'},
  {status:'cancelled',cancellationLockedAt:AT,updatedAt:AT},
  {status:'cancelled',cancelledBy:'customer',updatedAt:AT},
  {status:'preparing',cancelledBy:'admin',updatedAt:AT},
  {status:'cancelled',updatedAt:AT,cancellationLockedAt:null}
 ])assert.throws(()=>legacyStatusPatchWrite(ROOT,'orders/KD-12345678',patch,condition),/invalid_legacy_patch/);
 for(const condition of [null,{}, {updateTime:undefined},{updateTime:1234}])
  assert.throws(()=>legacyStatusPatchWrite(ROOT,'orders/KD-12345678',
   {status:'preparing',updatedAt:AT},condition),/invalid_legacy_patch_value/);
});
