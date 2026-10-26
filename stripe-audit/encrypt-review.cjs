// Only encrypted deployed source leaves this runner. No credentials are exported.
const crypto = require('node:crypto');
const fs = require('node:fs');
const chunks = [];
process.stdin.on('data', chunk => chunks.push(chunk));
process.stdin.on('end', () => {
  const key = crypto.randomBytes(32), iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.concat(chunks)), cipher.final()]);
  const wrapped = crypto.publicEncrypt({key:fs.readFileSync('stripe-audit/review-public.pem'),oaepHash:'sha256',padding:crypto.constants.RSA_PKCS1_OAEP_PADDING}, key);
  fs.mkdirSync('stripe-review-encrypted', {recursive:true,mode:0o700});
  fs.writeFileSync('stripe-review-encrypted/source.json', JSON.stringify({wrapped:wrapped.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64')}),{mode:0o600});
});
