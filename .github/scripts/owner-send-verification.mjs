// Secure, owner-only terminal action. Password is supplied via hidden Bash prompt,
// only to Firebase's official password sign-in endpoint; never logged or saved.
import fs from 'node:fs';
import {parsePublicWebKey,sendVerificationToSignedInUser} from '../../stripe-release/email-verification.mjs';
const email=process.argv[2],password=process.env.FIREBASE_VERIFY_PASSWORD;
delete process.env.FIREBASE_VERIFY_PASSWORD;
try{
 const key=parsePublicWebKey(fs.readFileSync('admin.html','utf8'));
 await sendVerificationToSignedInUser({email,password,apiKey:key});
 console.log('FIREBASE_VERIFY EMAIL_SENT: open the specified Gmail inbox and use the Firebase verification email. No admin changes made.');
}catch(e){
 const allowed=new Set(['credentials_required','firebase_project_config_unverified','firebase_public_web_key_missing','firebase_public_web_key_invalid','firebase_signin_denied','firebase_identity_mismatch','firebase_verification_delivery_failed','firebase_email_delivery_unconfirmed']);
 console.log('FIREBASE_VERIFY RESULT: '+(allowed.has(e?.message)?e.message:'VERIFICATION_BLOCKED'));
 process.exitCode=1;
}
