'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const S=require('../js/storage.js');
const T=require('../js/import-transaction.js');
const KEY=S.KEY,DRAFT='kitchen-calculator-pr2-browser-drafts-v1',PRODUCTION='kitchen-calculator-v1';
const copy=value=>JSON.parse(JSON.stringify(value));
const image=(variant=0)=>({dataUrl:'data:image/jpeg;base64,'+Buffer.from([255,216,255,variant,255,217]).toString('base64'),width:1,height:1,mime:'image/jpeg'});
const fixture=()=>({version:1,products:[],recipes:[{id:'dish',type:'dish',name:'Вымышленное блюдо',note:'',actualYield:null,ingredients:[],sellingPrice:300}]});
function harness(data=fixture(),settings={}) {
  const events=[],values=new Map([[KEY,S.stringify(data)],[DRAFT,'fictional-draft-source'],[PRODUCTION,'fictional-protected-source']]);
  const state=S.parseJSON(values.get(KEY)),source=values.get(KEY),records=new Map(),storedBackups=new Map();
  const flags={};let photoNumber=0,backupNumber=0,prepares=0;
  const storage={getItem(key){events.push(['read',key]);if(flags.readError)throw Error('Fictional storage read error');return values.get(key)??null;},
    setItem(key,value){events.push(['write',key]);if(flags.mainQuota)throw Error('Fictional main quota');values.set(key,value);}};
  const photos={async exportData(input){
    const out=S.validate(input);
    for(const recipe of out.recipes){
      if(recipe.photoIds!==undefined){recipe.photos=recipe.photoIds.map(id=>id?copy(records.get(id) || missing()):null);delete recipe.photoIds;}
      else if(recipe.photoId){recipe.photo=copy(records.get(recipe.photoId) || missing());delete recipe.photoId;}
    }
    if(flags.afterExport)await flags.afterExport();
    return out;
  },async prepareImport(input){
    prepares++;if(flags.prepareHook)await flags.prepareHook(input,prepares);
    const out=S.validate(input),createdIds=[];
    try{
      for(const recipe of out.recipes){
        const stage=photo=>{if(flags.stageFailAt===photoNumber+1)throw Error('Fictional image quota');const id='new-photo-'+(++photoNumber);records.set(id,copy(photo));createdIds.push(id);events.push(['photo-add',id]);return id;};
        if(recipe.photo){recipe.photoId=stage(recipe.photo);delete recipe.photo;}
        else if(recipe.photos!==undefined){recipe.photoIds=recipe.photos.map(photo=>photo?stage(photo):null);delete recipe.photos;}
        else for(const id of recipe.photoIds || [recipe.photoId])if(id&&!records.has(id))missing();
      }
      return {data:out,createdIds};
    }catch(error){for(const id of createdIds)records.delete(id);throw error;}
  },async rollback(ids){events.push(['rollback',...ids]);if(flags.rollbackError)throw Error('Fictional rollback denied');for(const id of ids)records.delete(id);}};
  function missing(){throw Error('Fictional photo missing');}
  const backups={async put(record){events.push(['backup-put',record.id]);if(flags.backupQuota)throw Error('Fictional backup quota');storedBackups.set(record.id,copy(record));if(flags.afterBackup)await flags.afterBackup();},
    async get(id){events.push(['backup-read',id]);if(flags.unreadableBackup)return null;return copy(storedBackups.get(id) || null);},
    async list(){events.push(['backup-list']);return [...storedBackups.values()].map(copy);},
    async remove(id){events.push(['backup-remove',id]);if(flags.pruneError)throw Error('Fictional prune denied');storedBackups.delete(id);}};
  const lockCalls=[];
  const locks={async request(name,options,action){lockCalls.push({name,options});return action();}};
  const service=T.create({storage,photos,backups,locks,uid:()=> 'backup-'+(++backupNumber),now:()=>1000+backupNumber,...settings});
  function changed(){const next=copy(state);next.recipes[0].name='Изменённое тестовое блюдо';return next;}
  return {service,state,source,values,events,flags,records,storedBackups,lockCalls,changed,storage,photos,backups,get prepares(){return prepares;}};
}
function untouched(h){assert.equal(h.values.get(KEY),h.source);assert.equal(h.values.get(DRAFT),'fictional-draft-source');assert.equal(h.values.get(PRODUCTION),'fictional-protected-source');}
function onlyTestKey(h){assert(h.events.filter(entry=>['read','write'].includes(entry[0])).every(entry=>entry[1]===KEY),'Only main test storage key is accessed by transaction');}

