// Production Firebase Admin identity readiness: strictly READ ONLY.
// Never prints a user UID, email, token, order, secret, claim object, or auth record.
// No Firebase/Auth/Firestore mutations; no live activation.
import fs from 'node:fs';
import {initializeApp,cert,deleteApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';

const PROJECT='kandorty-9378a';
const status=(name,result)=>console.log('ADMIN_AUDIT '+name+': '+result);
async function main(){
 const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
 if(!raw){status('CREDENTIAL','MISSING');process.exitCode=1;return;}
 let credentials;
 try{
  credentials=JSON.parse(raw);
  if(credentials.type!=='service_account'||credentials.project_id!==PROJECT||
     typeof credentials.client_email!=='string'||
     !credentials.client_email.endsWith('.iam.gserviceaccount.com')||
     typeof credentials.private_key!=='string'||
     !credentials.private_key.startsWith('-----BEGIN PRIVATE KEY-----'))throw Error('invalid');
 }catch{status('CREDENTIAL','INVALID');process.exitCode=1;return;}
 status('CREDENTIAL_PROJECT','MATCH');

 // Existing owner email is read only from today's deployed admin client source.
 // This is a discovery hint, NOT proof of human identity and NEVER grants admin.
 const html=fs.readFileSync('admin.html','utf8');
 const matches=[...html.matchAll(/const ADMIN_EMAIL='([^']+)';/g)];
 if(matches.length!==1||!/^.+@.+\..+$/.test(matches[0][1])){status('ADMIN_EMAIL_SOURCE','UNVERIFIED');process.exitCode=1;return;}
 const intendedEmail=matches[0][1].trim().toLowerCase();

 const app=initializeApp({credential:cert(credentials),projectId:PROJECT},'kandorty-admin-readonly');
 try{
  let user;
  try{user=await getAuth(app).getUserByEmail(intendedEmail);}
  catch(error){
   // Whitelist error codes only; NEVER echo exception text, user/email/UID or response.
   const code=typeof error?.code==='string'?error.code:'';
   const category=code==='auth/user-not-found'?'USER_NOT_FOUND':
     code==='auth/insufficient-permission'?'IAM_PERMISSION_DENIED':
     code==='auth/invalid-credential'?'INVALID_CREDENTIAL':
     code==='auth/project-not-found'?'PROJECT_NOT_FOUND':'OTHER_BLOCKER';
   status('AUTH_LOOKUP',category);process.exitCode=1;return;
  }
  if(user.email?.toLowerCase()!==intendedEmail||!user.uid||user.uid.length>128){
   status('AUTH_IDENTITY_MATCH','UNVERIFIED');process.exitCode=1;return;
  }
  status('AUTH_IDENTITY_MATCH','PASS');
  status('AUTH_ACCOUNT_ENABLED',user.disabled===true?'NO':'YES');
  status('AUTH_EMAIL_VERIFIED',user.emailVerified===true?'YES':'NO');
  status('AUTH_CUSTOM_CLAIM_ADMIN',user.customClaims?.admin===true?'YES':'NO');
  let snap;
  try{snap=await getFirestore(app).doc('admin_access/'+user.uid).get();}
  catch{status('SERVER_MEMBERSHIP_READ','BLOCKED');process.exitCode=1;return;}
  const member=snap.exists?snap.data():null;
  const now=Math.floor(Date.now()/1000);
  const validAfter=Number.isSafeInteger(member?.validAfter)&&member.validAfter>=0&&member.validAfter<=now;
  status('SERVER_MEMBERSHIP_ACTIVE',member?.active===true&&validAfter?'YES':'NO');
  status('CLIENT_ADMIN_OWNER_READY',user.disabled!==true&&user.emailVerified===true&&user.customClaims?.admin===true&&member?.active===true&&validAfter?'YES':'NO');
  console.log('ADMIN_AUDIT READ_ONLY_COMPLETE: no UID/email/credentials logged; no writes, claims, or production changes.');
 }finally{await deleteApp(app);}
}
main().catch(()=>{status('READ_ONLY_AUDIT','BLOCKED');process.exitCode=1;});
