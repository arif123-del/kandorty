// Kandorty Stage 4 root collection coverage: metadata/counts ONLY.
// No document content, IDs, private collection names, payment identifiers,
// Auth/Storage objects, Rules or secrets are exported, logged or modified.
import {initializeApp,cert,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
const PROJECT='kandorty-9378a';
const BACKED=['orders','tracking','order_edits','order_access','order_lifecycle'];
const say=(key,value)=>console.log('STAGE4_COVERAGE_READONLY '+key+': '+value);
let app;
try{
 const raw=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON||'');
 if(raw?.type!=='service_account'||raw.project_id!==PROJECT)
   throw Error('unexpected_project');
 app=initializeApp({credential:cert(raw),projectId:PROJECT},'stage4-coverage-readonly');
 const db=getFirestore(app);
 const roots=await db.listCollections();
 if(!Array.isArray(roots)||roots.length>500)throw Error('unbounded_roots');
 const known=new Set(roots.map(x=>x.id));
 say('LIVE_ROOT_COLLECTIONS_TOTAL',known.size);
 say('LIVE_ROOT_COLLECTIONS_IN_FIVE_BACKUP_SCOPE',
     BACKED.filter(name=>known.has(name)).length);
 say('LIVE_NONEMPTY_ROOTS_NOT_IN_SNAPSHOT',
     [...known].filter(name=>!BACKED.includes(name)).length);
 let scopedTotal=0;
 for(const name of BACKED){
   const result=await db.collection(name).count().get();
   const n=result.data()?.count;
   if(!Number.isSafeInteger(n)||n<0||n>200000)throw Error('invalid_collection_count');
   scopedTotal+=n;
   // Known public schema collection keys only. No unknown root names printed.
   say(name.toUpperCase()+'_CURRENT_DOCUMENT_COUNT',n);
 }
 say('FIVE_COLLECTIONS_CURRENT_DOCUMENT_TOTAL',scopedTotal);
 say('OWNER_OLD_SNAPSHOT_DOCUMENT_TOTAL',254);
 say('OWNER_LOCAL_RESTORE_PASS_PREVIOUSLY_VERIFIED','YES');
 say('COMPLETE_FIREBASE_BACKUP_INCLUDING_AUTH_STORAGE_RULES','NO');
 say('NESTED_SUBCOLLECTIONS_RECOVERY_PROVEN','NO');
 say('FIREBASE_ORDER_STOCK_RULES_WRITES','NONE');
 say('PRODUCTION_RELEASE_AUTHORIZED','NO');
}catch{
 say('STATUS','BLOCKED_OR_FAILED_WITHOUT_PRIVATE_DETAILS');
 process.exitCode=2;
}finally{if(app)await deleteApp(app);}
