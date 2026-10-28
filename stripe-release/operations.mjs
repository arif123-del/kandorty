// Private operator report: only counts and order IDs, never keys, customer data or receipts.
import {releaseConfig} from './configuration.mjs';
import {createStore} from './firestore.mjs';
export async function operationalReport(store,now=Date.now()){
 const pending=await store.pending();const reviews=await store.reviews();
 const overdue=pending.filter(s=>now-Date.parse(s.createdAt)>45*60*1000);
 return {pendingSample:pending.length,reviewSample:reviews.length,overdueOrderIds:overdue.map(s=>s.orderId),reviewOrderIds:reviews.map(s=>s.orderId),scanLimitReached:pending.length>=50||reviews.length>=50,requiresAttention:overdue.length>0||reviews.length>0||pending.length>=50};
}
if(process.argv[1]?.endsWith('/operations.mjs')){
 releaseConfig(process.env);const report=await operationalReport(createStore(process.env));console.log(JSON.stringify(report));
 if(report.requiresAttention)process.exitCode=2;
}
