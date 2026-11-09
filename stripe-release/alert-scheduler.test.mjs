import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runScheduledAlert} from './alert-scheduler.mjs';

const start=Date.UTC(2026,10,9,12,0,0);
const env=()=>({
 STRIPE_MODE:'test',ALERT_DELIVERY_ENABLED:'true',
 ALERT_EMAIL_FROM:'alerts@example.test',ALERT_EMAIL_TO:'recipient@example.test',
 RESEND_API_KEY:'re_fixture_only_key'
});
const report=(requiresAttention=true)=>({
 requiresAttention,pendingSample:1,reviewSample:2,refundPendingSample:3,
 overduePendingCount:1,overdueRefundCount:0,scanLimitReached:false,
 privatePhone:'DO-NOT-SEND',orderId:'KD-PRIVATE-ORDER'
});
function fakeStore(){
 const rows=new Map();let version=0;
 return {rows,
  get:async p=>structuredClone(rows.get(p)||null),
  write:(path,data,cond)=>({path,data,cond}),
  commit:async writes=>{
   for(const w of writes){
    const prior=rows.get(w.path),c=w.cond||{};
    if(c.exists===false&&prior||c.updateTime&&c.updateTime!==prior?.version)
     throw Error('write_conflict');
   }
   for(const w of writes)rows.set(w.path,{data:structuredClone(w.data),version:String(++version)});
  }
 };
}
const accepted=async()=>({status:'accepted_by_provider_not_delivered'});
test('default OFF does not query queues or write Firestore',async()=>{
 const store=fakeStore();let called=0;
 const r=await runScheduledAlert({store,env:{},reporter:async()=>{called++;return report();}});
 assert.equal(r.status,'disabled_no_send');assert.equal(called,0);assert.equal(store.rows.size,0);
});
test('no attention means no email, no state write',async()=>{
 const store=fakeStore();
 const r=await runScheduledAlert({store,env:env(),now:start,reporter:async()=>report(false),
  send:async()=>{throw Error('unexpected_send');}});
 assert.equal(r.status,'healthy_no_send');assert.equal(store.rows.size,0);
});
test('live mode refuses to send without separate explicit alert approval',async()=>{
 const store=fakeStore();
 await assert.rejects(runScheduledAlert({store,env:{...env(),STRIPE_MODE:'live'},
  now:start,reporter:async()=>report(),send:accepted}),/alert_live_approval_required/);
 assert.equal(store.rows.size,0);
});
test('successful notification is accepted once per hour with no sensitive fields persisted',async()=>{
 const store=fakeStore();let calls=0;let observedKey;
 const invoke=now=>runScheduledAlert({store,env:env(),now,reporter:async()=>report(),
  send:async(_report,configured)=>{
   calls++;observedKey=configured.ALERT_EVENT_KEY;return accepted();
  }});
 assert.equal((await invoke(start)).status,'accepted_by_provider_not_delivered');
 assert.equal((await invoke(start+30000)).status,'already_accepted_no_send');
 assert.equal(calls,1);
 assert.match(observedKey,/^kandorty-ops-test-\d+$/);
 assert.equal(store.rows.size,1);
 for(const entry of store.rows.values()){
  assert.equal(entry.data.status,'accepted');
  assert.ok(!JSON.stringify(entry).includes('KD-PRIVATE-ORDER'));
  assert.ok(!JSON.stringify(entry).includes('DO-NOT-SEND'));
  assert.ok(!JSON.stringify(entry).includes('re_fixture_only_key'));
 }
 assert.equal((await invoke(start+60*60*1000)).status,'accepted_by_provider_not_delivered');
 assert.equal(calls,2);
});
test('overlapping alert checks never send twice while a lease is active',async()=>{
 const store=fakeStore();let finish,started;
 const entered=new Promise(r=>{started=r;});
 const blocked=new Promise(r=>{finish=r;});
 let calls=0;
 const invoke=send=>runScheduledAlert({store,env:env(),now:start,
  reporter:async()=>report(),send});
 const first=invoke(async()=>{calls++;started();await blocked;return accepted();});
 await entered;
 assert.equal((await invoke(async()=>{calls++;return accepted();})).status,'in_flight_no_send');
 finish();
 assert.equal((await first).status,'accepted_by_provider_not_delivered');
 assert.equal(calls,1);
});
test('provider failure persists cooldown; retry reuses the same idempotency key',async()=>{
 const store=fakeStore();let sends=0;const keys=[];
 const invoke=(now,send)=>runScheduledAlert({store,env:env(),now,
  reporter:async()=>report(),
  send:async(_report,configured)=>{
   sends++;keys.push(configured.ALERT_EVENT_KEY);return send();
  }});
 await assert.rejects(invoke(start,async()=>{throw Error('provider error, private');}),/alert_send_failed/);
 assert.equal((await invoke(start+30000,accepted)).status,'retry_cooldown_no_send');
 assert.equal((await invoke(start+120001,accepted)).status,'accepted_by_provider_not_delivered');
 assert.equal(sends,2);assert.deepEqual(keys,[keys[0],keys[0]]);
 assert.equal([...store.rows.values()][0].data.status,'accepted');
});
test('competing creation is guarded by Firestore exists=false',async()=>{
 const store=fakeStore();let calls=0;
 const invoke=()=>runScheduledAlert({store,env:env(),now:start,
  reporter:async()=>report(),
  send:async()=>{calls++;return accepted();}});
 const statuses=(await Promise.all([invoke(),invoke()])).map(x=>x.status);
 assert.ok(statuses.includes('accepted_by_provider_not_delivered'));
 assert.ok(statuses.includes('claimed_elsewhere_no_send')||statuses.includes('in_flight_no_send'));
 assert.equal(calls,1);
});
test('email transport receives fixed aggregate-only payload via standard adapter',async()=>{
 const store=fakeStore();let requests=0;
 const result=await runScheduledAlert({store,env:env(),now:start,reporter:async()=>report(),
  net:async(url,opts)=>{
   requests++;assert.equal(url,'https://api.resend.com/emails');
   const body=JSON.parse(opts.body);
   assert.equal(body.subject,'[Kandorty] Payment operations require attention');
   assert.ok(!opts.body.includes('KD-PRIVATE-ORDER'));
   assert.ok(!opts.body.includes('DO-NOT-SEND'));
   assert.match(opts.headers['Idempotency-Key'],/^kandorty-ops-test-/);
   return {ok:true};
  }});
 assert.equal(result.status,'accepted_by_provider_not_delivered');
 assert.equal(requests,1);
});
test('incomplete secret configuration fails before creating durable alert record',async()=>{
 const store=fakeStore();
 await assert.rejects(runScheduledAlert({store,env:{...env(),RESEND_API_KEY:''},
  now:start,reporter:async()=>report()}),/alert_private_configuration_missing/);
 assert.equal(store.rows.size,0);
});
