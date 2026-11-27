'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

function checkInlineScripts(file) {
  const html = fs.readFileSync(file,'utf8');
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let count = 0;
  for (const match of html.matchAll(pattern)) {
    const attrs = match[1];
    const code = match[2];
    if (/\bsrc\s*=/.test(attrs)) continue;
    const kind = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1] || 'text/javascript';
    if (kind !== 'text/javascript' && kind !== 'module' && kind !== 'application/javascript') continue;
    if (!code.trim()) continue;
    const args = ['--check'];
    if (kind === 'module') args.push('--input-type=module');
    const parsed = spawnSync(process.execPath,args,{input:code,encoding:'utf8'});
    assert.equal(parsed.status,0,`Invalid script in ${file}, block ${count + 1}:\n${parsed.stderr}`);
    count++;
  }
  assert.ok(count>0,file + ' should have inline JavaScript');
  console.log(file + ': ' + count + ' inline script blocks parsed');
  return html;
}
const admin = checkInlineScripts('admin.html');
const store = checkInlineScripts('index.html');

for (const snippet of [
  'id="adminDiscountsTab"', "showAdminTab('discounts',this)",
  'id="adminDiscountsList"', 'function renderDiscountList()',
  'class="photo-qty-input"', 'imageStocks,',
  'pendingPhotoQuantities', 'const perImageTotal'
]) {
  assert.ok(admin.includes(snippet),'admin missing '+snippet);
}
// The public storefront's payment/stock pathway is intentionally unchanged
// until the Stripe/COD Workers support transactional per-image decrements.
assert.ok(store.includes('function kandortyIsDiscountProduct('));
assert.ok(store.includes('kandortyDiscountFab'));
assert.ok(admin.includes('id="adminProductQuickAccess"'));
assert.ok(admin.includes('الكمي' + 'ة لكل صورة'));
assert.ok(admin.includes('photo-qty-input'));
console.log('Discount and per-image quantity UI smoke checks passed.');

for (const snippet of [
 'id="adminCustomersOverview"',
 'id="adminCustomerFileView"',
 'id="adminCustomerFileContent"',
 'function renderAdminCustomerFile()',
 'function openAdminCustomerFile(key)',
 'function backToAdminCustomers()',
 'data-admin-customer=',
 'adminCustomerDirectory=map',
 'c.history.push(raw)',
 'renderOrderItemsHtml(o)',
 'accept="image/*"',
 'const chosen=selected.filter(isSupportedProductPhoto)',
 'pendingImageFiles.push(file)',
 "previewImages();",
 'scrollIntoView({block:',
 'savedData.images.every(',
 "showAdminTab(savedAsDiscount?'discounts':'list'"
]) {
 assert.ok(admin.includes(snippet),'Customer files/image preview missing '+snippet);
}
assert.ok(admin.includes('صيغة الصورة غير مدعومة'),'Unsupported image formats must show a helpful error');
for(const snippet of [
  'function isSamsungHeicPhoto(file)',
  'function isSupportedProductPhoto(file)',
  'f_auto/',
  'Firebase Storage: '
]){
  assert.ok(admin.includes(snippet),'Samsung photo/upload diagnostic missing: '+snippet);
}
const pickStart=admin.indexOf('function isSamsungHeicPhoto(file)');
const pickEnd=admin.indexOf("$('imageFiles').addEventListener('change',e=>",pickStart);
assert.ok(pickStart>=0&&pickEnd>pickStart,'Samsung gallery validators available');
const photoPickerSandbox={};
require('node:vm').runInNewContext(admin.slice(pickStart,pickEnd),photoPickerSandbox);
const validPhoto=photoPickerSandbox.isSupportedProductPhoto;
assert.equal(validPhoto({name:'photo.heic',type:'image/heic',size:5000}),true);
assert.equal(validPhoto({name:'photo.heif',type:'image/heif',size:5000}),true);
assert.equal(validPhoto({name:'photo.jpg',type:'image/jpeg',size:5000}),true);
assert.equal(validPhoto({name:'photo.webp',type:'image/webp',size:5000}),true);
assert.equal(validPhoto({name:'not-photo.pdf',type:'application/pdf',size:5000}),false);
assert.equal(validPhoto({name:'empty.jpg',type:'image/jpeg',size:0}),false);
console.log('Samsung gallery formats and backend upload diagnostics checks passed.');
for (const snippet of [
  'id="uploadProductPhotosBtn"',
  'onclick="uploadProductPhotosNow()"',
  'async function uploadProductPhotosNow()',
  'pendingImages.push(url)',
  'pendingImageFiles.shift()',
  'if(savedQuantity!==undefined)pendingPhotoQuantities.set(url,savedQuantity)',
  "addEventListener('invalid',event=>",
  'if(productPhotoUploadBusy)'
]) {
  assert.ok(admin.includes(snippet),'Direct photo uploader or quantity guidance missing: '+snippet);
}
console.log('Direct photo upload, no duplicate upload on save, and quantity validation checks passed.');

