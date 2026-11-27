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

const vm2=require('node:vm');
function extract(src,first,last){
  const a=src.indexOf(first),b=src.indexOf(last,a);
  assert.ok(a>=0&&b>a,'Missing source under test: '+first);
  return src.slice(a,b);
}
for (const snippet of [
  'function reconcileCartWithProducts()',
  'const n=cartData().reduce(',
  'reconcileCartWithProducts();',
  'note.hidden=!value||!cartData().length;',
  'function productVideoDeliveryUrl(source)',
  "video.preload='auto'",
  "video.src=productVideoDeliveryUrl(currentProductVideoUrl)",
  'video.dataset.fallbackTried',
  'function homeVideoCandidates()',
  'function loadHomeVideoCandidate(index)',
  'homeVideoCloudinaryOriginalUrl',
  'showHomeVideoFeedback(',
  'homeVideoPlayback.timeout=setTimeout('
]){
  assert.ok(store.includes(snippet),'Missing video/cart reliability fix: '+snippet);
}
const makeElement=()=>({
  textContent:'',hidden:false,
  style:{setProperty(){}},
  classList:{toggle(){}}
});
const cartEls=Object.fromEntries(['cartCount','cartFloatingGroup','cartBtn','kandortyMenuCartCount','kandortyMenuCartBtn','kdHeaderCartCount'].map(id=>[id,makeElement()]));
const cartVM={
  products:[{id:'in-store'}],
  cart:[{id:'deleted',qty:35},{id:'in-store',qty:2}],
  CART_KEY:'kandorty_cart_v1',
  $:id=>cartEls[id],
  localStorage:{setItem(k,value){this[k]=value;}},
  renderCart(){},
  window:{renderCartCustomNote(){}},
  console
};
cartVM.cartData=()=>cartVM.cart.map(item=>({item,product:cartVM.products.find(p=>p.id===item.id)})).filter(row=>row.product);
const cartSrc=extract(store,'function reconcileCartWithProducts(){','function cartData(){');
vm2.runInNewContext(cartSrc,cartVM);
cartVM.reconcileCartWithProducts();
assert.equal(cartVM.cart.length,1,'stale saved product removed only after authoritative snapshot');
assert.equal(cartEls.cartCount.textContent,'2','badge counts real items');
assert.equal(cartEls.kdHeaderCartCount.textContent,'2','Header cart follows live valid quantities');
assert.equal(cartEls.kdHeaderCartCount.hidden,false,'Header cart shows count for nonempty baskets');
assert.equal(cartEls.cartBtn.hidden,false);
cartVM.cart=[{id:'deleted',qty:35}];
cartVM.reconcileCartWithProducts();
assert.equal(cartVM.cart.length,0);
assert.equal(cartEls.cartCount.textContent,'0','empty cart must not show 35');
assert.equal(cartEls.cartBtn.hidden,true,'empty floating cart must be hidden');
assert.equal(cartEls.kandortyMenuCartBtn.hidden,true,'empty menu cart shortcut must be hidden');
assert.equal(cartEls.kdHeaderCartCount.textContent,'0','Header cart quantity must reset to zero when empty');
assert.equal(cartEls.kdHeaderCartCount.hidden,true,'Header cart must hide the zero badge without hiding the basket button');
const headerBag=store.match(/<button id="kdHeaderCartBtn"[\s\S]*?<\/button>/)?.[0]||'';
assert.ok(headerBag.includes('Minimal boutique shopping-bag icon'), 'New boutique-style bag shape is required');
assert.ok(headerBag.includes('M5.25 8.5h13.5l1 11.5H4.25l1-11.5Z'), 'Header icon must be a bag, not the original basket');
assert.ok(!headerBag.includes('M4 10h16l-1.5 10h-13L4 10Z'), 'The old grocery basket must be replaced');

