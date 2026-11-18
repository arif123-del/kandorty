import {test} from 'node:test';
import assert from 'node:assert/strict';
import {operationalReport} from './operations.mjs';
const row=(createdAt)=>({createdAt,orderId:'KD-12345678',customer:{phone:'never-print',location:'private'}});
const queues=(pending=[],reviews=[],refunds=[])=>({
 pending:async()=>pending,
 reviews:async()=>reviews,
 refundPending:async()=>refunds
});
test('operator report flags old pending and shortage without exposing private records',async()=>{
 const report=await operationalReport(queues([row(new Date(0).toISOString())],[row('2026-01-01')]),3600000);
 assert.equal(report.requiresAttention,true);
 assert.equal(report.overduePendingCount,1);
 assert.equal(report.reviewSample,1);
 for(const confidential of ['KD-12345678','never-print','private'])assert.ok(!JSON.stringify(report).includes(confidential));
});
test('operator report flags pending cancellation refunds, including missing timestamps',async()=>{
 const report=await operationalReport(queues([],[],[row('')]),Date.now());
 assert.equal(report.refundPendingSample,1);
 assert.equal(report.overdueRefundCount,1);
 assert.equal(report.requiresAttention,true);
 assert.ok(!JSON.stringify(report).includes('KD-'));
});
test('refund queues at query limit cannot silently pass as cleared',async()=>{
 const report=await operationalReport(queues([],[],Array.from({length:50},()=>row(new Date().toISOString()))));
 assert.equal(report.scanLimitReached,true);
 assert.equal(report.refundPendingSample,50);
 assert.equal(report.requiresAttention,true);
});
test('healthy queues produce a clean aggregate report',async()=>{
 const report=await operationalReport(queues([row(new Date().toISOString())],[],[]));
 assert.equal(report.overduePendingCount,0);
 assert.equal(report.refundPendingSample,0);
 assert.equal(report.scanLimitReached,false);
 assert.equal(report.requiresAttention,false);
});