test('backup uses a dedicated test IndexedDB and lock namespace, without changing main schema',()=>{
  assert.equal(T.DB_NAME,'kitchen-calculator-test-import-backups-v1');assert.equal(T.LOCK_NAME,KEY+':import');assert.equal(T.KEEP_BACKUPS,3);
});
test('a denied default localStorage getter cannot break service construction or independent backup listing',async()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');let attempts=0,service;
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){attempts++;throw Error('SecurityError: fictional denied getter');}});
  try {
    assert.doesNotThrow(()=>{service=T.create({backups:{list:async()=>[]},locks:null});});
    assert.equal(attempts,0);assert.deepEqual(await service.listBackups(),[]);assert.equal(attempts,0);
    await assert.rejects(service.apply({candidate:fixture(),currentState:fixture(),expectedSource:null}),/SecurityError/);
    assert.equal(attempts,1);
  } finally {if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete globalThis.localStorage;}
});
test('durable backup includes portable photos, exact source and independent draft attachment before any apply',async()=>{
  const data=fixture();data.recipes[0].photoIds=['existing-one','existing-two'];const h=harness(data);
  h.records.set('existing-one',image(1));h.records.set('existing-two',image(2));
  const backup=await h.service.prepareBackup(h.state,{expectedSource:h.source,draftSource:h.values.get(DRAFT),mode:'replace'});
  assert.deepEqual(backup.data.recipes[0].photos,[image(1),image(2)]);assert.equal(backup.source,h.source);assert.equal(backup.draftSource,'fictional-draft-source');assert.equal(backup.mode,'replace');
  assert.equal(h.storedBackups.size,1);assert.equal((await h.service.listBackups())[0].id,backup.id);assert(!Object.hasOwn((await h.service.listBackups())[0],'text'));
  assert.deepEqual((await h.service.getBackup(backup.id)).data,backup.data);untouched(h);assert.deepEqual(h.records.size,2);onlyTestKey(h);
});
test('apply creates and verifies backup before one atomic main write and preserves all inputs',async()=>{
  const h=harness(),candidate=h.changed(),before=copy(candidate),old=copy(h.state);
  const result=await h.service.apply({candidate,currentState:h.state,expectedSource:h.source,draftSource:'fictional-draft-source'});
  assert.equal(result.noOp,false);assert.equal(result.data.recipes[0].name,before.recipes[0].name);assert.equal(h.values.get(KEY),S.stringify(result.data));
  assert.deepEqual(result.backup.data,h.state);assert.deepEqual(candidate,before);assert.deepEqual(h.state,old);
  const write=h.events.findIndex(entry=>entry[0]==='write'),backup=h.events.findIndex(entry=>entry[0]==='backup-put'),verified=h.events.findIndex(entry=>entry[0]==='backup-read');assert(backup<verified&&verified<write);
  assert.equal(h.events.filter(entry=>entry[0]==='write').length,1);assert.equal(h.values.get(DRAFT),'fictional-draft-source');onlyTestKey(h);
  assert(h.lockCalls.every(call=>call.name===T.LOCK_NAME&&call.options.mode==='exclusive'));
});
test('an identical repeat import creates no backup, no photos and no main write',async()=>{
  const h=harness();const result=await h.service.apply({candidate:copy(h.state),currentState:h.state,expectedSource:h.source});
  assert.equal(result.noOp,true);assert.equal(result.backup,null);assert.equal(h.storedBackups.size,0);assert.equal(h.prepares,0);assert(!h.events.some(entry=>entry[0]==='write'));untouched(h);
});
test('portable photo-only representation changes do not duplicate photos or rewrite an unchanged recipe',async()=>{
  const data=fixture();data.recipes[0].photoId='legacy-photo';const h=harness(data);h.records.set('legacy-photo',image());
  const candidate=copy(h.state);delete candidate.recipes[0].photoId;candidate.recipes[0].photos=[image(),null];
  const result=await h.service.apply({candidate,currentState:h.state,expectedSource:h.source});assert.equal(result.noOp,true);assert.equal(result.data.recipes[0].photoId,'legacy-photo');assert.equal(h.records.size,1);untouched(h);
});
test('backup quota or read-back failure blocks apply before staging and preserves older backups',async()=>{
  for(const flag of ['backupQuota','unreadableBackup']){
    const h=harness();h.storedBackups.set('backup-old',{id:'backup-old',createdAt:1,text:S.stringify(h.state),source:h.source,mode:'merge'});h.flags[flag]=true;
    await assert.rejects(h.service.apply({candidate:h.changed(),currentState:h.state,expectedSource:h.source}),/backup|резервн/i);
    untouched(h);assert(h.storedBackups.has('backup-old'));assert.equal(h.prepares,0);assert(!h.events.some(entry=>entry[0]==='write'));
  }
});
test('backup store unavailable never falls back to deleting or overwriting main localStorage',async()=>{
  const h=harness();const service=T.create({storage:{getItem:()=>h.source,setItem(){throw Error('Must not write');}},photos:{exportData:async data=>copy(data)},indexedDB:null,locks:null});
  await assert.rejects(service.apply({candidate:h.changed(),currentState:h.state,expectedSource:h.source}),/IndexedDB/);untouched(h);
});
test('stale main snapshot before backup does not write anything',async()=>{
  const h=harness();h.values.set(KEY,'{"fictional":"another-tab"}');await assert.rejects(h.service.apply({candidate:h.changed(),currentState:h.state,expectedSource:h.source}),/другой вкладке/);
  assert.equal(h.values.get(KEY),'{"fictional":"another-tab"}');assert.equal(h.storedBackups.size,0);assert.equal(h.prepares,0);
});
test('unsaved or corrupt current database cannot be misrepresented by an empty backup',async()=>{
  const h=harness(),unsaved=h.changed();await assert.rejects(h.service.apply({candidate:unsaved,currentState:unsaved,expectedSource:h.source}),/несохранённые/);untouched(h);
  h.values.set(KEY,'{broken');await assert.rejects(h.service.apply({candidate:h.changed(),currentState:h.state,expectedSource:'{broken'}),/JSON/);assert.equal(h.values.get(KEY),'{broken');assert.equal(h.storedBackups.size,0);
});
test('stale main snapshot after asynchronous backup prevents staging and never overwrites external data',async()=>{
  const h=harness();h.flags.afterBackup=()=>h.values.set(KEY,'{"fictional":"changed-after-backup"}');await assert.rejects(h.service.apply({candidate:h.changed(),currentState:h.state,expectedSource:h.source}),/другой вкладке/);
  assert.equal(h.values.get(KEY),'{"fictional":"changed-after-backup"}');assert.equal(h.prepares,0);assert.equal(h.storedBackups.size,1);
});
test('stale snapshot after staging removes only newly staged photos',async()=>{
  const data=fixture();data.recipes[0].photoId='existing';const h=harness(data);h.records.set('existing',image(1));const candidate=h.changed();delete candidate.recipes[0].photoId;candidate.recipes[0].photo=image(2);
  h.flags.prepareHook=(input,n)=>{if(n===2)h.values.set(KEY,'{"fictional":"changed-after-photo"}');};
  await assert.rejects(h.service.apply({candidate,currentState:h.state,expectedSource:h.source}),/другой вкладке/);assert.equal(h.values.get(KEY),'{"fictional":"changed-after-photo"}');assert.deepEqual([...h.records.keys()],['existing']);assert.equal(h.values.get(DRAFT),'fictional-draft-source');
});
test('main quota failure retains durable backup and old photos, rolling back all staged images',async()=>{
  const data=fixture();data.recipes[0].photoIds=['existing-one','existing-two'];const h=harness(data);h.records.set('existing-one',image(1));h.records.set('existing-two',image(2));const candidate=h.changed();delete candidate.recipes[0].photoIds;candidate.recipes[0].photos=[image(3),image(4)];h.flags.mainQuota=true;
  await assert.rejects(h.service.apply({candidate,currentState:h.state,expectedSource:h.source}),/quota|сохранён/);untouched(h);assert.deepEqual([...h.records.keys()],['existing-one','existing-two']);assert.equal(h.storedBackups.size,1);
});
test('second photo staging failure removes the first staged image and keeps both originals',async()=>{
  const data=fixture();data.recipes[0].photoIds=['existing-one','existing-two'];const h=harness(data);h.records.set('existing-one',image(1));h.records.set('existing-two',image(2));const candidate=h.changed();delete candidate.recipes[0].photoIds;candidate.recipes[0].photos=[image(3),image(4)];h.flags.stageFailAt=2;
  await assert.rejects(h.service.apply({candidate,currentState:h.state,expectedSource:h.source}),/image quota/);untouched(h);assert.deepEqual([...h.records.keys()],['existing-one','existing-two']);assert.equal(h.storedBackups.size,1);
});
test('cleanup failure is reported without deleting any previous image or modifying main',async()=>{
  const h=harness();const candidate=h.changed();candidate.recipes[0].photo=image();h.flags.mainQuota=true;h.flags.rollbackError=true;
  await assert.rejects(h.service.apply({candidate,currentState:h.state,expectedSource:h.source}),/временные фото/);untouched(h);assert.equal(h.storedBackups.size,1);
});
test('existing two-photo IDs and legacy single-photo shape are retained for unrelated recipe changes',async()=>{
  for(const references of [{photoId:'existing-one'},{photoIds:['existing-one','existing-two']},{photoIds:[null,'existing-two']}]){
    const data=fixture();Object.assign(data.recipes[0],references);const h=harness(data);h.records.set('existing-one',image(1));h.records.set('existing-two',image(2));const candidate=await h.service.prepareBackup(h.state,{expectedSource:h.source});const next=copy(candidate.data);next.recipes[0].sellingPrice=350;
    const result=await h.service.apply({candidate:next,currentState:h.state,expectedSource:h.source,backupId:candidate.id});for(const key of ['photoId','photoIds'])assert.deepEqual(result.data.recipes[0][key],references[key]);assert.equal(h.records.size,2);assert(!h.events.some(entry=>entry[0]==='photo-add'));
  }
});
test('new single-photo imports retain photoId and different recipes reuse identical existing bytes',async()=>{
  const data=fixture();data.recipes[0].photoId='existing';const h=harness(data);h.records.set('existing',image(1));const candidate=h.changed();candidate.recipes.push({...copy(candidate.recipes[0]),id:'second',name:'Второе вымышленное блюдо'});delete candidate.recipes[1].photoId;candidate.recipes[1].photo=image(1);
  const result=await h.service.apply({candidate,currentState:h.state,expectedSource:h.source});assert.equal(result.data.recipes[1].photoId,'existing');assert(!Object.hasOwn(result.data.recipes[1],'photoIds'));assert.equal(h.records.size,1);
});
test('an actual changed legacy single-photo import reuses the current array ID but preserves scalar representation',async()=>{
  const data=fixture();data.recipes[0].photoIds=['existing-one',null];const h=harness(data);h.records.set('existing-one',image(1));
  const candidate=h.changed();delete candidate.recipes[0].photoIds;candidate.recipes[0].photo=image(1);
  const result=await h.service.apply({candidate,currentState:h.state,expectedSource:h.source});
  assert.equal(result.noOp,false);assert.equal(result.data.recipes[0].photoId,'existing-one');assert(!Object.hasOwn(result.data.recipes[0],'photoIds'));assert.equal(h.records.size,1);assert(!h.events.some(entry=>entry[0]==='photo-add'));
  assert.deepEqual((await h.photos.exportData(result.data)).recipes[0].photo,image(1));
});
test('fresh new photo bytes are staged once even if repeated across recipes and slots',async()=>{
  const h=harness();const candidate=h.changed();candidate.recipes[0].photos=[image(9),image(9)];candidate.recipes.push({...copy(candidate.recipes[0]),id:'second',name:'Второе'});
  const result=await h.service.apply({candidate,currentState:h.state,expectedSource:h.source});assert.equal(h.records.size,1);assert.deepEqual(result.data.recipes.map(recipe=>recipe.photoIds),[['new-photo-1','new-photo-1'],['new-photo-1','new-photo-1']]);
});
test('unsupported embedded photo metadata is rejected explicitly before backup or staging',async()=>{
  const h=harness();const candidate=h.changed();candidate.recipes[0].photo={...image(),futureCaption:'Сохранить, а не терять'};
  await assert.rejects(h.service.apply({candidate,currentState:h.state,expectedSource:h.source}),/неподдерживаемые поля/);untouched(h);assert.equal(h.storedBackups.size,0);assert.equal(h.prepares,0);
});
test('invalid candidate references and modes fail without touching old data or backups',async()=>{
  const h=harness();const bad=h.changed();bad.recipes[0].folderId='missing';await assert.rejects(h.service.apply({candidate:bad,currentState:h.state,expectedSource:h.source}),/отсутствующую папку/);
  await assert.rejects(h.service.apply({candidate:h.changed(),currentState:h.state,expectedSource:h.source,mode:'automatic-sync'}),/режим/);untouched(h);assert.equal(h.storedBackups.size,0);
});
test('only the latest three durable backups remain, and pruning happens after read-back',async()=>{
  const h=harness();const ids=[];for(let i=0;i<5;i++)ids.push((await h.service.prepareBackup(h.state,{expectedSource:h.source})).id);
  assert.equal(h.storedBackups.size,3);assert.deepEqual((await h.service.listBackups()).map(record=>record.id),ids.slice(-3).reverse());
  const firstPrune=h.events.findIndex(entry=>entry[0]==='backup-remove'),fourthRead=h.events.findIndex(entry=>entry[0]==='backup-read'&&entry[1]==='backup-4');assert(firstPrune>fourthRead);untouched(h);
});
test('failed new backup never deletes an older durable copy; prune failures retain the new backup',async()=>{
  const h=harness();for(let i=0;i<3;i++)await h.service.prepareBackup(h.state,{expectedSource:h.source});const ids=[...h.storedBackups.keys()];h.flags.backupQuota=true;await assert.rejects(h.service.prepareBackup(h.state,{expectedSource:h.source}));assert.deepEqual([...h.storedBackups.keys()],ids);
  h.flags.backupQuota=false;h.flags.pruneError=true;const record=await h.service.prepareBackup(h.state,{expectedSource:h.source});assert(record.warnings.length);assert(h.storedBackups.has(record.id));untouched(h);
});
test('provided backup must match the exact reviewed base and can be downloaded after a new service is created',async()=>{
  const h=harness();const saved=await h.service.prepareBackup(h.state,{expectedSource:h.source,mode:'replace'});const result=await h.service.apply({candidate:h.changed(),currentState:h.state,expectedSource:h.source,backupId:saved.id,mode:'replace'});assert.equal(result.backup.id,saved.id);assert.equal(h.storedBackups.size,1);
  const second=T.create({storage:h.storage,photos:h.photos,backups:h.backups,locks:null});assert.deepEqual((await second.getBackup(saved.id)).data,h.state);
  await assert.rejects(second.apply({candidate:h.state,currentState:result.data,expectedSource:h.values.get(KEY),backupId:saved.id}),/другой базе/);
});
test('a valid empty base can be backed up and replaced; missing snapshot is never assumed',async()=>{
  const h=harness({version:1,products:[],recipes:[]});h.values.delete(KEY);const result=await h.service.apply({candidate:fixture(),currentState:h.state,expectedSource:null,mode:'replace'});assert.equal(result.backup.source,null);assert.deepEqual(result.backup.data,h.state);assert.equal(result.data.recipes.length,1);
  const other=harness();await assert.rejects(other.service.apply({candidate:other.changed(),currentState:other.state}),/снимок/);untouched(other);
});
