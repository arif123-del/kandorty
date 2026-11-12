// Pure, privacy-safe Stage 4 recovery coverage gate for Kandorty.
// This does NOT use individual Auth users, Storage objects or Firestore IDs.
// No combination of read-only metadata probes counts as a backup.
const TYPES=Object.freeze(['auth','storage','rules']);
export function assessNonFirestoreRecovery(results={}){
 const flags={};
 for(const key of TYPES){
  const x=results[key];
  if(x!==true&&x!==false&&x!=='UNAVAILABLE'&&x!=='DENIED')
   throw Error('invalid_recovery_probe_result');
  flags[key]=x;
 }
 return Object.freeze({
  authReadAccess:flags.auth===true?'CONFIRMED':flags.auth===false?'EMPTY_OR_NOT_CONFIGURED':'UNVERIFIED',
  storageReadAccess:flags.storage===true?'CONFIRMED':flags.storage===false?'EMPTY_OR_NOT_CONFIGURED':'UNVERIFIED',
  rulesReadAccess:flags.rules===true?'CONFIRMED':flags.rules===false?'NO_RELEASES':'UNVERIFIED',
  authUsersExportedAndRestored:false,
  storageObjectsExportedAndRestored:false,
  publishedRulesExportedAndRestored:false,
  managedPointInTimeRestoreVerified:false,
  stage4ProductionReleaseAuthorized:false
 });
}
