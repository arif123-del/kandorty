import {Fault,sign} from '../cod-staging/security.mjs';
const enc=new TextEncoder();
async function verify(secret,text,sig){
 if(!/^[a-f0-9]{64}$/.test(sig||''))return false;
 const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 return crypto.subtle.verify('HMAC',key,Uint8Array.from(sig.match(/../g),s=>parseInt(s,16)),enc.encode(text));
}
export async function verifyWebhook(raw,header,secret,now=Date.now()){
 if(typeof header!=='string'||header.length>2048)throw new Fault('invalid_signature',400);
 const parts=header.split(',').map(p=>p.trim().split('='));
 const times=parts.filter(p=>p[0]==='t');
 if(times.length!==1||!/^\d{10}$/.test(times[0][1])||Math.abs(Math.floor(now/1000)-Number(times[0][1]))>300)throw new Fault('invalid_signature',400);
 const payload=times[0][1]+'.'+raw;
 for(const p of parts.filter(p=>p[0]==='v1'))if(await verify(secret.trim(),payload,p[1]))return true;
 throw new Fault('invalid_signature',400);
}
export async function issueReceipt(secret,cfg,s,now=Date.now()){
 const body=`stripe-v1.${cfg.mode}.${s.checkoutId}.${s.orderId}.${Math.floor(now/1000)+604800}`;
 return body+'.'+await sign(secret,body);
}
export async function readReceipt(secret,cfg,token,now=Date.now()){
 if(typeof token!=='string'||!/^stripe-v1\.(test|live)\.[a-f0-9]{64}\.KD-\d{8}\.\d{10}\.[a-f0-9]{64}$/.test(token))throw new Fault('invalid_receipt',401);
 const p=token.split('.'),sig=p.pop(),body=p.join('.');
 if(p[1]!==cfg.mode||Number(p[4])<=Math.floor(now/1000)||Number(p[4])>Math.floor(now/1000)+604800||!await verify(secret,body,sig))throw new Fault('invalid_receipt',401);
 return {checkoutId:p[2],orderId:p[3]};
}
export async function rawBody(request,max=65536){
 const reader=request.body?.getReader();if(!reader)return '';
 let size=0;const chunks=[];
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new Fault('body_too_large',413);}chunks.push(value);}
 const all=new Uint8Array(size);let at=0;for(const c of chunks){all.set(c,at);at+=c.length;}
 try{return new TextDecoder('utf-8',{fatal:true}).decode(all);}catch{throw new Fault('invalid_utf8',400);}
}
