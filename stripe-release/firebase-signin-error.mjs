// Whitelist safe Firebase sign-in outcomes. Never print raw provider responses,
// which may contain customer emails or debugging details.
export function safeFirebaseSignInFailure(providerMessage,status){
 const message=typeof providerMessage==='string'?providerMessage:'';
 const code=message.split(/[:\s]/,1)[0];
 if(['INVALID_PASSWORD','INVALID_LOGIN_CREDENTIALS','EMAIL_NOT_FOUND','MISSING_PASSWORD','INVALID_EMAIL'].includes(code))return 'FIREBASE_CREDENTIALS_REJECTED';
 if(code==='TOO_MANY_ATTEMPTS_TRY_LATER'||code==='QUOTA_EXCEEDED')return 'FIREBASE_RETRY_LATER';
 if(code==='USER_DISABLED')return 'FIREBASE_ACCOUNT_DISABLED';
 if(code==='OPERATION_NOT_ALLOWED')return 'FIREBASE_PASSWORD_SIGNIN_DISABLED';
 if(['CAPTCHA_CHECK_FAILED','MISSING_CAPTCHA_TOKEN','INVALID_CAPTCHA_TOKEN','RECAPTCHA_CHECK_FAILED'].includes(code))return 'FIREBASE_CAPTCHA_REQUIRED';
 if(['API_KEY_INVALID','INVALID_API_KEY','API_KEY_SERVICE_BLOCKED','PROJECT_NOT_FOUND'].includes(code))return 'FIREBASE_PROJECT_ACCESS_BLOCKED';
 if(status===429)return 'FIREBASE_RETRY_LATER';
 return 'FIREBASE_SIGNIN_REJECTED';
}
