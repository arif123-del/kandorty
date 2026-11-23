'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const admin=fs.readFileSync('admin.html','utf8');
const store=fs.readFileSync('index.html','utf8');
function imageCode(html){
  const start=html.indexOf('// New product/banner/category photos');
  const end=html.indexOf('function utf8Bytes(value){',start);
  assert.ok(start>=0&&end>start,'Original-quality image uploader must exist');
  return html.slice(start,end);
}
const bytes=3*1024*1024;
const original={type:'image/jpeg',size:bytes,name:'original-4000px.jpg'};
let uploads=[];
let shouldFailCloud=false;
let shouldFailStorage=false;
function FakeFormData(){this.fields=[];}
FakeFormData.prototype.append=function(...args){this.fields.push(args);};
class FakeXHR {
  constructor(){this.upload={};this.responseType='';this.timeout=0;}
  open(method,url,async){this.url=url;this.method=method;}
  send(body){
    uploads.push({provider:'cloudinary',url:this.url,body});
    this.status=shouldFailCloud?400:200;
    this.response=shouldFailCloud
      ?{error:{message:'Preset not available'}}
      :{resource_type:'image',secure_url:'https://res.cloudinary.com/zz3znbcp/image/upload/v123/my-original.jpg'};
    this.onload();
  }
}
const env={
  XMLHttpRequest:FakeXHR,
  FormData:FakeFormData,
  console:{warn(){}},
  crypto:{randomUUID:()=> '3d3e2420-0e70-4598-a499-293e748b625b'},
  storage:{ref(){return {child(path){
    return {
      put(file,metadata){
        uploads.push({provider:'firebase',path,file,metadata});
        return {on(event,progress,error,done){
          if(shouldFailStorage){error(new Error('no storage permission'));return;}
          progress({bytesTransferred:file.size,totalBytes:file.size});
          done();
        }};
      },
      getDownloadURL(){return Promise.resolve('https://firebasestorage.googleapis.com/v0/b/example.jpg?token=123');}
    };
  }};}}
};
vm.createContext(env);
vm.runInContext("const CLOUDINARY_CLOUD_NAME='zz3znbcp';const CLOUDINARY_UPLOAD_PRESET='kandorty_video';",env);
vm.runInContext(imageCode(admin),env);

(async()=>{
  let url=await env.uploadOriginalQualityImage(original,'products');
  assert.equal(url,'https://res.cloudinary.com/zz3znbcp/image/upload/v123/my-original.jpg');
  assert.equal(uploads.length,1);
  assert.equal(uploads[0].url,'https://api.cloudinary.com/v1_1/zz3znbcp/image/upload');
  assert.ok(uploads[0].body.fields.some(f=>f[0]==='file'&&f[1]===original),
    'Cloudinary upload must send the exact original File (not a compressed canvas)');
  assert.ok(uploads[0].body.fields.some(f=>f[0]==='upload_preset'&&f[1]==='kandorty_video'));
  shouldFailCloud=true;
  uploads=[];
  url=await env.uploadOriginalQualityImage(original,'banners');
  assert.ok(url.startsWith('https://firebasestorage.googleapis.com/'));
  assert.equal(uploads[1].provider,'firebase');
  assert.strictEqual(uploads[1].file,original,'Firebase fallback must also send original file');
  assert.equal(uploads[1].metadata.contentType,'image/jpeg');
  assert.ok(uploads[1].path.startsWith('public-media/banners/'));
  shouldFailStorage=true;
  await assert.rejects(env.uploadOriginalQualityImage(original,'categories'),
    /لم يتم ضغط الصورة أو حفظ نسخة ضبابية/);
  await assert.rejects(env.uploadOriginalQualityImage({...original,size:16*1024*1024},'products'),
    /15MB/);
  await assert.rejects(env.uploadOriginalQualityImage({...original,type:'text/plain',name:'x.txt'},'products'),
    /غير مدعوم/);
  for(const [name,html] of [['admin',admin],['store',store]]){
    assert.ok(html.includes('await uploadOriginalQualityImage(file,\'products\''),name+' must upload products without compression');
    assert.ok(html.includes("await uploadOriginalQualityImage(pendingBannerFiles[i],'banners')"),name+' must preserve banner quality');
    assert.ok(html.includes("await uploadOriginalQualityImage(pendingCategoryFiles[card.id],'categories')"),name+' must preserve category quality');
    assert.ok(html.includes('else card.image=preserveExistingCategoryImage(card.image);'),name+' must not re-encode old categories on save');
    assert.ok(html.includes("imageMode:'external-original'"),name+' must label external original media');
    assert.ok(!html.includes('async function compressProductImage('),name+' must remove old 82KB JPEG compressor');
    assert.ok(!html.includes('async function compressCategoryImage('),name+' must remove old category 30KB JPEG compressor');
    assert.ok(!html.includes('TARGET_IMAGE_BYTES=62*1024'),name+' must drop old tiny file target');
  }
  assert.ok(admin.includes("savedData.images.every("),'Keep backend image verification');
  assert.ok(admin.includes('imageStocks,')&&admin.includes('const perImageTotal'),
    'Keep per-image inventory attached to photo identities');
  console.log('Original-image upload, Firebase fallback, no-loss failure and product/banner/category guards passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
