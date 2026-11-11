'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const S=require('../js/storage.js');
const Photos=require('../js/photos.js');
const fixture=()=>({version:1,products:[],recipes:[{id:'dish-test',type:'dish',name:'Тестовое блюдо',note:'',actualYield:null,ingredients:[]}]});
const embedded=()=>({dataUrl:'data:image/jpeg;base64,/9j/2Q==',width:1,height:1,mime:'image/jpeg'});

test('photos live in an isolated IndexedDB and keep the existing database key/version',()=>{
  assert.equal(Photos.DB_NAME,'kitchen-calculator-test-photos-v1');
  assert.equal(S.KEY,'kitchen-calculator-pr2-browser-test-v1');
  assert.equal(S.validate(fixture()).version,1);
});
test('old backups without optional photos remain byte-for-byte structurally compatible',()=>{
  const data=fixture(),clean=S.parseJSON(S.stringify(data));
  assert.deepEqual(clean,data);assert(!Object.hasOwn(clean.recipes[0],'photoId'));assert(!Object.hasOwn(clean.recipes[0],'photo'));
});
test('local photo references round-trip without embedding blobs in localStorage',()=>{
  const data=fixture();data.recipes[0].photoId='photo-local-123';
  const values=new Map(),storage={setItem:(key,value)=>values.set(key,value),getItem:key=>values.get(key)??null};
  assert.equal(S.save(data,storage).ok,true);
  assert.deepEqual(S.load(storage).data,data);
  assert.equal(values.size,1);assert(!values.get(S.KEY).includes('data:image'));
});
test('portable photo JSON is accepted but must be staged before saving the main database',()=>{
  const data=fixture();data.recipes[0].photo=embedded();
  assert.deepEqual(S.parseJSON(S.stringify(data)),data);
  const writes=[];
  const result=S.save(data,{setItem:(...args)=>writes.push(args)});
  assert.equal(result.ok,false);assert.match(result.error,/отдельном хранилище/);assert.deepEqual(writes,[]);
});
test('schema rejects remote or executable photo URLs, malformed references and double photo fields',()=>{
  for(const photo of [{...embedded(),dataUrl:'https://example.com/photo.jpg'},{...embedded(),mime:'image/svg+xml',dataUrl:'data:image/svg+xml;base64,PHN2Zy8+'},{...embedded(),dataUrl:'data:image/jpeg;base64,broken!'},{...embedded(),width:1281},{...embedded(),height:0},{...embedded(),width:1.5}]){
    const data=fixture();data.recipes[0].photo=photo;assert.throws(()=>S.validate(data));
  }
  for(const photoId of ['../secret','photo id','',null,4,'x'.repeat(201)]){const data=fixture();data.recipes[0].photoId=photoId;assert.throws(()=>S.validate(data));}
  const both=fixture();both.recipes[0].photoId='photo-id';both.recipes[0].photo=embedded();assert.throws(()=>S.validate(both),/одновременно/);
});
test('photo payload budget checks decoded bytes as well as encoded length',()=>{
  const exactly=Buffer.alloc(S.MAX_PHOTO_BYTES).toString('base64');
  const data=fixture();data.recipes[0].photo={...embedded(),dataUrl:'data:image/jpeg;base64,'+exactly};
  assert.doesNotThrow(()=>S.validate(data));
  data.recipes[0].photo.dataUrl='data:image/jpeg;base64,'+Buffer.alloc(S.MAX_PHOTO_BYTES+1).toString('base64');
  assert.throws(()=>S.validate(data),/180/);
});
test('invalid photo IDs fail before trying to open a browser database',async()=>{
  await assert.rejects(Photos.get('../photo'),/Некорректная/);
  await assert.rejects(Photos.remove('bad id'),/Некорректная/);
});
test('photo-free export/import needs no IndexedDB or browser-only API',async()=>{
  const data=fixture();
  assert.deepEqual(await Photos.exportData(data),data);
  assert.deepEqual(await Photos.prepareImport(data),{data,createdIds:[]});
});
