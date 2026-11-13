'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Folders = require('../js/folders.js');
const Storage = require('../js/storage.js');
const Drafts = require('../js/drafts.js');
const Seed = require('../js/seed.js');
const clone = value => JSON.parse(JSON.stringify(value));
const dish = state => state.recipes.find(item => item.type === 'dish');

function fixture() {
  const state = Seed.create();
  state.packaging = [{id:'test-box',name:'Тестовая коробка',price:10,packQuantity:1,unit:'pcs',note:''}];
  Object.assign(dish(state), {
    portions:2, technology:'Подготовить.\nСобрать.', sellingPrice:350,
    photoIds:['test-photo-one','test-photo-two'],
    packaging:[{id:'test-box-row',refId:'test-box',quantity:1,unit:'pcs',freeForGuest:false,costMode:'auto'}]
  });
  return state;
}
function memoryStorage() {
  const entries = new Map([['kitchen-calculator-v1','production-placeholder']]);
  const ops = [];
  return {entries,ops,getItem(key) {ops.push(['get',key]);return entries.get(key) ?? null;},
    setItem(key,value) {ops.push(['set',key]);entries.set(key,value);}};
}

test('old records keep their exact optional-field structure through validate and JSON', () => {
  const old = Seed.create();
  assert.deepEqual(Storage.validate(old),old);
  assert.deepEqual(Storage.parseJSON(Storage.stringify(old)),old);
  assert.equal(Object.hasOwn(Storage.validate(old),'folders'),false);
  assert(old.recipes.every(item => !Object.hasOwn(item,'folderId')));
  const emptyFolders = {...old,folders:[]};
  assert.deepEqual(Storage.parseJSON(Storage.stringify(emptyFolders)),emptyFolders);
});

test('creating folders is immutable and keeps every unrelated field and recipe', () => {
  const state = fixture(), before = clone(state);
  const created = Folders.create(state,'folder-sushi','  Суши\n  и   роллы  ');
  assert.deepEqual(created.folders,[{id:'folder-sushi',name:'Суши и роллы'}]);
  assert.deepEqual(state,before);
  const {folders,...remaining} = created;
  assert.deepEqual(remaining,state);
  assert.deepEqual(Storage.validate(created),created);
});

test('folder naming uses Unicode normalization, collapsed whitespace and case-insensitive duplicates', () => {
  let state = Folders.create(fixture(),'folder-one','  Роллы  и  Суши ');
  assert.equal(Folders.nameKey('РОЛЛЫ\tИ СУШИ'),'роллы и суши');
  assert.throws(() => Folders.create(state,'folder-two','роллы и суши'),/уже существует/);
  state = Folders.create(state,'folder-wide','ＦＯＯＤ');
  assert.equal(state.folders[1].name,'FOOD');
  assert.throws(() => Folders.create(state,'folder-narrow','food'),/уже существует/);
  assert.equal(Folders.folderName('Салаты 🥗'),'Салаты 🥗');
});

test('blank, nontext and overly long names fail without altering the library', () => {
  const state = fixture(), before = clone(state);
  for (const name of ['', ' \n\t ',null,0,{},'Я'.repeat(121)]) {
    assert.throws(() => Folders.create(state,'folder-invalid',name),/название|Название/);
  }
  assert.equal(Folders.create(state,'folder-max','Я'.repeat(120)).folders[0].name.length,120);
  assert.deepEqual(state,before);
});

test('new folder IDs cannot collide with products, recipes, packaging or either kind of row', () => {
  const state = Folders.create(fixture(),'folder-existing','Горячее');
  const ids = [state.products[0].id,dish(state).id,state.packaging[0].id,
    dish(state).ingredients[0].id,dish(state).packaging[0].id,'folder-existing'];
  for (const id of ids) assert.throws(() => Folders.create(state,id,'Другая папка'),/Повторяющийся/);
  for (const id of ['',null,'папка','has space','x"','a'.repeat(201)]) {
    assert.throws(() => Folders.create(state,id,'Новая'),/идентификатор/);
  }
});

test('rename retains the same folder ID and recipe relations, and permits its own normalized name', () => {
  let state = Folders.create(fixture(),'folder-hot','Горячее');
  state = Folders.move(state,dish(state).id,'folder-hot');
  const before = clone(state), renamed = Folders.rename(state,'folder-hot','  ГОРЯЧЕЕ ');
  assert.deepEqual(renamed.folders,[{id:'folder-hot',name:'ГОРЯЧЕЕ'}]);
  assert.deepEqual(renamed.recipes,state.recipes);
  assert.deepEqual(state,before);
  assert.throws(() => Folders.rename(state,'missing','Новое'),/не существует/);
});

