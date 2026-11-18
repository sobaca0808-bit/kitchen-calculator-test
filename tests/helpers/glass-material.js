'use strict';
const assert=require('node:assert/strict');
// Updated visual contract for functional suites that also inspect the surround.
// Calculation, JSON, photo and print assertions in those suites stay unchanged.
async function assertGlassMaterial(page){
 const info=await page.evaluate(async()=>{
  const glass=document.documentElement.hasAttribute('data-sintez-glass'),body=getComputedStyle(document.body,'::before'),response=await fetch('assets/sintez-glass.css');
  return{glass,image:body.backgroundImage,repeat:body.backgroundRepeat,width:innerWidth,status:response.status,type:response.headers.get('content-type'),bytes:(await response.arrayBuffer()).byteLength,panel:getComputedStyle(document.querySelector('.editor'),'::before').backgroundColor,field:getComputedStyle(document.querySelector('#view-portions')).backgroundColor};
 });
 assert(info.glass);assert.match(info.image,info.width<=760?/sintez-glass-kitchen-mobile\.webp/:/sintez-glass-kitchen\.webp/);
 assert(info.repeat.split(',').every(value=>value.trim()==='no-repeat'),'The single kitchen scene has no tiled repeats');
 assert.equal(info.status,200);assert.match(info.type,/text\/css/);assert(info.bytes>0&&info.bytes<35*1024,'Shared screen styles remain lightweight');
 assert.match(info.panel,/^rgba\(/,'The editor retains its translucent background layer');assert.match(info.field,/^rgba\(/,'Fields use the same palette and material');
}
module.exports={assertGlassMaterial};
