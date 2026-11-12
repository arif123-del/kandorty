export class Fault extends Error { constructor(code,status=400){super(code);this.status=status;} }
const enc=new TextEncoder();
export const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
export const random=n=>hex(crypto.getRandomValues(new Uint8Array(n)));
export const hash=async s=>hex(await crypto.subtle.digest('SHA-256',enc.encode(s)));
async function key(secret){return crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
export async function sign(secret,text){return hex(await crypto.subtle.sign('HMAC',await key(secret),enc.encode(text)));}
export async function receipt(secret,orderId,checkoutId,now=Date.now()){
 const payload=`v1.${orderId}.${checkoutId}.${Math.floor(now/1000)+86400}`;
 return payload+'.'+await sign(secret,'cod-test-tracking:'+payload);
}
export async function verifyReceipt(secret,token,orderId,now=Date.now()){
 if(typeof token!=='string'||!/^v1\.KD-\d{8}\.[a-f0-9]{64}\.\d{10}\.[a-f0-9]{64}$/.test(token))throw new Fault('invalid_receipt',401);
 const parts=token.split('.'),sig=parts.pop(),payload=parts.join('.');
 if(parts[1]!==orderId||Number(parts[3])<=Math.floor(now/1000)||Number(parts[3])>Math.floor(now/1000)+86400)throw new Fault('invalid_receipt',401);
 const ok=await crypto.subtle.verify('HMAC',await key(secret),Uint8Array.from(sig.match(/../g),x=>parseInt(x,16)),enc.encode('cod-test-tracking:'+payload));
 if(!ok)throw new Fault('invalid_receipt',401);
 return parts[2];
}
export async function bodyJSON(request){
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw new Fault('json_required',415);
 const reader=request.body?.getReader();if(!reader)throw new Fault('invalid_json');
 let size=0,chunks=[];
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16384){await reader.cancel();throw new Fault('body_too_large',413);}chunks.push(value);}
 const buf=new Uint8Array(size);let at=0;for(const c of chunks){buf.set(c,at);at+=c.length;}
 try{return JSON.parse(new TextDecoder().decode(buf));}catch{throw new Fault('invalid_json');}
}