test('rename rejects duplicate or blank names and leaves both folders unchanged', () => {
  let state = Folders.create(fixture(),'folder-salads','Салаты');
  state = Folders.create(state,'folder-sauces','Соусы');
  const before = clone(state);
  assert.throws(() => Folders.rename(state,'folder-sauces',' САЛАТЫ '),/уже существует/);
  assert.throws(() => Folders.rename(state,'folder-sauces',' '),/название/);
  assert.deepEqual(state,before);
});

test('moving a saved dish changes only folderId and never duplicates or changes the recipe ID', () => {
  let state = Folders.create(fixture(),'folder-first','Первое');
  state = Folders.create(state,'folder-second','Второе');
  const original = clone(state), recipeId = dish(state).id;
  const first = Folders.move(state,recipeId,'folder-first');
  const second = Folders.move(first,recipeId,'folder-second');
  assert.deepEqual(state,original);
  assert.equal(second.recipes.length,state.recipes.length);
  assert.equal(second.recipes.filter(item=>item.id===recipeId).length,1);
  const {folderId,...other} = dish(second);
  assert.equal(folderId,'folder-second');
  assert.deepEqual(other,dish(state));
  assert.deepEqual(second.products,state.products);
  assert.deepEqual(second.packaging,state.packaging);
  assert.deepEqual(second.folders,state.folders);
  assert.deepEqual(Storage.validate(second),second);
});

test('moving into Without folder removes the optional field and accepts both explicit empty choices', () => {
  let state = Folders.create(fixture(),'folder-any','Общее');
  state = Folders.move(state,dish(state).id,'folder-any');
  for (const empty of [null,'']) {
    const moved = Folders.move(state,dish(state).id,empty);
    assert.equal(Object.hasOwn(dish(moved),'folderId'),false);
    assert.equal(dish(state).folderId,'folder-any');
    assert.deepEqual(Storage.validate(moved),moved);
  }
});

test('unknown recipes, preparations and unknown folders cannot be moved or create phantom records', () => {
  const state = Folders.create(fixture(),'folder-sauces','Соусы'), before = clone(state);
  assert.throws(() => Folders.move(state,'missing','folder-sauces'),/Блюдо больше не существует/);
  assert.throws(() => Folders.move(state,state.recipes.find(item=>item.type==='prep').id,'folder-sauces'),/Блюдо/);
  for (const folder of ['missing',undefined,{},0]) {
    assert.throws(() => Folders.move(state,dish(state).id,folder),/Папка больше не существует/);
  }
  assert.deepEqual(state,before);
});

test('deleting a folder detaches all its dishes without deleting recipes or changing any other field', () => {
  let state = Folders.create(fixture(),'folder-delete','Удаляемая');
  state = Folders.create(state,'folder-keep','Оставшаяся');
  const source = dish(state), second = {...clone(source),id:'second-dish',ingredients:source.ingredients.map((r,i)=>({...r,id:'second-row-'+i})),packaging:[]};
  state.recipes.push(second);
  state = Folders.move(state,source.id,'folder-delete');
  state = Folders.move(state,second.id,'folder-delete');
  const before = clone(state), removed = Folders.remove(state,'folder-delete');
  assert.deepEqual(state,before);
  assert.equal(removed.recipes.length,state.recipes.length);
  assert.deepEqual(removed.folders,[{id:'folder-keep',name:'Оставшаяся'}]);
  for (const oldRecipe of state.recipes) {
    const expected = clone(oldRecipe);delete expected.folderId;
    assert.deepEqual(removed.recipes.find(item=>item.id===oldRecipe.id),expected);
  }
  assert.deepEqual(removed.products,state.products);
  assert.deepEqual(removed.packaging,state.packaging);
  assert.deepEqual(Storage.validate(removed),removed);
  assert.throws(() => Folders.remove(state,'missing'),/не существует/);
});

test('removing one category leaves dishes belonging to another category unchanged', () => {
  let state = Folders.create(fixture(),'folder-empty','Пустая');
  state = Folders.create(state,'folder-used','Занятая');
  state = Folders.move(state,dish(state).id,'folder-used');
  const removed = Folders.remove(state,'folder-empty');
  assert.deepEqual(removed.recipes,state.recipes);
  assert.equal(dish(removed).folderId,'folder-used');
});

test('folder structure and two-photo references round-trip through JSON and storage reload', () => {
  let state = Folders.create(fixture(),'folder-main','Основные');
  state = Folders.create(state,'folder-empty','Пустая');
  state = Folders.move(state,dish(state).id,'folder-main');
  const storage = memoryStorage();
  assert(Storage.save(state,storage).ok);
  assert.deepEqual(Storage.load(storage).data,state);
  assert.deepEqual(Storage.parseJSON(Storage.stringify(state)),state);
  assert.equal(storage.entries.get('kitchen-calculator-v1'),'production-placeholder');
  assert(storage.ops.every(([,key])=>key===Storage.KEY));
});

