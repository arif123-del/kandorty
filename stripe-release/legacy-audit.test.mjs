import {test} from 'node:test';
import assert from 'node:assert/strict';
import {countLegacyOrderFolders} from './legacy-audit.mjs';
const order=(id,phone)=>({id,fields:{customer:{mapValue:{fields:phone===undefined?{}:{phone:{stringValue:phone}}}}}});
test('legacy orders are counted individually but same-phone customers share one admin folder',()=>{
 const rows=[order('a','+971 50-123-4567'),order('b','971501234567'),order('c','+971 55-123-4567'),order('d'),order('e')];
 assert.equal(rows.length,5);
 assert.equal(countLegacyOrderFolders(rows),4);
});
test('no-phone legacy orders each receive a separate folder; no customer details are returned',()=>{
 const rows=[order('id-A',''),order('id-B',null),order('id-C',' +971 50 000 0000')];
 const count=countLegacyOrderFolders(rows);
 assert.equal(count,3);
 assert.equal(typeof count,'number');
 assert.ok(!JSON.stringify(count).includes('971'));
});
test('invalid aggregate input fails closed',()=>{
 assert.throws(()=>countLegacyOrderFolders(null),/rows_required/);
 assert.throws(()=>countLegacyOrderFolders([{fields:{}}]),/invalid_order_row/);
});
