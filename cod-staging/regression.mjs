// Read-only endpoint fingerprinting proves the deployed services were not changed.
// This does NOT assert Ziina payment fulfillment or shared inventory compatibility.
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {hash} from './security.mjs';
const urls={stripe:'https://kandorty-stripe-orders-test.aliyajan200011.workers.dev/test',ziina:'https://kandorty-ziina-orders.aliyajan200011.workers.dev/test'};
const results={};
for(const [name,url] of Object.entries(urls)){
 const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(30000)});
 assert.equal(r.status,200,name+' TEST page must be reachable');results[name]=await hash(await r.text());
}
const file=process.env.RUNNER_TEMP+'/cod-provider-baseline.json';
if(process.argv[2]==='before')await writeFile(file,JSON.stringify(results));
else {assert.deepEqual(results,JSON.parse(await readFile(file,'utf8')));console.log('PASS: Stripe Sandbox and Ziina TEST pages unchanged and reachable. Payment fulfillment interoperability remains a separate gate.');}
