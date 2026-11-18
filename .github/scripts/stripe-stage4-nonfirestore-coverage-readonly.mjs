// Metadata-only read-only Firebase non-Firestore Recovery coverage review.
// No Auth account, Storage object ID/metadata, Rules source, PII, email,
// token, URI, or private document is printed or committed.
import {initializeApp,cert,deleteApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getStorage} from 'firebase-admin/storage';
import {assessNonFirestoreRecovery} from '../../stripe-release/nonfirestore-recovery-gate.mjs';

const PROJECT='kandorty-9378a';
const out=(k,v)=>console.log('STAGE4_NONFIRESTORE_READONLY '+k+': '+v);
const states={auth:'UNAVAILABLE',storage:'UNAVAILABLE',rules:'UNAVAILABLE'};
let app;
try{
 const cred=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON||'');
 if(cred.type!=='service_account'||cred.project_id!==PROJECT)
  throw Error('wrong_project_credential');
 app=initializeApp({credential:cert(cred),projectId:PROJECT},
                   'stage4-nonfirestore-coverage-only');

 try {
  // Only 1 user record is fetched to check existence. No user fields output.
  const first=await getAuth(app).listUsers(1);
  states.auth=first.users.length>0;
  out('AUTH_USERS_PRESENT',first.users.length>0?'YES':'NO');
 }catch {
  states.auth='DENIED';
  out('AUTH_READ_ACCESS','UNAVAILABLE_OR_DENIED');
 }

 // Both Firebase Storage default-bucket naming formats; never create buckets.
 let anyObject=false,hasReadableBucket=false,allDenied=true;
 for(const b of [
  PROJECT+'.firebasestorage.app',
  PROJECT+'.appspot.com'
 ]){
  try {
   const [files]=await getStorage(app).bucket(b).getFiles({
     maxResults:1,autoPaginate:false
   });
   hasReadableBucket=true;
   allDenied=false;
   if(files.length>0)anyObject=true;
  }catch{/* insufficient IAM, missing bucket or service not provisioned */ }
 }
 states.storage=hasReadableBucket?anyObject:(allDenied?'DENIED':'UNAVAILABLE');
 out('STORAGE_DEFAULT_BUCKET_READABLE',hasReadableBucket?'YES':'NO_OR_DENIED');
 out('STORAGE_OBJECTS_PRESENT_IF_READABLE',hasReadableBucket?(anyObject?'YES':'NO'):'UNKNOWN');

 try {
  const t=await app.options.credential.getAccessToken();
  const resp=await fetch('https://firebaserules.googleapis.com/v1/projects/'+
                       PROJECT+'/releases?pageSize=20',{
   method:'GET',
   headers:{Authorization:'Bearer '+t.access_token,Accept:'application/json'},
   redirect:'error',signal:AbortSignal.timeout(15000)
  });
  if(!resp.ok)throw Error('rule_read_denied');
  const payload=await resp.json();
  if(!Array.isArray(payload.releases)&&payload.releases!==undefined)
   throw Error('unexpected_rules_releases');
  const count=(payload.releases||[]).length;
  states.rules=count>0;
  out('RULES_RELEASES_EXIST',count>0?'YES':'NO');
  out('RULES_RELEASE_LIST_PAGINATED',payload.nextPageToken?'YES':'NO');
 }catch {
  states.rules='DENIED';
  out('RULES_READ_ACCESS','UNAVAILABLE_OR_DENIED');
 }
 const result=assessNonFirestoreRecovery(states);
 out('AUTH_READ_ACCESS',result.authReadAccess);
 out('STORAGE_READ_ACCESS',result.storageReadAccess);
 out('RULES_READ_ACCESS',result.rulesReadAccess);
 out('AUTH_USERS_EXPORTED_AND_RESTORED','NO');
 out('STORAGE_OBJECTS_EXPORTED_AND_RESTORED','NO');
 out('PUBLISHED_RULES_EXPORTED_AND_RESTORED','NO');
 out('COMPLETE_FIREBASE_PROJECT_RECOVERY_VERIFIED','NO');
 out('PRODUCTION_FIREBASE_AUTH_STORAGE_RULES_WRITES','NONE');
 out('STAGE4_RELEASE_AUTHORIZED','NO');
}catch{
 out('STATUS','BLOCKED_OR_UNAVAILABLE_NO_PRIVATE_DETAILS');
 process.exitCode=2;
}finally{
 if(app)await deleteApp(app);
}
