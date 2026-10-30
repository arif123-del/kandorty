// Owner-only, READ-ONLY real Firebase admin-token acceptance in Google Cloud Shell.
// No production Firestore writes, no checkout requests, no LIVE activation.
// Password enters only through hidden terminal prompt; never print any token, UID, email or record.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initializeApp,applicationDefault,deleteApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {verifyAdmin} from './admin-auth.mjs';
import {ADMIN_PROJECT,currentStorefrontAdminEmail} from './admin-grant-plan.mjs';
import {parsePublicWebKey} from './email-verification.mjs';
import {safeFirebaseSignInFailure} from './firebase-signin-error.mjs';

const args=process.argv.slice(2);
const email=String(args[0]||'').trim().toLowerCase();
const password=process.env.FIREBASE_ADMIN_ACCEPT_PASSWORD;
delete process.env.FIREBASE_ADMIN_ACCEPT_PASSWORD;
const say=(key,val)=>console.log('OWNER_ACCEPT '+key+': '+val);
let app;
try{
 if(args.length!==1||!email||typeof password!=='string'||!password)throw Error('INPUT_REQUIRED');
 // Pin to the exact deployed legacy admin configuration. Re-review if source changes.
 const html=readFileSync(new URL('../admin.html',import.meta.url),'utf8');
 const blob=createHash('sha1').update('blob '+Buffer.byteLength(html,'utf8')+'\0').update(html,'utf8').digest('hex');
 if(blob!=='59ebb2e8b38de5b689607aa5bdb5aeee5442b310'||
   currentStorefrontAdminEmail(html)!==email)throw Error('ADMIN_CONFIG_NOT_VERIFIED');
 const key=parsePublicWebKey(html);
 app=initializeApp({credential:applicationDefault(),projectId:ADMIN_PROJECT},'owner-admin-acceptance-readonly');
 const response=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key='+encodeURIComponent(key),{
  method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({email,password,returnSecureToken:true}),
  signal:AbortSignal.timeout(15000)
 });
 if(!response.ok){
  const failure=await response.json().catch(()=>({}));
  throw Error(safeFirebaseSignInFailure(failure?.error?.message,response.status));
 }
 const signed=await response.json();
 if(signed.email?.toLowerCase()!==email||typeof signed.idToken!=='string'||!signed.idToken||
   typeof signed.localId!=='string'||!signed.localId)throw Error('IDENTITY_MISMATCH');
 say('FRESH_FIREBASE_LOGIN','PASS');
 const user=await getAuth(app).getUserByEmail(email);
 if(user.uid!==signed.localId||user.disabled||user.emailVerified!==true||user.customClaims?.admin!==true)
  throw Error('FIREBASE_ADMIN_ACCOUNT_NOT_READY');
 // This is the actual release server verifier, using Google's Firebase public signing
 // keys and a READ-ONLY check of production admin_access/{uid}. No endpoint is opened.
 const store={get:async path=>{
  if(path!=='admin_access/'+user.uid)throw Error('INVALID_READ_PATH');
  const doc=await getFirestore(app).collection('admin_access').doc(user.uid).get();
  return doc.exists?{data:doc.data()}:null;
 }};
 const actor=await verifyAdmin(signed.idToken,{projectId:ADMIN_PROJECT},store);
 if(actor.uid!==user.uid)throw Error('IDENTITY_MISMATCH');
 say('SERVER_ADMIN_TOKEN_AND_MEMBERSHIP','PASS');
 say('FIRESTORE_WRITES','NONE');
 say('LIVE_WORKER_CALLS','NONE');
 say('RESULT','READ_ONLY_ACCEPTANCE_PASS');
}catch(e){
 const allowed=new Set(['INPUT_REQUIRED','ADMIN_CONFIG_NOT_VERIFIED','FIREBASE_SIGNIN_REJECTED',
  'FIREBASE_CREDENTIALS_REJECTED','FIREBASE_RETRY_LATER','FIREBASE_ACCOUNT_DISABLED',
  'FIREBASE_PASSWORD_SIGNIN_DISABLED','FIREBASE_CAPTCHA_REQUIRED','FIREBASE_PROJECT_ACCESS_BLOCKED',
  'IDENTITY_MISMATCH','FIREBASE_ADMIN_ACCOUNT_NOT_READY']);
 say('RESULT',allowed.has(e?.message)?e.message:'ACCEPTANCE_BLOCKED');
 process.exitCode=1;
}finally{if(app)await deleteApp(app);}
