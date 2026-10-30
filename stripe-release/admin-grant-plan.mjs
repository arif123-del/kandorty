// Pure guard used by the separately owner-invoked administrative provisioning tool.
// Does not access Firebase, secrets, the network or production data.
export const ADMIN_PROJECT='kandorty-9378a';
export function ownerGrantPreflight({email,user,membership,now=Math.floor(Date.now()/1000)}){
 const normalise=s=>typeof s==='string'?s.trim().toLowerCase():'';
 if(!normalise(email)||normalise(email)!==normalise(user?.email))throw new Error('account_email_mismatch');
 if(typeof user?.uid!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(user.uid))throw new Error('unsafe_uid');
 if(user.disabled===true)throw new Error('firebase_user_disabled');
 if(user.emailVerified!==true)throw new Error('email_not_verified');
 if(user.providerData?.length&&!user.providerData.some(p=>p.providerId==='password'||p.providerId==='google.com'))throw new Error('provider_not_approved');
 if(!Number.isSafeInteger(now)||now<1000000000)throw new Error('clock_invalid');
 if(membership&&typeof membership!=='object')throw new Error('membership_invalid');
 if(membership&&(membership.active!==undefined&&typeof membership.active!=='boolean'))throw new Error('membership_invalid');
 if(membership?.active===true&&(!Number.isSafeInteger(membership.validAfter)||membership.validAfter>now||membership.validAfter<0))throw new Error('membership_valid_after_invalid');
 if(user.customClaims?.admin!==undefined&&typeof user.customClaims.admin!=='boolean')throw new Error('admin_claim_invalid');
 return {uid:user.uid,previousClaims:{...(user.customClaims||{})},needsClaim:user.customClaims?.admin!==true,
  needsMembership:membership?.active!==true,validAfter:now};
}
