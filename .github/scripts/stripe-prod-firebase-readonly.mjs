// Strictly read-only production Firebase identity and connectivity check.
// Uses an existing GitHub Actions secret in process memory, never prints values.
// No Firestore writes, no rules publication, no admin provisioning.
import {createPrivateKey,sign} from 'node:crypto';
import {countLegacyOrderFolders} from '../../stripe-release/legacy-audit.mjs';

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
 // Bounded, metadata-only compatibility scan: IDs stay in memory; output counts only.
 // This DOES NOT migrate legacy orders or modify Firestore Rules.
 async function scanCollection(name,fieldPaths,max=500){
  const seen=[];let cursor='';
  do{
   const query=new URLSearchParams({pageSize:'100'});
   for(const f of fieldPaths)query.append('mask.fieldPaths',f);
   if(cursor)query.set('pageToken',cursor);
   const url='https://firestore.googleapis.com/v1/projects/'+PROJECT+
    '/databases/(default)/documents/'+name+'?'+query;
   const response=await request(url,{method:'GET',headers:{Authorization:'Bearer '+token}});
   if(!response.ok)throw Error('collection_read_denied');
   const json=await response.json();
   for(const d of json.documents||[]){
    const id=d.name?.split('/').at(-1);
    if(typeof id!=='string'||!id)continue;
    seen.push({id,fields:d.fields||{}});
   }
   cursor=json.nextPageToken||'';
  }while(cursor&&seen.length<max);
  return {rows:seen,truncated:!!cursor};
 }
 try{
  const orders=await scanCollection('orders',['status','payment','customer.phone'],500);
  const ledgers=await scanCollection('order_lifecycle',['payment'],500);
  const admins=await scanCollection('admin_access',['active'],500);
  const ledgerIds=new Set(ledgers.rows.map(row=>row.id));
  const unmanaged=orders.rows.filter(row=>!ledgerIds.has(row.id)).length;
  const activeAdmins=admins.rows.filter(row=>row.fields.active?.booleanValue===true).length;
  console.log('Production metadata audit (counts only; never IDs or customer data):');
  console.log('Orders scanned: '+orders.rows.length+(orders.truncated?' (TRUNCATED)':''));
  console.log('Trusted lifecycle ledgers scanned: '+ledgers.rows.length+(ledgers.truncated?' (TRUNCATED)':''));
  console.log('Orders missing matching server lifecycle ledger in scanned data: '+
    unmanaged+(orders.truncated||ledgers.truncated?' (LOWER BOUND; scan limited)':''));
  // The deployed admin renders customer folders by normalized phone. A folder is
  // not an order; explain any apparent discrepancy without printing phone data.
  console.log('Legacy admin customer folders inferred from phone: '+
    countLegacyOrderFolders(orders.rows)+(orders.truncated?' (PARTIAL; scan limited)':''));
  const summarize=(rows,field,allowlist)=>{
   const counts=Object.fromEntries([...allowlist,'other','missing'].map(x=>[x,0]));
   for(const row of rows){
    const value=row.fields[field]?.stringValue;
    const category=value===undefined?'missing':allowlist.includes(value)?value:'other';
    counts[category]++;
   }
   return Object.entries(counts).filter(([,count])=>count>0).map(([name,count])=>name+'='+count).join(', ');
  };
  console.log('Order status groups: '+summarize(orders.rows,'status',['new','preparing','shipping','delivered','cancelled']));
  console.log('Order payment groups: '+summarize(orders.rows,'payment',['cod','card']));
  console.log('Active server-owned admin memberships: '+activeAdmins+(admins.truncated?' (TRUNCATED)':''));
  console.log('This is a read-only inventory, NOT confirmation of legacy migration or actual admin login.');
 }catch{
  report('Legacy order/admin metadata read access',false);
  process.exitCode=1;
  return;
 }
 console.log('Read-only verification complete. No production document writes, rules changes, deployment, Stripe Live calls, or secret output.');
}
main().catch(()=>{report('Unexpected read-only check error',false);process.exitCode=1;});
