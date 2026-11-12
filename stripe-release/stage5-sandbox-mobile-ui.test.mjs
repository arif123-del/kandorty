import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const html=fs.readFileSync(new URL('./public/index.html',import.meta.url),'utf8');

test('Stage 5 isolated mobile page uses synthetic COD receipt and server APIs',()=>{
 for(const id of ['gate','product','start','refresh','cod','cod-track','cod-cancel','status'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/endpoint:location\.origin/);
 assert.match(html,/client\.startCod\(testOrder\(\)\)/);
 assert.match(html,/client\.hasReceipt\(id\)/);
 assert.match(html,/client\.track\(id,gate\.value\)/);
 assert.match(html,/client\.cancel\(id,gate\.value\)/);
 assert.match(html,/r\?\.order\?\.id!==id\|\|!r\.registered/);
 assert.match(html,/customer:\{name:'SYNTHETIC COD TEST'/);
 assert.doesNotMatch(html,/https:\/\/kandorty\.online|STRIPE_SECRET_KEY|sk_live_|sk_test_/);
 assert.doesNotMatch(html,/client\.startCod\(\{[^}]*price:|client\.startCod\(\{[^}]*stock:/);
});

test('Stage 5 TEST-only page module parses with Node without live source changes',()=>{
 const scripts=[...html.matchAll(/<script\s+type="module">([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,1,'expected exactly one module script');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kandorty-stage5-test-ui-'));
 try{
  const tmp=path.join(dir,'preview.mjs');fs.writeFileSync(tmp,scripts[0][1]);
  const r=spawnSync(process.execPath,['--check',tmp],{encoding:'utf8',timeout:5000});
  assert.equal(r.status,0,r.stderr);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