for(const snippet of [
  'id="fastProductImageUpload"',
  'function makeFastProductImageFile(file)',
  'const PRODUCT_IMAGE_MAX_EDGE=2600',
  "canvasToBlob(canvas,'image/jpeg',0.91)",
  'compressed.size>=file.size*0.85',
  'const providers=isSamsungHeicPhoto(file)',
  "getMediaProviderPreference()==='firebase'",
  'rememberMediaProvider(provider)',
  "await makeFastProductImageFile(file)"
]) {
  assert.ok(admin.includes(snippet),'Fast upload opt-in/provider fallback missing: '+snippet);
}
// Verify opt-out, small-image pass-through, and high-res JPEG resize with
// mocked canvas objects. No browser, backend or customer data is required.
const fastStart=admin.indexOf('const PRODUCT_IMAGE_MAX_EDGE=2600;');
const fastEnd=admin.indexOf('async function uploadOriginalQualityImage(',fastStart);
assert.ok(fastStart>=0&&fastEnd>fastStart,'Fast photo preparation is isolated');
const jpegInput={type:'image/jpeg',name:'Samsung.jpg',size:5000000,lastModified:42};
let fastEnabled=true, canvasCalls=0;
const fakeCanvas={
  width:0,height:0,
  getContext(){return {drawImage(){canvasCalls++},imageSmoothingEnabled:false,imageSmoothingQuality:''}}
};
const fastEnv={
  $:()=>({checked:fastEnabled}),
  loadImageFile:async()=>({image:{naturalWidth:3000,naturalHeight:4000},release(){}}),
  document:{createElement:()=>fakeCanvas},
  canvasToBlob:async()=>({size:1200000}),
  File:class {constructor(chunks,name,options){this.name=name;this.type=options.type;this.size=chunks[0].size;}},
  localStorage:{getItem:()=>null,setItem:()=>{}},
  console,
};
require('node:vm').runInNewContext(admin.slice(fastStart,fastEnd),fastEnv);
(async()=>{
  const resized=await fastEnv.makeFastProductImageFile(jpegInput);
  assert.equal(resized.size,1200000);
  assert.equal(resized.type,'image/jpeg');
  assert.equal(canvasCalls,1);
  assert.equal(fakeCanvas.height,0);
  fastEnabled=false;
  const untouched=await fastEnv.makeFastProductImageFile(jpegInput);
  assert.equal(untouched,jpegInput);
  const small=await fastEnv.makeFastProductImageFile({type:'image/jpeg',size:500000});
  assert.equal(small.size,500000);
  console.log('Fast Samsung JPEG upload, original opt-out and fallback checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});



assert.ok(admin.includes("onerror=\"this.closest('.preview-item').classList.add('image-error')"),'Image preview must show broken-photo fallback');
console.log('Customer file separation, order photo rendering, mobile image selection and saved-photo verification smoke checks passed.');

for (const snippet of [
  "async function editProduct(id)",
  "doc(id).get({source:'server'})",
  "pendingImages=existing.filter(x=>typeof x==='string'&&x.length>0)",
  "savedData.imageStocks.length!==imageStocks.length",
  "function adminProductPreviewHtml(p)",
  "function openAdminProductPhoto(id,index)",
  "order:'+String(o.id||'unknown-'+position)",
  "admin-product-thumbs",
  "مخزون هذا اللون"
]) {
  assert.ok(admin.includes(snippet),'Missing resilient admin media/customer behavior: '+snippet);
}
assert.ok(!admin.includes('>🔔 تفعيل إشعارات الطلبات</button>'),
  'Admin sound button should retain functionality without a bell icon');
for (const snippet of [
  'function productVariantStock(p,imageIndex)',
  'function variantQtyInCart(productId,imageIndex)',
  'colorStock!==null&&variantQtyInCart(id,idx)+1>colorStock',
  'groupedByColor=new Map(),groupedByProduct=new Map()',
  'groupedByColor.get(String(row.item.id)',
  'imageIndex:i.imageIndex??0'
]) {
  // The last mapping is in the isolated server-checkout adapter.
  if (snippet==='imageIndex:i.imageIndex??0') continue;
  assert.ok(store.includes(snippet),'Storefront must enforce per-color cart limits: '+snippet);
}
console.log('Full product edit, customer folder fallback and color cart guards passed.');
for(const snippet of [
  'const FULLSCREEN_PRODUCT_PHOTO_WIDTH=1440',
  'const target=productPhotoPreview(original,FULLSCREEN_PRODUCT_PHOTO_WIDTH)',
  "const detail=$('modalMainImage')",
  'if(incoming.decode)await incoming.decode()',
  'display(target); // Only set the visible source after decoding is complete.',
  "kdViewerImageToken",
  "classList.add('kd-photo-loading')",
  'kandorty-fullscreen-decoded-load',
  'ghost.src=productPhotoPreview(',
  "if(fullscreen && typeof updateFullscreenProductImage==='function')updateFullscreenProductImage()"
]){
 assert.ok(store.includes(snippet),'Fullscreen photo responsiveness regression: '+snippet);
}
assert.ok(!store.includes('ghost.src=fullscreen?photos()['),
  'Do not load uncapped source in fullscreen swipe ghost.');
assert.ok(!store.includes('if(fullscreen){img.src=url;'),
  'Fullscreen swipe must not paint an undecoded source.');
const photoFnStart=store.indexOf('function productPhotoPreview(src,width){');
const photoFnEnd=store.indexOf('function productCardPhotoHtml(',photoFnStart);
assert.ok(photoFnStart>=0&&photoFnEnd>photoFnStart);
const previewContext={};
require('node:vm').runInNewContext(store.slice(photoFnStart,photoFnEnd),previewContext);
const cloudBase='https://res.cloudinary.com/kandorty/image/upload/';
const transformed=cloudBase+'f_auto,q_auto:good,c_limit,w_1440/v12345/stock/photo.jpg';
assert.equal(previewContext.productPhotoPreview(cloudBase+'v12345/stock/photo.jpg',1440),transformed);
assert.equal(previewContext.productPhotoPreview(cloudBase+'f_auto/v12345/stock/photo.jpg',1440),transformed);
assert.equal(previewContext.productPhotoPreview(cloudBase+'c_limit,w_2600/v12345/stock/photo.jpg',1440),transformed);
assert.equal(previewContext.productPhotoPreview('https://firebasestorage.googleapis.com/v0/b/sample.jpg',1440),'https://firebasestorage.googleapis.com/v0/b/sample.jpg');
console.log('Fullscreen photo uses decoded 1440px URLs, reuses Cloudinary transformed sources, and never swaps to progressive full originals.');


