'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Storage = require('../js/storage.js');
const Seed = require('../js/seed.js');

function fixture() {
  const data = Seed.create();
  data.folders = [{id:'extension-folder',name:'Тестовая папка',futureFolder:{color:'#123456',tags:['a','b']}}];
  data.products[0].supplier = {code:'vendor-1',extra:[null,false,0,-2,{text:'<b>plain data</b>'}]};
  data.recipes[0].futurePreparation = {minutes:20};
  const dish = data.recipes.find(recipe=>recipe.type==='dish');
  dish.folderId = 'extension-folder';dish.sellingPrice = 350;
  dish.photoIds = ['extension-photo-one','extension-photo-two'];
  dish.futureServing = {section:'Тест',equipment:['plate']};
  dish.ingredients[0].futureStep = {temperature:65};
  data.packaging = [{id:'extension-box',name:'Тестовый бокс',price:100,packQuantity:10,unit:'pcs',note:'',supplier:{code:'box-vendor'}}];
  dish.packaging = [{id:'extension-pack-row',refId:'extension-box',quantity:1,unit:'pcs',freeForGuest:false,costMode:'auto',futureDisplay:{tag:'takeaway'}}];
  data.futureDatabase = {device:'Тестовый телефон',format:{number:3},flags:[true,false]};
  return data;
}
const memory = () => {
  const items = new Map();
  return {getItem:key=>items.get(key) ?? null,setItem:(key,value)=>items.set(key,value)};
};

test('extensions at every supported entity level survive validate, JSON and saved reload',()=>{
  const source = fixture(), canonical = Storage.validate(source), storage = memory();
  assert.deepEqual(canonical.futureDatabase,source.futureDatabase);
  assert.deepEqual(canonical.folders[0].futureFolder,source.folders[0].futureFolder);
  assert.deepEqual(canonical.products[0].supplier,source.products[0].supplier);
  assert.deepEqual(canonical.recipes[0].futurePreparation,source.recipes[0].futurePreparation);
  const dish = canonical.recipes.find(recipe=>recipe.type==='dish'), original = source.recipes.find(recipe=>recipe.type==='dish');
  assert.deepEqual(dish.futureServing,original.futureServing);
  assert.deepEqual(dish.ingredients[0].futureStep,original.ingredients[0].futureStep);
  assert.deepEqual(canonical.packaging[0].supplier,source.packaging[0].supplier);
  assert.deepEqual(dish.packaging[0].futureDisplay,original.packaging[0].futureDisplay);
  assert.deepEqual(Storage.parseJSON(Storage.stringify(source)),canonical);
  assert.equal(Storage.save(source,storage).ok,true);
  assert.deepEqual(Storage.load(storage).data,canonical);
});

test('validated extensions are detached from input references and retain null and finite negative metadata',()=>{
  const source = fixture(), clean = Storage.validate(source);
  clean.futureDatabase.flags.push(true);
  clean.products[0].supplier.extra[4].text = 'changed';
  assert.deepEqual(source.futureDatabase.flags,[true,false]);
  assert.equal(source.products[0].supplier.extra[4].text,'<b>plain data</b>');
  assert.deepEqual(clean.products[0].supplier.extra.slice(0,4),[null,false,0,-2]);
});

test('legacy absence and known optional undefined values retain previous normalization',()=>{
  const old = Seed.create();
  old.products[0].aliases = undefined;old.products[0].note = undefined;
  old.recipes[2].portions = undefined;old.recipes[2].sellingPrice = undefined;
  const clean = Storage.validate(old);
  assert.equal(clean.products[0].aliases,'');assert.equal(clean.products[0].note,'');
  assert.equal(Object.hasOwn(clean,'folders'),false);
  assert.equal(Object.hasOwn(clean.recipes[2],'portions'),false);
  assert.equal(Object.hasOwn(clean.recipes[2],'sellingPrice'),false);
  assert.deepEqual(Storage.validate(Seed.create()),Seed.create());
});

test('extensions cannot relax known numeric, unit, identity, folder or version validation',()=>{
  for (const change of [
    data=>{data.products[0].price=-1;}, data=>{data.products[0].unit='litres';},
    data=>{data.products[1].id=data.products[0].id;}, data=>{data.recipes[2].folderId='missing';},
    data=>{data.version=2;}, data=>{data.recipes[2].sellingPrice='350';}
  ]) {const data=fixture();change(data);assert.throws(()=>Storage.validate(data));}
});