for(const required of [
 'id="kdHeaderCartBtn"',
 'id="kdHeaderCartCount"',
 'kandorty-header-cart-shortcut-20261127',
 "function openHeaderCart(){",
 "onclick=\"openHeaderCart()\"",
 "headerCount.hidden=n===0",
 "headerCount.textContent=String(n)"
])assert.ok(store.includes(required),'Missing new header basket UI: '+required);
assert.ok(store.includes("if(typeof window.renderCartCustomNote==='function')window.renderCartCustomNote()"),'Cart note must refresh after add/remove');
const videoStart=store.indexOf('function productVideoDeliveryUrl(source){');
const videoEnd=store.indexOf('function playSelectedProductVideo(){',videoStart);
assert.ok(videoStart>=0&&videoEnd>videoStart);
const videoVM={};
vm2.runInNewContext(store.slice(videoStart,videoEnd),videoVM);
const raw='https://res.cloudinary.com/test/video/upload/v12345/catalog/item.mp4';
const optimized='https://res.cloudinary.com/test/video/upload/c_limit,w_720/q_auto:good/f_mp4/v12345/catalog/item.mp4';
assert.equal(videoVM.productVideoDeliveryUrl(raw),optimized);
assert.equal(videoVM.productVideoDeliveryUrl('https://res.cloudinary.com/test/video/upload/q_auto,f_auto/v12345/catalog/item.mp4'),optimized);
assert.equal(videoVM.productVideoDeliveryUrl('https://storage.googleapis.com/catalog/clip.mp4'),'https://storage.googleapis.com/catalog/clip.mp4');
const homeStart=store.indexOf('function homeVideoCandidates(){');
const homeEnd=store.indexOf('function clearHomeVideoTimer(){',homeStart);
assert.ok(homeStart>=0&&homeEnd>homeStart);
const homeVM={
  settings:{homeVideoCloudinaryOriginalUrl:raw},
  getGithubHomeVideoUrl:()=>raw.replace('/video/upload/','/video/upload/q_auto,f_auto/')
};
vm2.runInNewContext(store.slice(homeStart,homeEnd),homeVM);
assert.deepEqual(Array.from(homeVM.homeVideoCandidates()),[raw.replace('/video/upload/','/video/upload/q_auto,f_auto/'),raw]);
const productVideoBranch=extract(store,'  if(showingVideo){','  }else{\n    gallery.querySelector');
assert.ok(!productVideoBranch.includes('playSelectedProductVideo();'),'Product video must not autoplay when selected');
assert.ok(!productVideoBranch.includes('video.preload=\'metadata\''),'Video should preload enough data to play smoothly');
console.log('Homepage original-video fallback, optimized product video and stale 35-cart badge regression checks passed.');

for(const snippet of [
  'id="kdHomeVideoPlay"',
  'onclick="toggleHomeVideoByTap()"',
  'function toggleHomeVideoByTap()',
  "video.addEventListener('click',toggleHomeVideoByTap)",
  "video.autoplay=true;video.setAttribute('autoplay','')",
  "const logo=document.querySelector('header.top img.logo')",
  "function ensureKdBrandMediaLoader(host)",
  "function installKdBrandMediaLoaders()",
  "stage.classList.toggle('kd-brand-wait'",
  "stage.classList.remove('kd-photo-pending','kd-brand-wait')",
  "mediaStage.classList.toggle('kd-video-buffering'",
  "stage?.classList.add('kd-video-buffering')",
  "section.classList.add('kd-video-buffering')",
  'kandorty-branded-media-loading',
  'kdBrandBreathing',
  "classList.remove('kd-card-loading')"
]){
 assert.ok(store.includes(snippet),'Missing logo media loading or no-autoplay feature: '+snippet);
}
assert.ok(/<video id="homeVideo"[^>]*autoplay\b[^>]*muted\b/i.test(store),
  'Homepage video should autoplay muted, without sound');
const readySrc=extract(store,'function homeVideoReady(){','function loadHomeVideoCandidate(index){');
let autoPlayCalls=0;
const readyVideo={
  readyState:2, classList:{add(){}}, getAttribute:()=>'/home-video.mp4',
  play(){autoPlayCalls++;return Promise.resolve();}
};
const readyStage={classList:{remove(){}}};
let readyButtonCalls=0;
const readyCtx={
 settings:{homeVideoEnabled:true},
 homeVideoPlayback:{playAttemptedFor:''},
 $:id=>id==='homeVideo'?readyVideo:id==='homeVideoSection'?readyStage:null,
 clearHomeVideoTimer(){},
 showHomeVideoFeedback(){},
 syncHomeVideoPlayButton(){readyButtonCalls++},
 console
};
vm2.runInNewContext(readySrc,readyCtx);
readyCtx.homeVideoReady();
readyCtx.homeVideoReady();
assert.equal(autoPlayCalls,1,'Homepage video should autoplay once, not restart after repeated canplay');
assert.equal(readyButtonCalls,2,'Playback state control should synchronize when ready');
assert.ok(store.includes('0%,100%{opacity:.22;transform:translate3d'),
  'Kandorty logo must be translucent and gently moving');
assert.ok(store.includes('50%{opacity:.42;transform:translate3d'),
  'Animated logo should pulse without becoming opaque');
assert.ok(!store.includes("content:'جارٍ التحميل...'"),
  'Products must not show a loading text caption');
assert.ok(store.includes('content:none!important;display:none!important;'),
  'Loading caption pseudo-elements must be hidden');
assert.ok(productVideoBranch.includes('video.preload=\'auto\''),
  'Product video should retain buffering improvements without autoplay');
console.log('Homepage video starts muted automatically once; product media loader shows only a translucent moving Kandorty logo.');

for(const snippet of [
  'kandorty-product-video-no-black-screen',
  "background:#f8f6f7!important;",
  "background:transparent!important;",
  "function productVideoFramePosterUrl(source)",
  "const firstFramePoster=productVideoFramePosterUrl(currentProductVideoUrl);",
  "if(firstFramePoster)video.poster=firstFramePoster;",
  "else video.removeAttribute('poster');",
  "mediaStage.querySelector('.kd-product-video-poster')?.remove();",
  "video.dataset.playedInCurrentSlide='0'",
  "video.dataset.playedInCurrentSlide='1'",
  "video.classList.add('kd-video-frame-ready')",
  "video.classList.remove('kd-video-frame-ready')",
  "content:''!important;",
  "background-image:url(\"data:image/svg+xml",
  "d='M13 7L34 20L13 33Z'"
]){
  assert.ok(store.includes(snippet),'Missing own-video first-frame poster or centered play icon: '+snippet);
}
assert.ok(!store.includes('function ensureProductVideoPoster()'),
  'The video preview must not reuse a different product photo');
