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
  for(const photo of [{...embedded(),dataUrl:'https://example.com/photo.jpg'},{...embedded(),mime:'image/svg+xml',dataUrl:'data:image/svg+xml;base64,PHN2Zy8+'},{...embedded(),dataUrl:'data:image/jpeg;base64,broken!'},{...embedded(),width:S.MAX_PHOTO_SIDE+1},{...embedded(),height:0},{...embedded(),width:1.5}]){
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
  assert.throws(()=>S.validate(data),/500/);
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


test('quality limits retain larger useful images with a bounded two-photo budget',()=>{
  assert.equal(S.MAX_PHOTO_SIDE,1920);
  assert.equal(S.MAX_PHOTO_BYTES,500*1024);
  assert.equal(Photos.MAX_SOURCE_BYTES,10*1024*1024);
  assert.equal(Photos.MAX_PIXELS,40*1000*1000);
});
test('ids normalizes new and old photo references without mutating any recipe',()=>{
  for(const [recipe,expected] of [[null,[null,null]],[{},[null,null]],[{photoId:'legacy-photo'},['legacy-photo',null]],[{photoIds:['first','second']},['first','second']],[{photoIds:[null,'second']},[null,'second']],[{photoIds:[]},[null,null]]]){
    const before=JSON.stringify(recipe);assert.deepEqual(Photos.ids(recipe),expected);assert.equal(JSON.stringify(recipe),before);
  }
});
test('two local photo slots round-trip with order and empty frame preserved',()=>{
  for(const photoIds of [['photo-first','photo-second'],[null,'photo-second'],['photo-first',null],[],[null,null]]){
    const data=fixture();data.recipes[0].photoIds=photoIds;
    assert.deepEqual(S.parseJSON(S.stringify(data)),data);
    const values=new Map(),storage={setItem:(key,value)=>values.set(key,value),getItem:key=>values.get(key)??null};
    assert.equal(S.save(data,storage).ok,true);assert.deepEqual(S.load(storage).data,data);
    assert.equal(values.size,1);assert(!values.get(S.KEY).includes('data:image'));
  }
});
test('two portable photo slots remain ordered and cannot be written as main localStorage blobs',()=>{
  for(const photos of [[embedded(),embedded()],[null,embedded()],[embedded(),null],[null,null]]){
    const data=fixture();data.recipes[0].photos=photos;
    assert.deepEqual(S.parseJSON(S.stringify(data)),data);
    const writes=[];assert.equal(S.save(data,{setItem:(...args)=>writes.push(args)}).ok,false);assert.deepEqual(writes,[]);
  }
});
test('more than two slots, malformed entries and mixed photo formats never overwrite stored data',()=>{
  for(const field of ['photoIds','photos'])for(const value of [null,{},'photo',new Array(3).fill(null),[undefined]]){
    const data=fixture();data.recipes[0][field]=value;assert.throws(()=>S.validate(data));
  }
  const fields={photoId:'old-id',photo:embedded(),photoIds:['one','two'],photos:[embedded(),null]};
  for(const a of Object.keys(fields))for(const b of Object.keys(fields))if(a!==b){
    const data=fixture();data.recipes[0][a]=fields[a];data.recipes[0][b]=fields[b];assert.throws(()=>S.validate(data),/одновременно/);
  }
  for(const photoIds of [['bad id',null],[3,null],[{},null]]){const data=fixture();data.recipes[0].photoIds=photoIds;assert.throws(()=>S.validate(data));}
});
test('new 1920px embedded photos are accepted; over-budget images still fail before writes',()=>{
  const data=fixture();data.recipes[0].photos=[{...embedded(),width:1920,height:1080},null];
  assert.doesNotThrow(()=>S.validate(data));
  data.recipes[0].photos[0].height=1921;assert.throws(()=>S.validate(data));
  data.recipes[0].photos[0]={...embedded(),dataUrl:'data:image/jpeg;base64,'+Buffer.alloc(S.MAX_PHOTO_BYTES+1).toString('base64')};assert.throws(()=>S.validate(data),/500/);
});
test('invalid source requests are serialized and do not poison the compression queue',async()=>{
  const invalid=new Blob(['bad'],{type:'image/svg+xml'});
  await Promise.all([assert.rejects(Photos.compress(invalid),/JPEG/),assert.rejects(Photos.compress(invalid),/JPEG/)]);
  await assert.rejects(Photos.compress(new Blob([],{type:'image/jpeg'})),/10 МБ/);
});

test('oversized JPEG, PNG and WebP dimensions are rejected before allocating a decoded image',async()=>{
  const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(10000,16);png.writeUInt32BE(10000,20);
  const jpeg=Buffer.from([255,216,255,192,0,17,8,0x27,0x10,0x27,0x10,3,1,0x11,0,2,0x11,0,3,0x11,0]);
  const webp=Buffer.alloc(30);webp.write('RIFF');webp.writeUInt32LE(22,4);webp.write('WEBP',8);webp.write('VP8X',12);webp.writeUInt32LE(10,16);webp.writeUIntLE(9999,24,3);webp.writeUIntLE(9999,27,3);
  for(const [type,source] of [['image/png',png],['image/jpeg',jpeg],['image/webp',webp]]) {
    await assert.rejects(Photos.compress(new Blob([source],{type})),/40 мегапикселей/);
  }
});
