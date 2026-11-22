'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const source=fs.readFileSync('index.html','utf8');
function fn(name){
 const regex=new RegExp('function '+name+'\\([^\\n]*?\\)\\{[\\s\\S]*?\\n\\}','g');
 const found=[...source.matchAll(regex)];
 assert.equal(found.length,1,'Expected one '+name+' in index.html');
 return found[0][0];
}
for(const name of ['productVariantStock','variantQtyInCart','selectedColorStockMessage',
 'cartVariantIndex','cartVariantKey','productQtyInCart','addToCart','changeCartQty','hasManagedStock','getProductStock']){
 assert.ok(source.includes('function '+name+'('));
}
const names=['hasManagedStock','getProductStock','productVariantStock','variantQtyInCart',
 'selectedColorStockMessage','cartVariantIndex','cartVariantKey','productQtyInCart',
 'addToCart','changeCartQty'];
const ctx={
 products:[{id:'dress',stock:9,totalStock:9,images:['red','blue','black'],imageStocks:[3,3,3],active:true}],
 cart:[],lang:'ar',messages:[],saved:0,
 alert(message){this.messages.push(message);},
 isSoldOut(p){return p.stock<=0;},
 unavailableLabel(){return 'نفد المنتج';},
 saveCart(){this.saved++;},
 $(){return {classList:{contains(){return true;}}};}
};
vm.createContext(ctx);
vm.runInContext(names.map(fn).join('\n'),ctx);
function run(expr){return vm.runInContext(expr,ctx);}
function qty(index){return run('variantQtyInCart("dress",'+index+')');}
for(let i=0;i<3;i++)run('addToCart("dress",0,true)');
assert.equal(qty(0),3);
run('addToCart("dress",0,true)');
assert.equal(qty(0),3,'cannot borrow another color stock');
assert.equal(ctx.messages.length,1,'fourth piece is rejected with a stock warning');
for(let i=0;i<2;i++)run('addToCart("dress",1,true)');
assert.equal(qty(1),2);
run('changeCartQty(1,1)');
assert.equal(qty(1),3);
run('changeCartQty(1,1)');
assert.equal(qty(1),3,'cart plus button cannot overdraw color');
for(let i=0;i<3;i++)run('addToCart("dress",2,true)');
assert.equal(qty(2),3);
assert.equal(run('productQtyInCart("dress")'),9,'all three colors total nine units');
run('changeCartQty(0,-1)');
run('addToCart("dress",0,true)');
assert.equal(qty(0),3,'a freed unit can be added again');
ctx.products[0].imageStocks=[5,3,3];
assert.equal(run('productVariantStock(products[0],0)'),0,'invalid aggregate fails closed');
ctx.products[0].imageStocks=undefined;
assert.equal(run('productVariantStock(products[0],0)'),null,'legacy products retain aggregate inventory logic');
assert.ok(source.includes('groupedByColor.get(String(row.item.id)'));
assert.ok(source.includes('insufficient_variant_stock'));
console.log('Per-color cart selection, plus/minus, invalid inventory and legacy scenarios passed.');