assert.ok(!store.includes('ensureProductVideoPoster();'),
  'Product photos must not be used as paused video posters');
const posterFn=extract(store,'function productVideoFramePosterUrl(source){','function syncProductVideoControl(){');
const posterVM={};
vm2.runInNewContext(posterFn,posterVM);
const videoBase='https://res.cloudinary.com/demo/video/upload/';
const truePoster=videoBase+'so_0,c_limit,w_720,q_auto:good/v12345/products/demo.jpg';
assert.equal(posterVM.productVideoFramePosterUrl(videoBase+'v12345/products/demo.mp4'),truePoster);
assert.equal(posterVM.productVideoFramePosterUrl(videoBase+'c_limit,w_720/q_auto:good/f_mp4/v12345/products/demo.mp4'),truePoster);
assert.equal(posterVM.productVideoFramePosterUrl(videoBase+'v12345/products/demo.mov'),truePoster);
assert.equal(posterVM.productVideoFramePosterUrl('https://example.com/media/item.mp4'),'');
console.log('Product paused preview now uses a still from that exact video, never a neighboring product photo.');

for(const snippet of [
  'className=\'kd-video-first-frame\'',
  'function ensureProductVideoFirstFrame(source)',
  'function clearProductVideoFirstFrame()',
  "ensureProductVideoFirstFrame(currentProductVideoUrl);",
  "stage.classList.add('kd-video-still-ready')",
  "still.classList.add('kd-video-still-visible')",
  "clearProductVideoFirstFrame();",
  ".kd-video-first-frame.kd-video-still-visible"
]){
  assert.ok(store.includes(snippet),'Real first frame image overlay missing: '+snippet);
}
const stillSrc=extract(store,'let kdVideoFirstFrameToken=0;','function syncProductVideoControl(){');
const makeClasses=()=>({
  values:new Set(),
  add(k){this.values.add(k);},
  remove(k){this.values.delete(k);},
  contains(k){return this.values.has(k);}
});
let firstFrame=null;
const stillStage={
  classList:makeClasses(),
  querySelector:()=>firstFrame,
  appendChild(node){firstFrame=node;}
};
const firstFrameVideo={dataset:{playedInCurrentSlide:'0'}};
const frameEnv={
  $:id=>id==='modalGallery'?{querySelector:()=>stillStage}:id==='modalProductVideo'?firstFrameVideo:null,
  document:{
    createElement:()=>({
      className:'',alt:'',decoding:'',naturalWidth:1200,dataset:{},classList:makeClasses(),
      attributes:{},setAttribute(k,v){this.attributes[k]=v;},
      getAttribute(k){return this.attributes[k]||this[k]||null;},
      removeAttribute(k){delete this[k];delete this.attributes[k];}
    })
  },
  currentProductVideoUrl:'video-1',
  isCurrentProductVideo:()=>true,
  productVideoFramePosterUrl:()=>'/video-1-frame.jpg',
  console
};
vm2.runInNewContext(stillSrc,frameEnv);
frameEnv.ensureProductVideoFirstFrame('video-1');
assert.equal(firstFrame.src,'/video-1-frame.jpg','Video still source must load');
assert.equal(firstFrame.classList.contains('kd-video-still-visible'),false,'First frame stays hidden until loaded');
firstFrame.onload();
assert.equal(firstFrame.classList.contains('kd-video-still-visible'),true,'Loaded video first frame becomes visible');
assert.equal(stillStage.classList.contains('kd-video-still-ready'),true,'Logo overlay hides once first frame is visible');
frameEnv.clearProductVideoFirstFrame();
assert.equal(firstFrame.classList.contains('kd-video-still-visible'),false,'Video still removed on slide switch or playback');
assert.equal(stillStage.classList.contains('kd-video-still-ready'),false,'No stale video frame on new product');
console.log('Real video first-frame image becomes visible after load, without showing white blank area.');
const catalogStyle=store.split('<style id="kandorty-compact-storefront-product-cards">')[1].split('</style>')[0];
assert.ok(catalogStyle.includes('object-fit:contain!important;'),'Catalog product photos must be contained rather than cropped');
assert.ok(!catalogStyle.includes('object-fit:cover!important;'),'No card photo may use cover cropping');
const uncroppedStyle=store.split('<style id="kandorty-uncropped-catalog-thumbnails-20261127">')[1]?.split('</style>')[0]||'';
assert.ok(uncroppedStyle.includes('aspect-ratio:3 / 4!important;'),'Catalog card should use a portrait photo frame');
assert.ok(uncroppedStyle.includes('object-fit:contain!important;'),'Complete thumbnail should be visible before tap');
assert.ok(uncroppedStyle.includes('object-position:center center!important;'));
console.log('Uncropped catalog thumbnails show the entire product before the card is tapped.');







