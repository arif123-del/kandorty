// Run ONLY in an owner-authenticated Google Cloud Shell, after manual owner validation.
// Default mode is DRY-RUN; --apply requires an interactive phrase, and a verified user.
// Never stores or prints credentials, user UID, email, or Firebase user records.
import process from 'node:process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createInterface} from 'node:readline/promises';
import {stdin as input,stdout as output} from 'node:process';
import {initializeApp,applicationDefault,deleteApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {ADMIN_PROJECT,ownerGrantPreflight,currentStorefrontAdminEmail} from '../../stripe-release/admin-grant-plan.mjs';

const args=process.argv.slice(2);
const index=args.indexOf('--email');
if(index<0||typeof args[index+1]!=='string'||!/^\S+@\S+\.\S+$/.test(args[index+1])||
   args.some(a=>a.startsWith('--')&&!['--email','--apply'].includes(a)))
  {console.log('USAGE: node .github/scripts/owner-firebase-admin-grant.mjs --email ADDRESS [--apply]');process.exit(1);}
const email=args[index+1].trim().toLowerCase(),apply=args.includes('--apply');
const status=(name,s)=>console.log('OWNER_ADMIN '+name+': '+s);
const app=initializeApp({credential:applicationDefault(),projectId:ADMIN_PROJECT},'owner-provision-once');
try{
 // Release-prep only: bind grants to the exact currently shipped admin source.
 // A future admin replacement requires an explicitly reviewed source change.
 const adminSource=readFileSync(new URL('../../admin.html',import.meta.url),'utf8');
 if(createHash('sha256').update(adminSource).digest('hex')!=='b073297b9289ca5846afcf6e99fe67d8acf7f93a440b3c46ba037ffae82ea669')throw new Error('admin_config_not_verified');
 const approvedEmail=currentStorefrontAdminEmail(adminSource);
 if(email!==approvedEmail)throw new Error('admin_email_not_current');
 const auth=getAuth(app),db=getFirestore(app);
 // Does not identify user by untrusted email strings alone: the project owner must
 // approve the real, verified Firebase Authentication record before any write.
 const user=await auth.getUserByEmail(email);
 const doc=db.collection('admin_access').doc(user.uid);
 const prior=await doc.get();
 const plan=ownerGrantPreflight({email,approvedEmail,user,membership:prior.exists?prior.data():null});
 status('ACCOUNT_PRESENT','YES');
 status('EMAIL_VERIFIED','YES');
 status('ACCOUNT_ENABLED','YES');
 status('CLAIM_ALREADY_SET',plan.needsClaim?'NO':'YES');
 status('MEMBERSHIP_ALREADY_ACTIVE',plan.needsMembership?'NO':'YES');
 if(!apply){status('DRY_RUN','PASS_NO_WRITES');process.exitCode=0;}
 else{
  const rl=createInterface({input,output});
  try{
   const confirmation=await rl.question('Owner approval: type GRANT ONLY ONE VERIFIED USER to continue: ');
   if(confirmation.trim()!=='GRANT ONLY ONE VERIFIED USER')throw new Error('owner_confirmation_missing');
  }finally{rl.close();}
  let reserved=false,claimSet=false;
  try{
   if(plan.needsMembership){
    // Explicitly disabled placeholder first; never make a membership active before
    // the associated Firebase signed admin claim exists.
    await doc.set({active:false,validAfter:plan.validAfter});
    reserved=true;
   }
   if(plan.needsClaim){
    await auth.setCustomUserClaims(plan.uid,{...plan.previousClaims,admin:true});
    claimSet=true;
   }
   if(plan.needsMembership){
    await doc.set({active:true,validAfter:plan.validAfter});
   }
   const updated=await auth.getUser(plan.uid),result=await doc.get();
   if(updated.customClaims?.admin!==true||result.data()?.active!==true)throw new Error('postgrant_verification_failed');
   status('ADMIN_GRANT','VERIFIED');
   status('NEW_LOGIN_REQUIRED','YES');
  }catch(e){
   if(reserved)await doc.set({active:false,validAfter:plan.validAfter}).catch(()=>{});
   if(claimSet)await auth.setCustomUserClaims(plan.uid,plan.previousClaims).catch(()=>{});
   throw e;
  }
 }
}catch(e){
 const code=typeof e?.code==='string'?e.code:'';
 const summary=code==='auth/user-not-found'?'ACCOUNT_NOT_FOUND':
  code==='auth/insufficient-permission'?'IAM_PERMISSION_DENIED':
  e.message==='email_not_verified'?'EMAIL_VERIFICATION_REQUIRED':
  e.message==='admin_email_not_current'?'NOT_CURRENT_STOREFRONT_ADMIN':
  e.message==='admin_config_not_verified'?'ADMIN_CONFIG_NOT_VERIFIED':
  e.message==='owner_confirmation_missing'?'OWNER_CONFIRMATION_REQUIRED':'BLOCKED';
 status('RESULT',summary);
 process.exitCode=1;
}finally{await deleteApp(app);}
