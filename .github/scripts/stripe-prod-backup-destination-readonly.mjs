// Kandorty production Firestore backup destination preflight — metadata ONLY.
// No object downloads, no bucket names in logs, no customer/order data,
// no Google Cloud writes or permission changes.
import {GoogleAuth} from 'google-auth-library';
const PROJECT='kandorty-9378a';
const safe=k=>console.log('KANDORTY_BACKUP_DESTINATION_AUDIT '+k);
const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
let auth;
try{
 const credentials=JSON.parse(raw||'');
 if(credentials.project_id!==PROJECT||credentials.type!=='service_account')
  throw Error('wrong_project');
 auth=new GoogleAuth({credentials,scopes:['https://www.googleapis.com/auth/cloud-platform.read-only']});
 const client=await auth.getClient(),token=(await client.getAccessToken())?.token;
 if(!token)throw Error('missing_auth');
 let next,seen=0,privateCount=0,ownerCount=0;
 do {
  const u=new URL('https://storage.googleapis.com/storage/v1/b');
  u.searchParams.set('project',PROJECT);
  u.searchParams.set('fields','items(name,projectNumber,iamConfiguration,location),nextPageToken');
  u.searchParams.set('maxResults','200');
  if(next)u.searchParams.set('pageToken',next);
  const response=await fetch(u,{headers:{Authorization:'Bearer '+token,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!response.ok){
   safe('RESULT: NO_BUCKET_METADATA_PERMISSION');
   process.exitCode=2;break;
  }
  const json=await response.json();
  for(const b of json.items||[]){
   seen++;
   // Enforced public access prevention and uniform IAM are minimum controls,
   // not proof of an owner-only backup or permission to write an export.
   const iam=b.iamConfiguration||{};
   const privateBucket=iam.publicAccessPrevention==='enforced'&&iam.uniformBucketLevelAccess?.enabled===true;
   if(privateBucket)privateCount++;
   if(privateBucket&&typeof b.projectNumber==='string')ownerCount++;
  }
  next=json.nextPageToken;
 }while(next&&seen<2000);
 safe('BUCKET_METADATA_COUNT: '+seen);
 safe('PAP_ENFORCED_UNIFORM_IAM_BUCKET_COUNT: '+privateCount);
 safe('SAME_PROJECT_OWNER_NUMBER_COUNT: '+ownerCount);
 safe('BACKUP_COMPLETED: NO');
 safe('PRODUCTION_WRITE_OCCURRED: NO');
}catch{
 safe('RESULT: UNVERIFIABLE_NO_PRIVATE_DETAILS');
 process.exitCode=2;
}
