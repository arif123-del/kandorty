import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';

const script=join(dirname(fileURLToPath(import.meta.url)),'owner-resend-verification.sh');
test('owner-only Resend helper passes bash syntax validation',()=>{
  const result=spawnSync('bash',['-n',script],{encoding:'utf8',timeout:5000});
  assert.equal(result.status,0,result.stderr);
});
test('owner-only helper refuses a noninteractive runner without sending mail',()=>{
  const result=spawnSync('bash',[script],{
    input:'',encoding:'utf8',timeout:5000,
    env:{...process.env,RESEND_API_KEY:'re_fixture_only_key',
      ALERT_DELIVERY_ENABLED:'true',RESEND_TEST_SEND_CONFIRM:'SEND_ONE_VERIFICATION_EMAIL'}
  });
  assert.equal(result.status,2);
  assert.match(result.stderr,/Interactive owner terminal required/);
  assert.ok(!result.stdout.includes('provider_accepted_delivery_not_confirmed'));
});
