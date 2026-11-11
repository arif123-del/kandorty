import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planLegacyArchiveAccess as plan,LegacyArchiveDenied,LEGACY_ARCHIVE_ONLY}
  from './legacy-archive-only-policy.mjs';
const sample=()=>({operation:'read',
  order:{status:'cancelled',payment:'cod',total:1200,items:[{sku:'FAKE',quantity:5}],
         cancellationLockedAt:null,cancelStockRestoredAt:'synthetic-time'},
  tracking:{status:'cancelled'},lifecycle:null,ownerDeclaresVirtualCod:true});
const rejects=(x,code)=>assert.throws(()=>plan(x),e=>
  e instanceof LegacyArchiveDenied&&e.code===code);
test('18 declared COD test cases are only READABLE; no status, stock or payment writes',()=>{
  for(let i=0;i<18;i++){
    const entry=sample(),original=structuredClone(entry);
    const decision=plan(entry);
    assert.equal(decision.access,LEGACY_ARCHIVE_ONLY);
    assert.equal(decision.userReportedVirtualCod,true);
    assert.equal(decision.sourcePaymentLabel,'cod');
    for(const k of ['canEdit','canCancel','canRestoreStock','canIssueRefund',
      'canBackfillLifecycle','canActivateLive','trustedStockHistory',
      'fullRecoveryProven','producerApproved']){
      assert.equal(decision[k],false,k);
    }
    assert.deepEqual(entry,original);
    assert.equal(Object.hasOwn(decision,'items'),false);
  }
});
test('all 99 synthetic historic orders can be archived without manufacturing lifecycle ledgers',()=>{
  const states=['new','preparing','shipping','delivered','cancelled'];
  const docs=Array.from({length:99},(_,i)=>({
    operation:'read',order:{status:states[i%5],payment:i<18?'cod':i<86?'cod':'card'},
    tracking:{status:states[i%5]},lifecycle:null,
    ownerDeclaresVirtualCod:i<18
  }));
  const before=structuredClone(docs);
  for(const d of docs){
    const x=plan(d);
    assert.equal(x.canCancel,false);
    assert.equal(x.canRestoreStock,false);
    assert.equal(x.canIssueRefund,false);
  }
  assert.deepEqual(docs,before);
});
test('every mutation operation fails closed even when owner says a test order',()=>{
  const original=sample();
  for(const op of ['cancel','change_status','delete','restock','refund',
    'migrate','backfill','activate','create','read-write',undefined]){
    rejects({...original,operation:op},'legacy_archive_write_forbidden');
  }
});
test('broken tracking and trusted/new lifecycle cannot slip into legacy archive',()=>{
  const d=sample();
  rejects({...d,tracking:{status:'new'}},'legacy_archive_tracking_inconsistent');
  rejects({...d,tracking:null},'legacy_archive_record_missing');
  rejects({...d,lifecycle:undefined},'legacy_archive_ledger_not_proven_absent');
  rejects({...d,lifecycle:{trusted:true}},'legacy_archive_ledger_not_proven_absent');
  rejects({...d,order:{...d.order,payment:'unknown'}},'legacy_archive_payment_label_unknown');
});
test('self-asserted test origin cannot override recorded card label',()=>{
  const d=sample();
  const result=plan({...d,order:{status:'cancelled',payment:'card'}});
  assert.equal(result.userReportedVirtualCod,true);
  assert.equal(result.sourcePaymentLabel,'card');
  assert.equal(result.canIssueRefund,false);
  assert.equal(result.canEdit,false);
  assert.equal(result.trustedStockHistory,false);
});
test('archive decision never includes private identifiers, money or product data',()=>{
  const d=sample();
  d.order.phone='SYNTHETIC_PRIVATE_555';
  d.order.orderCode='KD-PRIVATETEST';
  const v=JSON.stringify(plan(d));
  for(const forbidden of ['SYNTHETIC_PRIVATE_555','KD-PRIVATETEST','1200','FAKE','quantity'])
    assert.equal(v.includes(forbidden),false);
});
