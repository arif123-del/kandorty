// Strictly read-only production Firebase identity and connectivity check.
// Uses an existing GitHub Actions secret in process memory, never prints values.
// No Firestore writes, no rules publication, no admin provisioning.
import {createPrivateKey,sign} from 'node:crypto';

const PROJECT='kandorty-9378a';
const report=(label,passed)=>console.log(label+': '+(passed?'PASS':'BLOCKED'));
const encode=v=>Buffer.from(typeof v==='string'?v:JSON.stringify(v)).toString('base64url');
const request=async(url,options)=>fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});

async function main(){
 const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
 if(!raw){report('Production credential in named secret',false);process.exitCode=1;return;}
 let key;
 try{
  const parsed=JSON.parse(raw);
  if(parsed.project_id!==PROJECT||parsed.type!=='service_account'||
    typeof parsed.client_email!=='string'||
    !parsed.client_email.endsWith('.iam.gserviceaccount.com')||
    typeof parsed.private_key!=='string')throw Error('invalid_identity');
  const privateKey=createPrivateKey(parsed.private_key);
  if(privateKey.asymmetricKeyType!=='rsa')throw Error('invalid_key_type');
  key={email:parsed.client_email,privateKey};
 }catch{report('Production credential project and key format',false);process.exitCode=1;return;}
 report('Production credential project and key format',true);

 const now=Math.floor(Date.now()/1000);
 const header=encode({alg:'RS256',typ:'JWT'});
 const payload=encode({
  iss:key.email,scope:'https://www.googleapis.com/auth/datastore',
  aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+1200
 });
 const unsigned=header+'.'+payload;
 const signature=sign('RSA-SHA256',Buffer.from(unsigned),key.privateKey).toString('base64url');
 let token;
 try{
  const response=await request('https://oauth2.googleapis.com/token',{
   method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams({
    grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:unsigned+'.'+signature
   })
  });
  if(!response.ok)throw Error('oauth_denied');
  const result=await response.json();
  if(typeof result.access_token!=='string'||!result.access_token)throw Error('invalid_oauth');
  token=result.access_token;
 }catch{report('Google OAuth service-account exchange',false);process.exitCode=1;return;}
 report('Google OAuth service-account exchange',true);

 // GET only, one product with a field mask. Never print documents or customer data.
 try{
  const url='https://firestore.googleapis.com/v1/projects/'+PROJECT+
   '/databases/(default)/documents/products?pageSize=1&mask.fieldPaths=stock';
  const response=await request(url,{method:'GET',headers:{Authorization:'Bearer '+token}});
  if(!response.ok)throw Error('firestore_read_denied');
  report('Production Firestore products read permission',true);
 }catch{report('Production Firestore products read permission',false);process.exitCode=1;return;}
 console.log('Read-only verification complete. No production document writes, rules changes, deployment, Stripe Live calls, or secret output.');
}
main().catch(()=>{report('Unexpected read-only check error',false);process.exitCode=1;});
