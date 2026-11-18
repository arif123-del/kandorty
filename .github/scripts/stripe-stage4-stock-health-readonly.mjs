// Strictly READ-ONLY current catalog stock-field health summary.
// This cannot recover historic debits/credits caused by test purchases.
// Never prints product IDs, images, prices, names or stock quantities.
import {initializeApp,cert,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
const PROJECT='kandorty-9378a';
const say=(key,value)=>console.log('STAGE4_STOCK_HEALTH_READONLY '+key+': '+value);
const present=x=>x!==undefined&&x!==null&&x!=='';
const valid=x=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
let app;
try{
 const raw=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON||'');
 if(raw?.type!=='service_account'||raw.project_id!==PROJECT)
   throw Error('wrong_project');
 app=initializeApp({credential:cert(raw),projectId:PROJECT},'stage4-product-stock-readonly');
 const db=getFirestore(app);
 const snapshot=await db.collection('products').select('stock','totalStock').limit(1001).get();
 if(snapshot.size>=1001)throw Error('bounded_product_limit');
 let withStock=0,missingStock=0,invalidStock=0,missingTotal=0,
     validTotal=0,invalidTotal=0,totalBelowRemaining=0;
 for(const doc of snapshot.docs){
   const p=doc.data();
   if(!present(p.stock))missingStock++;
   else if(!valid(p.stock))invalidStock++;
   else withStock++;
   if(!present(p.totalStock))missingTotal++;
   else if(!valid(p.totalStock))invalidTotal++;
   else{validTotal++;if(valid(p.stock)&&p.totalStock<p.stock)totalBelowRemaining++;}
 }
 say('PRODUCT_DOCUMENTS',snapshot.size);
 say('STOCK_FIELD_NONNEGATIVE_INTEGER',withStock);
 say('STOCK_FIELD_MISSING',missingStock);
 say('STOCK_FIELD_INVALID',invalidStock);
 say('TOTAL_STOCK_FIELD_VALID',validTotal);
 say('TOTAL_STOCK_FIELD_MISSING',missingTotal);
 say('TOTAL_STOCK_FIELD_INVALID',invalidTotal);
 say('TOTAL_STOCK_BELOW_CURRENT_STOCK',totalBelowRemaining);
 say('CURRENT_FIELD_HEALTH_IS_HISTORICAL_INVENTORY_PROOF','NO');
 say('HISTORICAL_TEST_STOCK_RECONCILIATION_VERIFIED','NO');
 say('STOCK_ORDER_RULES_WRITES','NONE');
 say('PRODUCTION_RELEASE_AUTHORIZED','NO');
}catch{
 say('STATUS','BLOCKED_OR_FAILED_NO_PRIVATE_DETAILS');
 process.exitCode=2;
}finally{if(app)await deleteApp(app);}
