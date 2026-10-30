import {test} from 'node:test';
import assert from 'node:assert/strict';
import {safeFirebaseSignInFailure} from './firebase-signin-error.mjs';
test('Firebase credential errors report a safe generic code',()=>{
 for(const v of ['INVALID_PASSWORD','INVALID_LOGIN_CREDENTIALS','EMAIL_NOT_FOUND','INVALID_PASSWORD : sensitive@example.com'])
  assert.equal(safeFirebaseSignInFailure(v,400),'FIREBASE_CREDENTIALS_REJECTED');
});
test('Firebase rate, disabled, CAPTCHA and project failures are distinguished safely',()=>{
 assert.equal(safeFirebaseSignInFailure('TOO_MANY_ATTEMPTS_TRY_LATER',400),'FIREBASE_RETRY_LATER');
 assert.equal(safeFirebaseSignInFailure('USER_DISABLED',400),'FIREBASE_ACCOUNT_DISABLED');
 assert.equal(safeFirebaseSignInFailure('CAPTCHA_CHECK_FAILED',400),'FIREBASE_CAPTCHA_REQUIRED');
 assert.equal(safeFirebaseSignInFailure('API_KEY_SERVICE_BLOCKED',403),'FIREBASE_PROJECT_ACCESS_BLOCKED');
 assert.equal(safeFirebaseSignInFailure('',429),'FIREBASE_RETRY_LATER');
});
test('Unexpected errors cannot print raw provider content',()=>{
 const confidential='sensitive@example.com / password=never';
 assert.equal(safeFirebaseSignInFailure(confidential,400),'FIREBASE_SIGNIN_REJECTED');
 assert.ok(!safeFirebaseSignInFailure(confidential,400).includes(confidential));
});
