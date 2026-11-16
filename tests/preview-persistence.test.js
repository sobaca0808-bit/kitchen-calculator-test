'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../js/storage.js'),D=require('../js/drafts.js'),Diag=require('../js/persistence-diagnostics.js'),Transaction=require('../js/import-transaction.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const data=name=>({version:1,products:[{id:'rice',name,aliases:'',price:137.5,packQuantity:1,unit:'kg',massPerPiece:null,gramsPerMl:null,note:''}],recipes:[],folders:[{id:'rice-folder',name:'Кухня'}]});
function memory(entries=[]){const values=new Map(entries),ops=[];return {values,ops,getItem:key=>{ops.push(['get',key]);return values.get(key)??null;},setItem:(key,value)=>{ops.push(['set',key]);values.set(key,value);}};}
test('the existing source namespace stays fixed, with independent empty objects',()=>{
 assert.equal(S.KEY,'kitchen-calculator-pr2-browser-test-v1');assert.equal(D.KEY,'kitchen-calculator-pr2-browser-drafts-v1');const a=S.empty(),b=S.empty();a.products.push({id:'test'});assert.equal(b.products.length,0);
});
test('missing records stay missing and do not trigger a seeded write',()=>{
 const storage=memory();assert.deepEqual(S.snapshot(storage),{data:null,error:null,source:null});assert.deepEqual(S.load(storage),{data:null,error:null});assert.deepEqual([...storage.values],[]);assert(storage.ops.every(op=>op[0]==='get'));
});
test('corruption preserves exact bytes and exposes the original snapshot',()=>{
 for(const raw of ['{broken','{"version":2}','']){const storage=memory([[S.KEY,raw]]),loaded=S.snapshot(storage);assert(loaded.error);assert.equal(loaded.source,raw);assert.equal(storage.values.get(S.KEY),raw);assert(storage.ops.every(op=>op[0]==='get'));}
});
test('read denial does not initialize an empty replacement',()=>{
 const storage={getItem(){throw Error('SecurityError');},setItem(){throw Error('Unexpected write');}};assert.match(S.snapshot(storage).error,/SecurityError/);
});
test('prices, folders and future fields survive confirmed save and load',()=>{
 const storage=memory(),value={...data('Рис'),future:{keep:'owner'},packaging:[]};assert(S.save(value,storage,null).ok);assert.deepEqual(S.load(storage).data,value);assert.equal(storage.ops.filter(op=>op[0]==='set').length,1);
});
test('a stale expected source is rejected before a write',()=>{
 const raw=S.stringify(data('Новая запись')),storage=memory([[S.KEY,raw]]);const result=S.save(data('Старая вкладка'),storage,null);assert.equal(result.ok,false);assert.match(result.error,/другой вкладке/);assert.equal(storage.values.get(S.KEY),raw);assert(!storage.ops.some(op=>op[0]==='set'));
});
test('silent no-op storage is never reported as saved',()=>{
 const storage=memory([[S.KEY,S.stringify(data('Прежде'))]]);storage.setItem=()=>{};const result=S.save(data('Теперь'),storage);assert.equal(result.ok,false);assert(result.commitUncertain);assert.equal(S.load(storage).data.products[0].name,'Прежде');
});
test('read-back denial after a write is explicitly uncertain and keeps actual bytes',()=>{
 const storage=memory();let written=false;const get=storage.getItem,set=storage.setItem;storage.getItem=key=>{if(written)throw Error('Read-back denied');return get(key);};storage.setItem=(key,value)=>{set(key,value);written=true;};const result=S.save(data('Рис'),storage,null);assert.equal(result.ok,false);assert(result.commitUncertain);assert.equal(JSON.parse(storage.values.get(S.KEY)).products[0].price,137.5);
});
test('a real quota failure is distinct from an uncertain commit',()=>{
 const raw=S.stringify(data('Прежде')),storage=memory([[S.KEY,raw]]);storage.setItem=()=>{throw Error('QuotaExceededError');};const result=S.save(data('Теперь'),storage,raw);assert.equal(result.ok,false);assert(!result.commitUncertain);assert.equal(storage.values.get(S.KEY),raw);
});
test('drafts also detect silent no-op writes without clearing previous data',()=>{
 const storage=memory(),record={id:'unfinished',type:'dish',isNew:true,updatedAt:100,data:{id:'unfinished',type:'dish',name:'Не закончено',ingredients:[]},formValues:[],invalidValues:[],errors:[],details:[]};storage.setItem=()=>{};assert.equal(D.save(record,storage).ok,false);assert.equal(storage.values.get(D.KEY),undefined);
});
test('diagnosis is explicit, read-only and never aliases distinct namespaces',()=>{
 const root='kitchen-calculator-v1',preview='kitchen-calculator-preview-v1',entries=[[S.KEY,S.stringify(data('Текущая'))],[preview,S.stringify(data('Preview'))],[root,S.stringify(data('Рабочая'))]],storage=memory(entries),sources=Diag.inspect(storage);assert.equal(new Set(sources.map(s=>s.key)).size,sources.length);assert.equal(sources[0].key,S.KEY);assert.equal(sources.find(s=>s.key===preview).data.products[0].name,'Preview');assert.deepEqual([...storage.values],entries);assert(storage.ops.every(op=>op[0]==='get'));
});
test('a broken foreign source is available raw without blocking a valid current source',()=>{
 const preview='kitchen-calculator-preview-v1',raw='{foreign broken',storage=memory([[S.KEY,S.stringify(data('Своя'))],[preview,raw]]),sources=Diag.inspect(storage);assert(sources[0].data);assert.equal(sources.find(s=>s.key===preview).raw,raw);assert(sources.find(s=>s.key===preview).error);assert.equal(storage.values.get(preview),raw);
});
test('a changed donor source blocks a stale recovery preview',()=>{
 const storage=memory([[S.KEY,S.stringify(data('Своя'))]]),source=Diag.inspect(storage)[0];storage.values.set(S.KEY,S.stringify(data('Изменено')));assert.throws(()=>Diag.unchanged(source,storage),/изменился/);
});
test('portable diagnostics use exactly the selected photo database and never write',async()=>{
 const storage=memory([[S.KEY,S.stringify(data('Своя'))]]),source=Diag.inspect(storage)[0],seen=[];
 const portable=await Diag.portable(source,{storage,photos:{exportData:async(value,reader)=>{await reader('local-photo');return value;}},read:async(db,id)=>{seen.push([db,id]);return {};}});assert.deepEqual(portable,data('Своя'));assert.deepEqual(seen,[[source.photoDB,'local-photo']]);assert(storage.ops.every(op=>op[0]==='get'));
});
for(const uncertain of [false,true])test('import photo rollback respects '+(uncertain?'uncertain committed references':'an actual failed write'),async()=>{
 const storage=memory(),backups=new Map(),rolled=[];let afterWrite=false;
 const get=storage.getItem;storage.getItem=key=>{if(afterWrite)throw Error('Read-back unavailable');return get(key);};
 storage.setItem=(key,value)=>{if(!uncertain)throw Error('QuotaExceededError');storage.values.set(key,value);afterWrite=true;};
 const photos={exportData:async value=>clone(value),prepareImport:async value=>{const copy=clone(value);let created=[];for(const recipe of copy.recipes)if(recipe.photo){delete recipe.photo;recipe.photoId='staged-photo';created.push('staged-photo');}return {data:copy,createdIds:created};},rollback:async ids=>rolled.push(...ids)};
 const service=Transaction.create({storage,photos,backups:{put:async r=>backups.set(r.id,r),get:async id=>backups.get(id),list:async()=>[],remove:async()=>{}},locks:null});
 const incoming={version:1,products:[],recipes:[{id:'dish',type:'dish',name:'Новое блюдо',note:'',actualYield:null,ingredients:[],photo:{mime:'image/jpeg',width:1,height:1,dataUrl:'data:image/jpeg;base64,/9j/2Q=='}}]};
 await assert.rejects(service.apply({candidate:incoming,currentState:S.empty(),expectedSource:null,mode:'merge'}),uncertain?/не подтвердил/:/Импорт не сохранён/);assert.equal(backups.size,1);
 assert.deepEqual(rolled,uncertain?[]:['staged-photo']);if(uncertain)assert.equal(JSON.parse(storage.values.get(S.KEY)).recipes[0].photoId,'staged-photo');else assert(!storage.values.has(S.KEY));
});
