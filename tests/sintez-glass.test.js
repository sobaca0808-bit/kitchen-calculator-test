'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../js/appearance.js'),'utf8');
function boot(value,{glass=true,denied=false}={}){
  const writes=[],reads=[],attributes={},data=new Map(value===undefined?[]:[['kitchen-calculator-appearance-test-v1',value]]);
  const context={document:{readyState:'loading',documentElement:{dataset:glass?{defaultKitchenTheme:'graphite'}:{},setAttribute(k,v){attributes[k]=v;},removeAttribute(k){delete attributes[k];}},querySelector(){return {};},addEventListener(){}},localStorage:{getItem(k){reads.push(k);if(denied)throw Error('Denied');return data.get(k)??null;},setItem(k,v){writes.push([k,v]);data.set(k,v);}}};
  vm.createContext(context);vm.runInContext(script,context);return{api:context.KitchenAppearance,writes,reads,data,attributes};
}
test('fresh glass entry is dark without writing any preference or recipe data',()=>{const s=boot();assert.equal(s.api.current(),'graphite');assert.equal(s.attributes['data-kitchen-theme'],'graphite');assert.equal(s.writes.length,0);assert.deepEqual(s.reads,[s.api.KEY]);});
for(const theme of ['berry','sage','graphite'])test('existing '+theme+' preference survives glass startup without rewrites',()=>{const s=boot(theme);assert.equal(s.api.current(),theme);assert.equal(s.data.get(s.api.KEY),theme);assert.equal(s.writes.length,0);});
test('invalid or denied preference gives recoverable dark appearance without deleting its source',()=>{for(const opts of [{},{denied:true}]){const s=boot('{not a preference',opts);assert.equal(s.api.current(),'graphite');assert.equal(s.writes.length,0);assert.equal(s.data.get(s.api.KEY),'{not a preference');}});
test('non-glass entry keeps the previous berry default',()=>{assert.equal(boot(undefined,{glass:false}).api.current(),'berry');});
test('switching any palette uses only the existing appearance key',()=>{const s=boot();for(const theme of ['berry','sage','graphite'])assert(s.api.select(theme).ok);assert.equal(s.writes.length,3);assert(s.writes.every(([k])=>k===s.api.KEY));assert.equal(s.api.select('__proto__').ok,false);assert.equal(s.writes.length,3);});
test('new styles have no print selectors or remote assets and do not add calculation code',()=>{const css=fs.readFileSync(path.join(__dirname,'../assets/sintez-glass.css'),'utf8');assert.doesNotMatch(css,/@media\s+print|https?:|@import|animation\s*:/);assert.match(css,/prefers-reduced-transparency/);assert.match(css,/forced-colors/);assert.match(css,/@supports not/);});