test('malformed folder definitions and links reject the whole import instead of stripping relations', () => {
  const base = Folders.create(fixture(),'folder-one','Суши');
  const cases = [
    state=>{state.folders=null;},state=>{state.folders={};},state=>{state.folders=[null];},
    state=>{state.folders[0].name=' ';},state=>{state.folders[0].name='x'.repeat(121);},
    state=>{state.folders.push({id:'folder-other',name:' СУШИ '});},
    state=>{state.folders.push({id:'folder-one',name:'Роллы'});},
    state=>{state.folders[0].id=state.products[0].id;},
    state=>{state.folders[0].id=dish(state).ingredients[0].id;},
    state=>{dish(state).folderId='missing';},state=>{dish(state).folderId=null;},
    state=>{state.recipes.find(item=>item.type==='prep').folderId='folder-one';},
    state=>{state.folders[0].id='неверный';}
  ];
  for (const mutate of cases) {
    const state=clone(base);mutate(state);
    assert.throws(() => Storage.parseJSON(JSON.stringify(state)));
  }
  const normalized = clone(base);normalized.folders[0].name='  Суши\n  и  роллы ';
  assert.equal(Storage.validate(normalized).folders[0].name,'Суши и роллы');
});

test('invalid folder saves and quota errors preserve the last saved full database byte for byte', () => {
  const state = fixture(), storage = memoryStorage();
  assert(Storage.save(state,storage).ok);
  const source = storage.entries.get(Storage.KEY), invalid = clone(state);
  dish(invalid).folderId='missing';
  const writeCount = storage.ops.filter(([op])=>op==='set').length;
  assert.equal(Storage.save(invalid,storage).ok,false);
  assert.equal(storage.ops.filter(([op])=>op==='set').length,writeCount);
  assert.equal(storage.entries.get(Storage.KEY),source);
  storage.setItem=()=>{throw Error('QuotaExceededError');};
  const candidate=Folders.create(state,'folder-new','Новая');
  const failed=Storage.save(candidate,storage);
  assert.equal(failed.ok,false);assert.match(failed.error,/QuotaExceededError/);
  assert.equal(storage.entries.get(Storage.KEY),source);
  assert.deepEqual(Storage.load(storage).data,state);
});

test('a damaged stored folder link is reported without any replacement or seed write', () => {
  const storage=memoryStorage(), broken=fixture();dish(broken).folderId='missing';
  const source=JSON.stringify(broken);storage.entries.set(Storage.KEY,source);
  const loaded=Storage.load(storage);
  assert.equal(loaded.data,null);assert.match(loaded.error,/отсутствующую папку/);
  assert.equal(storage.entries.get(Storage.KEY),source);
  assert(storage.ops.every(([op])=>op==='get'));
});

test('folderId survives independent draft save and reload while the saved recipe stays unchanged', () => {
  const state=Folders.create(fixture(),'folder-new','Будущая папка'), storage=memoryStorage();
  assert(Storage.save(state,storage).ok);
  const saved=storage.entries.get(Storage.KEY), data={...clone(dish(state)),folderId:'folder-new'};
  const record={id:data.id,type:'dish',isNew:false,updatedAt:100,data,
    invalidValues:[],errors:[],formValues:[{id:'recipe-folder',value:'folder-new'}],details:[]};
  assert(Drafts.save(record,storage).ok);
  assert.deepEqual(Drafts.load(storage).items,[record]);
  assert.equal(storage.entries.get(Storage.KEY),saved);
  assert.equal(Object.hasOwn(dish(Storage.load(storage).data),'folderId'),false);
  const removed=Folders.remove(state,'folder-new');
  assert(Storage.save(removed,storage).ok);
  assert.deepEqual(Drafts.load(storage).items,[record], 'Deleting a folder never rewrites unfinished recipe content');
});

test('hundreds of folders and a thousand dishes retain unique identities after moves and deletion', () => {
  const source=fixture();
  source.folders=Array.from({length:120},(_,i)=>({id:'bulk-folder-'+i,name:'Категория '+i}));
  const template=dish(source);
  source.recipes=source.recipes.filter(item=>item.type==='prep').concat(Array.from({length:1000},(_,i)=>({
    ...clone(template),id:'bulk-dish-'+i,name:'Блюдо '+i,folderId:'bulk-folder-'+(i%120),
    ingredients:template.ingredients.map((row,n)=>({...row,id:'bulk-row-'+i+'-'+n})),packaging:[]
  })));
  let state=Storage.validate(source);
  state=Folders.move(state,'bulk-dish-999','bulk-folder-0');
  const before=clone(state), removed=Folders.remove(state,'bulk-folder-0');
  assert.equal(removed.recipes.length,state.recipes.length);
  assert.equal(new Set(removed.recipes.map(item=>item.id)).size,removed.recipes.length);
  assert.deepEqual(Storage.validate(removed),removed);
  assert.deepEqual(state,before);
  assert(removed.recipes.filter(item=>item.type==='dish').every(item=>item.folderId!=='bulk-folder-0'));
});
