import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hash} from '../cod-staging/security.mjs';
import {auditResendDelivery} from './resend-delivery-audit.mjs';
const hour=Date.UTC(2026,10,9,20,0,0);
const timestamp=hour+15*60000;
const env=()=>({
 STRIPE_MODE:'test',ALERT_DELIVERY_ENABLED:'true',
 RESEND_READ_ACCESS_ENABLED:'true',RESEND_READ_API_KEY:'re_fixture_only_key',
 ALERT_EMAIL_FROM:'alerts@example.test',
 ALERT_EMAIL_TO:'recipient@example.test'
});
const fake=async()=>{
 const id='kandorty-ops-test-'+Math.floor(timestamp/3600000);
 const path='stripe_operator_alerts/'+await hash(id);
 const rows=new Map([[path,{version:'1',data:{
  eventKey:id,status:'accepted',acceptedAt:new Date(timestamp).toISOString(),
  deliveryStatus:'unknown',messageReport:{requiresAttention:true,pendingSample:1}
 }}]]);
 let commits=0;
 return {path,rows,get:async k=>structuredClone(rows.get(k)||null),
  write:(p,data,cond)=>({p,data,cond}),
  commit:async writes=>{
   commits++;
   for(const w of writes){
    assert.equal(w.cond.updateTime,rows.get(w.p).version);
    rows.set(w.p,{version:String(commits+1),data:w.data});
   }
  }
 };
};
const response=(last_event='delivered',patch={})=>({
 ok:true,json:async()=>({object:'list',data:[{
  from:'alerts@example.test',to:['recipient@example.test'],
  subject:'[Kandorty] Payment operations require attention',
  created_at:new Date(timestamp-1000).toISOString(),last_event,...patch
 }]})
});
test('OFF by default cannot read records or contact provider',async()=>{
 const r=await auditResendDelivery({store:{get:()=>{throw Error('unexpected');}},
  env:{},now:timestamp,net:()=>{throw Error('unexpected');}});
 assert.equal(r.status,'disabled');
});
test('provider delivery is checked without pretending Inbox confirmation',async()=>{
 const s=await fake();let requests=0;
 const r=await auditResendDelivery({store:s,env:env(),now:timestamp+60000,
  net:async(url,opts)=>{
   requests++;
   assert.equal(url,'https://api.resend.com/emails?limit=100');
   assert.equal(opts.method,'GET');assert.equal(opts.redirect,'error');
   assert.ok(opts.headers.Authorization.startsWith('Bearer re_'));
   return response();
  }});
 assert.equal(r.status,'provider_metadata_checked');
 assert.equal(r.inboxConfirmed,false);
 assert.equal(r.recorded,1);
 assert.equal(s.rows.get(s.path).data.deliveryStatus,'delivered');
 assert.equal(requests,1);
 assert.ok(!JSON.stringify(s.rows.get(s.path).data).includes('recipient@example.test'));
 const again=await auditResendDelivery({store:s,env:env(),now:timestamp+62000,
  net:()=>{throw Error('network should not be used after verified delivery');}});
 assert.equal(again.status,'nothing_to_check');
});
test('unrelated recipient, wrong subject and ambiguous list can never confirm delivery',async()=>{
 for(const variant of [
  {to:['different@example.test']},
  {subject:'different'},
  {created_at:new Date(timestamp-50*60000).toISOString()}
 ]){
  const s=await fake();
  const result=await auditResendDelivery({store:s,env:env(),now:timestamp+7000,
   net:async()=>response('delivered',variant)});
  assert.equal(result.recorded,0);
  assert.equal(s.rows.get(s.path).data.deliveryStatus,'unknown');
 }
 const s=await fake();
 const msg=(await response().json()).data[0];
 const result=await auditResendDelivery({store:s,env:env(),now:timestamp+7000,
  net:async()=>({ok:true,json:async()=>({object:'list',data:[msg,msg]})})});
 assert.equal(result.recorded,0);
});
test('auth error, network error, unknown schema remain unverified and do not break cron',async()=>{
 for(const net of [
  async()=>({ok:false,status:403}),
  async()=>{throw Error('temporary provider outage');},
  async()=>({ok:true,json:async()=>({data:'bad'})})
 ]){
  const s=await fake();
  const r=await auditResendDelivery({store:s,env:env(),now:timestamp+9000,net});
  assert.equal(r.status,'provider_status_unavailable');
  assert.equal(s.rows.get(s.path).data.deliveryStatus,'unknown');
 }
});
test('provider-reported bounce is preserved as such and never called delivered',async()=>{
 const s=await fake();
 const r=await auditResendDelivery({store:s,env:env(),now:timestamp+9000,
  net:async()=>response('bounced')});
 assert.equal(r.inboxConfirmed,false);
 assert.equal(s.rows.get(s.path).data.deliveryStatus,'bounced');
});
test('live mode requires separate alerts approval even on read-only provider checks',async()=>{
 const s=await fake();
 await assert.rejects(auditResendDelivery({store:s,env:{...env(),STRIPE_MODE:'live'},
  now:timestamp+9000,net:()=>{throw Error('unexpected network');}}),/delivery_audit_live_not_approved/);
});

test('sending-only credential cannot trigger read without separate opt-in',async()=>{
 const r=await auditResendDelivery({store:{get:()=>{throw Error('not allowed');}},
  env:{...env(),RESEND_READ_ACCESS_ENABLED:'false'},now:timestamp,
  net:()=>{throw Error('unauthorized read');}});
 assert.equal(r.status,'read_not_authorized_no_network');
});