test('unknown photo metadata is rejected explicitly instead of being silently lost during staging',()=>{
  for (const field of ['photo','photos']) {
    const data = fixture(), dish = data.recipes.find(recipe=>recipe.type==='dish');
    delete dish.photoIds;
    const photo = {dataUrl:'data:image/png;base64,AAAA',width:1,height:1,mime:'image/png',caption:'Must not disappear'};
    dish[field] = field==='photo' ? photo : [photo,null];
    assert.throws(()=>Storage.validate(data),/неподдерживаемые поля фотографии/);
    assert.equal(photo.caption,'Must not disappear');
  }
  const data=fixture(), dish=data.recipes.find(recipe=>recipe.type==='dish');delete dish.photoIds;
  dish.photos=[{dataUrl:'data:image/png;base64,AAAA',width:1,height:1,mime:'image/png'},null];
  assert.deepEqual(Storage.validate(data).recipes.find(recipe=>recipe.type==='dish').photos,dish.photos);
});

test('prototype-related keys in imported JSON are rejected without pollution or a partial save',()=>{
  for (const key of ['__proto__','constructor','prototype']) {
    const data = fixture();data.futureDatabase = JSON.parse('{"'+key+'":{"polluted":true}}');
    assert.throws(()=>Storage.validate(data),/служебное поле/);
    const storage=memory();assert.equal(Storage.save(Seed.create(),storage).ok,true);
    const before=storage.getItem(Storage.KEY);assert.equal(Storage.save(data,storage).ok,false);
    assert.equal(storage.getItem(Storage.KEY),before);assert.equal(Object.prototype.polluted,undefined);
  }
});

test('accessors and serialization hooks are never invoked, including on known fields',()=>{
  let invoked = 0;
  for (const build of [
    data=>Object.defineProperty(data,'version',{enumerable:true,get(){invoked++;return 1;}}),
    data=>Object.defineProperty(data.products[0],'name',{enumerable:true,get(){invoked++;return 'x';}}),
    data=>Object.defineProperty(data.futureDatabase,'computed',{enumerable:true,get(){invoked++;return 'x';}}),
    data=>{data.futureDatabase.toJSON=()=>{invoked++;return {};};},
    data=>Object.defineProperty(data.futureDatabase.flags,'0',{enumerable:true,get(){invoked++;return false;}})
  ]) {const data=fixture();build(data);assert.throws(()=>Storage.validate(data));}
  assert.equal(invoked,0);
});

test('unsupported extension values, circular structures and nonplain objects fail explicitly',()=>{
  for (const value of [undefined,()=>1,Symbol('x'),NaN,Infinity,-Infinity,1n,new Date(),new Map(),new Uint8Array(1)]) {
    const data=fixture();data.futureValue=value;assert.throws(()=>Storage.validate(data));
  }
  const data=fixture();data.futureDatabase.self=data.futureDatabase;
  assert.throws(()=>Storage.validate(data),/циклическая/);
});

test('sparse arrays, hidden properties, symbol keys and named array fields are not silently stripped',()=>{
  const invalid = [];
  const sparse = Array(2);sparse[1]=1;invalid.push(sparse);
  const named = [true];named.extra='x';invalid.push(named);
  const symbol = {};symbol[Symbol('secret')]='x';invalid.push(symbol);
  const hidden = {};Object.defineProperty(hidden,'secret',{value:'x'});invalid.push(hidden);
  for (const value of invalid) {const data=fixture();data.futureValue=value;assert.throws(()=>Storage.validate(data));}
});

test('extension complexity and imported file size are bounded before any storage write',()=>{
  const data=fixture();let current=data;
  for(let index=0;index<102;index++) {current.future={};current=current.future;}
  assert.throws(()=>Storage.validate(data),/слишком сложные/);
  const storage=memory();Storage.save(Seed.create(),storage);const before=storage.getItem(Storage.KEY);
  assert.equal(Storage.save(data,storage).ok,false);assert.equal(storage.getItem(Storage.KEY),before);
  assert.throws(()=>Storage.parseJSON(' '.repeat(Storage.MAX_IMPORT_BYTES+1)),/50 МБ/);
});

test('null-prototype extension objects are safely copied as ordinary detached JSON data',()=>{
  const data=fixture(), value=Object.create(null);value.detail='kept';data.futureValue=value;
  const clean=Storage.validate(data);assert.equal(Object.getPrototypeOf(clean.futureValue),Object.prototype);
  assert.equal(clean.futureValue.detail,'kept');assert.notEqual(clean.futureValue,value);
});
