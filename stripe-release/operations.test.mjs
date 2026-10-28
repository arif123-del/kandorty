import {test} from 'node:test';import assert from 'node:assert/strict';import {operationalReport} from './operations.mjs';
test('operator report flags overdue paid recovery and shortages without leaking customer data',async()=>{
 const report=await operationalReport({pending:async()=>[{orderId:'KD-12345678',createdAt:new Date(0).toISOString(),customer:{phone:'secret'}}],reviews:async()=>[{orderId:'KD-99999999',customer:{location:'secret'}}]},3600000);
 assert.equal(report.requiresAttention,true);assert.deepEqual(report.overdueOrderIds,['KD-12345678']);assert.ok(!JSON.stringify(report).includes('secret'));assert.equal(report.reviewSample,1);
});
