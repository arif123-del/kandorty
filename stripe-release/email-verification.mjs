// Client-auth Firebase email verification sender; never grants roles or modifies Firestore.
// A verified Firebase sign-in is required before Google sends an email to that user's inbox.
export function parsePublicWebKey(html){
 const match=String(html).match(/const firebaseConfig\s*=\s*\{([\s\S]*?)\};/);
 if(!match||!/projectId:\s*["']kandorty-9378a["']/.test(match[1]))throw new Error('firebase_project_config_unverified');
 const key=match[1].match(/apiKey:\s*["'](AIza[A-Za-z0-9_-]{20,})["']/);
 if(!key)throw new Error('firebase_public_web_key_missing');
 return key[1];
}
export async function sendVerificationToSignedInUser({email,password,apiKey,net=fetch}){
 const address=String(email||'').trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)||typeof password!=='string'||!password)throw new Error('credentials_required');
 if(!/^AIza[A-Za-z0-9_-]{20,}$/.test(apiKey))throw new Error('firebase_public_web_key_invalid');
 const root='https://identitytoolkit.googleapis.com/v1/accounts:';
 const request=async(path,body)=>{
  const result=await net(root+path+'?key='+encodeURIComponent(apiKey),{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  if(!result.ok)throw new Error(path==='signInWithPassword'?'firebase_signin_denied':'firebase_verification_delivery_failed');
  return result.json();
 };
 const signed=await request('signInWithPassword',{email:address,password,returnSecureToken:true});
 if(signed.email?.toLowerCase()!==address||typeof signed.idToken!=='string'||!signed.idToken)throw new Error('firebase_identity_mismatch');
 const result=await request('sendOobCode',{requestType:'VERIFY_EMAIL',idToken:signed.idToken});
 if(result.email?.toLowerCase()!==address)throw new Error('firebase_email_delivery_unconfirmed');
 return {sent:true};
}
