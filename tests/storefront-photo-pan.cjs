'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const open='<script id="kandorty-image-pinch-zoom">';
const i=html.indexOf(open),j=html.indexOf('</script>',i+open.length);
assert.ok(i>=0&&j>i,'zoom module exists');
const code=html.slice(i+open.length,j);
const listeners={stage:{},img:{},window:{}};
function emitter(which){
 return {dataset:{},addEventListener(event,handler){(listeners[which][event]??=[]).push(handler);}};
}
const stage=Object.assign(emitter('stage'),{
 clientWidth:400,clientHeight:600,
 getBoundingClientRect:()=>({left:0,top:0,width:400,height:600})
});
const img=Object.assign(emitter('img'),{
 naturalWidth:2000,naturalHeight:3000,
 style:{transition:'',transform:''},
 classList:{classes:new Set(),toggle(key,on){if(on)this.classes.add(key);else this.classes.delete(key);}}
});
let clock=1000;
const sandbox={
 document:{getElementById:key=>key==='imageViewerImg'?img:null,
  querySelector:query=>query==='#imageViewerModal .image-viewer-card'?stage:null},
 window:emitter('window'),Date:{now:()=>clock},console
};
vm.createContext(sandbox);vm.runInContext(code,sandbox);
const send=(name,touches,more={})=>{
 const event={touches,target:{closest:()=>null},preventDefault(){this.prevented=true;},...more};
 for(const handler of listeners.stage[name]||[])handler(event);
 return event;
};
const touch=(x,y)=>({clientX:x,clientY:y});
function num(name){return vm.runInContext(name,sandbox);}
assert.equal(num('kandortyImageZoom'),1,'image starts at original scale');
send('touchstart',[touch(200,300)]);send('touchend',[]);
clock=1220;
send('touchstart',[touch(200,300)]);
assert.equal(num('kandortyImageZoom'),2.5,'double tap must zoom the photo');
const gesture=send('touchmove',[touch(260,365)]);
assert.equal(gesture.prevented,true,'zoom pan must prevent document scrolling');
assert.equal(num('kandortyImageX'),60,'one finger pans horizontally');
assert.equal(num('kandortyImageY'),65,'one finger pans vertically');
assert.ok(img.style.transform.includes('translate3d(60px,65px,0) scale(2.5)'));
send('touchend',[]);
send('touchstart',[touch(140,200),touch(260,400)]);
send('touchmove',[touch(110,160),touch(300,440)]);
assert.ok(num('kandortyImageZoom')>2.5,'pinching outward must zoom more');
const zoomAfterPinch=num('kandortyImageZoom');
send('touchend',[touch(110,160)]);
send('touchmove',[touch(150,200)]);
assert.ok(num('kandortyImageZoom')===zoomAfterPinch,'one-finger pan after pinch must not change zoom');
send('touchmove',[touch(4000,-4000)]);
const bounds=vm.runInContext('photoPanLimits()',sandbox);
assert.ok(Math.abs(num('kandortyImageX'))<=bounds.x,'horizontal pan stays inside image');
assert.ok(Math.abs(num('kandortyImageY'))<=bounds.y,'vertical pan stays inside image');
vm.runInContext('resetImageZoom()',sandbox);
assert.equal(num('kandortyImageZoom'),1);
assert.equal(num('kandortyImageX'),0);
assert.equal(num('kandortyImageY'),0);
assert.ok(img.style.transform.includes('scale(1)'));
assert.ok(html.includes('id="kandorty-photo-pan-v2"'),'final mobile CSS must exist');
assert.ok(html.includes('object-fit:contain!important'),'fullscreen image must not crop its sides at 1x');
assert.ok(html.includes('env(safe-area-inset-top) + 30px'),'close button must be below safe-area');
assert.ok(html.includes('function closeFullscreenViewer(event)'),'close action must be preserved');
assert.ok(html.includes('function renderKandortyViewerDots()'),'image dots must be preserved');
assert.ok(html.includes('if(fullscreen&&(e.touches.length!==1||'),'carousel must not reset transform on pinch');
assert.ok(html.includes("if(fullscreen&&typeof kandortyImageZoom==='number'&&kandortyImageZoom>1.01){"),'carousel must defer to active pan');
assert.ok(html.includes("stage.addEventListener('touchcancel',()=>{"),'touchcancel must not clear zoom');
assert.ok(html.includes("resetImageZoom();\n}\n\nfunction renderProductGallery("),'closing the viewer must reset zoom');
console.log('Pinch/double-tap zoom, 2D finger panning, bounds, close position and carousel isolation: passed.');
