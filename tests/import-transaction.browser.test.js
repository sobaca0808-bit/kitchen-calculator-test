/* Issue #16: real IndexedDB transaction checks on a blank disposable loopback page. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {chromium}=require('playwright');
const testURL=process.env.KITCHEN_TEST_URL;
if(!testURL)throw Error('KITCHEN_TEST_URL must identify a disposable loopback origin.');
const target=new URL(testURL);
if(!['http:','https:'].includes(target.protocol)||!['localhost','127.0.0.1','[::1]'].includes(target.hostname))throw Error('Import transaction checks never use a published calculator.');
const root=path.resolve(__dirname,'..'),KEY='kitchen-calculator-pr2-browser-test-v1',DRAFT='kitchen-calculator-pr2-browser-drafts-v1',PRODUCTION='kitchen-calculator-v1';
const launch={executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']};
const SENTINEL='{"fictional":"protected transaction test placeholder"}';
let browser,passed=0;const failures=[];
async function inject(page){
  for(const name of ['storage','photos','import-transaction'])await page.addScriptTag({path:path.join(root,'js',name+'.js')});
  await page.evaluate(({key,draft,production,sentinel})=>{
    const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
    set.call(localStorage,production,sentinel);
    if(get.call(localStorage,draft)===null)set.call(localStorage,draft,'fictional independent draft');
    window.__txOps=[];window.__txRead=key=>get.call(localStorage,key);
    for(const method of ['getItem','setItem','removeItem','clear']){const original=Storage.prototype[method];Storage.prototype[method]=function(...args){window.__txOps.push({method,key:args[0]});if(method==='setItem'&&args[0]===key&&window.__txMainQuota)throw new DOMException('Fictional main quota','QuotaExceededError');return original.apply(this,args);};}
    window.__txFixture=()=>({version:1,products:[],recipes:[{id:'dish',type:'dish',name:'Вымышленное блюдо',note:'',actualYield:null,ingredients:[],sellingPrice:300}]});
    window.__txImage=color=>{const canvas=document.createElement('canvas');canvas.width=64;canvas.height=48;const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,64,48);return {dataUrl:canvas.toDataURL('image/png'),width:64,height:48,mime:'image/png'};};
    window.__txKeys=async(name,store)=>new Promise((resolve,reject)=>{const request=indexedDB.open(name);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result;const tx=db.transaction(store,'readonly'),query=tx.objectStore(store).getAllKeys();tx.oncomplete=()=>{const keys=query.result;db.close();resolve(keys);};tx.onerror=()=>{db.close();reject(tx.error);};};});
  },{key:KEY,draft:DRAFT,production:PRODUCTION,sentinel:SENTINEL});
}
async function blank(context){await context.route(testURL,route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ru"><title>Изолированная проверка импорта</title><body></body></html>'}));const page=await context.newPage();page.setDefaultTimeout(10000);await page.goto(testURL);await inject(page);return page;}
async function setup(page,withPhoto=false){return page.evaluate(async withPhoto=>{
  const data=__txFixture();if(withPhoto)data.recipes[0].photo=__txImage('#84502d');
  const staged=await KitchenPhotos.prepareImport(data);const result=KitchenStorage.save(staged.data);if(!result.ok)throw Error(result.error);
  return {data:staged.data,source:localStorage.getItem(KitchenStorage.KEY),portable:await KitchenPhotos.exportData(staged.data)};
},withPhoto);}
async function guard(page){const result=await page.evaluate(({key,draft,production})=>({sentinel:__txRead(production),draft:__txRead(draft),ops:__txOps}),{key:KEY,draft:DRAFT,production:PRODUCTION});assert.equal(result.sentinel,SENTINEL);assert.equal(result.draft,'fictional independent draft');assert(result.ops.every(op=>op.method!=='clear'&&[KEY,DRAFT].includes(op.key)),'Only the exact test and draft keys are accessed');}
async function scenario(name,fn){const context=await browser.newContext();const errors=[];context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));const page=await blank(context);try{await fn(page);await guard(page);assert.deepEqual(errors,[]);passed++;console.log('PASS import transaction:',name);}catch(error){failures.push({name,error:error.stack||error.message});console.error('FAIL import transaction:',name,error.message);}finally{await context.close();}}
(async()=>{
 try{
  browser=await chromium.launch(launch);
  await scenario('actual backup database survives reload with portable photos and exact original sources',async page=>{
    const before=await setup(page,true);
    const result=await page.evaluate(async before=>{
      const candidate=structuredClone(before.portable);candidate.recipes[0].name='Объединённое вымышленное блюдо';candidate.recipes[0].photos=[candidate.recipes[0].photo,__txImage('#426c37')];delete candidate.recipes[0].photo;
      const result=await KitchenImportTransaction.apply({candidate,currentState:before.data,expectedSource:before.source,draftSource:localStorage.getItem('kitchen-calculator-pr2-browser-drafts-v1')});
      return {data:result.data,backupId:result.backup.id,keys:await __txKeys(KitchenPhotos.DB_NAME,'photos')};
    },before);
    assert.equal(result.data.recipes[0].photoIds[0],before.data.recipes[0].photoId);assert.equal(result.keys.length,2);
    await page.reload();await inject(page);
    const restored=await page.evaluate(async id=>({backup:await KitchenImportTransaction.getBackup(id),list:await KitchenImportTransaction.listBackups(),saved:KitchenStorage.load().data}),result.backupId);
    assert.deepEqual(restored.backup.data,before.portable);assert.equal(restored.backup.source,before.source);assert.equal(restored.backup.draftSource,'fictional independent draft');assert.equal(restored.list[0].id,result.backupId);assert(!Object.hasOwn(restored.list[0],'text'));assert.deepEqual(restored.saved,result.data);
  });
  await scenario('metadata write failure aborts the full backup write in the same IndexedDB transaction',async page=>{
    const before=await setup(page);
    const result=await page.evaluate(async before=>{
      const add=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(...args){if(this.name==='metadata')throw new DOMException('Fictional backup metadata quota','QuotaExceededError');return add.apply(this,args);};
      const candidate=structuredClone(before.data);candidate.recipes[0].name='Другое';let error;
      try{await KitchenImportTransaction.apply({candidate,currentState:before.data,expectedSource:before.source});}catch(e){error=e.message;}finally{IDBObjectStore.prototype.add=add;}
      return {error,source:localStorage.getItem(KitchenStorage.KEY),full:await __txKeys(KitchenImportTransaction.DB_NAME,'backups'),meta:await __txKeys(KitchenImportTransaction.DB_NAME,'metadata')};
    },before);
    assert.match(result.error,/quota/);assert.equal(result.source,before.source);assert.deepEqual(result.full,[]);assert.deepEqual(result.meta,[]);
  });
  await scenario('backup quota blocks apply and preserves a previous complete backup',async page=>{
    const before=await setup(page,true);
    const result=await page.evaluate(async before=>{
      const old=await KitchenImportTransaction.prepareBackup(before.data,{expectedSource:before.source});
      const add=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(...args){if(this.name==='backups')throw new DOMException('Fictional backup quota','QuotaExceededError');return add.apply(this,args);};
      const candidate=structuredClone(before.portable);candidate.recipes[0].name='Другое';let error;
      try{await KitchenImportTransaction.apply({candidate,currentState:before.data,expectedSource:before.source});}catch(e){error=e.message;}finally{IDBObjectStore.prototype.add=add;}
      return {error,source:localStorage.getItem(KitchenStorage.KEY),list:await KitchenImportTransaction.listBackups(),old:await KitchenImportTransaction.getBackup(old.id),photos:await __txKeys(KitchenPhotos.DB_NAME,'photos')};
    },before);
    assert.match(result.error,/quota/);assert.equal(result.source,before.source);assert.equal(result.list.length,1);assert.deepEqual(result.old.data,before.portable);assert.deepEqual(result.photos,[before.data.recipes[0].photoId]);
  });
  await scenario('main localStorage quota rolls back staged images while retaining old photo and durable backup',async page=>{
    const before=await setup(page,true);
    const result=await page.evaluate(async before=>{
      const candidate=structuredClone(before.portable);candidate.recipes[0].photo=__txImage('#ca352c');window.__txMainQuota=true;let error;
      try{await KitchenImportTransaction.apply({candidate,currentState:before.data,expectedSource:before.source});}catch(e){error=e.message;}finally{window.__txMainQuota=false;}
      return {error,source:localStorage.getItem(KitchenStorage.KEY),photos:await __txKeys(KitchenPhotos.DB_NAME,'photos'),backups:await KitchenImportTransaction.listBackups()};
    },before);
    assert.match(result.error,/Импорт не сохранён/);assert.equal(result.source,before.source);assert.deepEqual(result.photos,[before.data.recipes[0].photoId]);assert.equal(result.backups.length,1);
  });
  await scenario('second real photo add failure removes only the first newly staged photo',async page=>{
    const before=await setup(page,true);
    const result=await page.evaluate(async before=>{
      const candidate=structuredClone(before.portable);delete candidate.recipes[0].photo;candidate.recipes[0].photos=[__txImage('#ca352c'),__txImage('#315b9c')];
      const add=IDBObjectStore.prototype.add;let count=0;IDBObjectStore.prototype.add=function(...args){if(this.name==='photos'&&++count===2)throw new DOMException('Fictional second photo quota','QuotaExceededError');return add.apply(this,args);};let error;
      try{await KitchenImportTransaction.apply({candidate,currentState:before.data,expectedSource:before.source});}catch(e){error=e.message;}finally{IDBObjectStore.prototype.add=add;}
      return {error,source:localStorage.getItem(KitchenStorage.KEY),photos:await __txKeys(KitchenPhotos.DB_NAME,'photos'),backups:await KitchenImportTransaction.listBackups()};
    },before);
    assert.match(result.error,/quota/);assert.equal(result.source,before.source);assert.deepEqual(result.photos,[before.data.recipes[0].photoId]);assert.equal(result.backups.length,1);
  });
  await scenario('external change during actual photo staging is retained and new photos are rolled back',async page=>{
    const before=await setup(page,true);
    const result=await page.evaluate(async before=>{
      const candidate=structuredClone(before.portable);candidate.recipes[0].photo=__txImage('#ca352c');const external=structuredClone(before.data);external.recipes[0].name='Данные другой вкладки';const externalSource=KitchenStorage.stringify(external);
      const original=KitchenPhotos.prepareImport;let once=false;KitchenPhotos.prepareImport=async function(data){const result=await original(data);if(!once){once=true;localStorage.setItem(KitchenStorage.KEY,externalSource);}return result;};let error;
      try{await KitchenImportTransaction.apply({candidate,currentState:before.data,expectedSource:before.source});}catch(e){error=e.message;}finally{KitchenPhotos.prepareImport=original;}
      return {error,source:localStorage.getItem(KitchenStorage.KEY),externalSource,photos:await __txKeys(KitchenPhotos.DB_NAME,'photos'),backups:await KitchenImportTransaction.listBackups()};
    },before);
    assert.match(result.error,/другой вкладке/);assert.equal(result.source,result.externalSource);assert.deepEqual(result.photos,[before.data.recipes[0].photoId]);assert.equal(result.backups.length,1);
  });
  await scenario('durable retention keeps the three newest actual backups without touching main or drafts',async page=>{
    const before=await setup(page);
    const result=await page.evaluate(async before=>{
      const ids=[];for(let n=0;n<5;n++)ids.push((await KitchenImportTransaction.prepareBackup(before.data,{expectedSource:before.source})).id);
      return {ids,list:await KitchenImportTransaction.listBackups(),keys:await __txKeys(KitchenImportTransaction.DB_NAME,'backups'),source:localStorage.getItem(KitchenStorage.KEY)};
    },before);
    assert.equal(result.list.length,3);assert.equal(result.keys.length,3);assert(result.keys.includes(result.ids[4]));assert(!result.keys.includes(result.ids[0]));assert.equal(result.source,before.source);
  });
  const name='backup database and binary photos survive an actual Chromium restart';
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'kitchen-import-backup-profile-'));let context;
  try{
    context=await chromium.launchPersistentContext(profile,launch);let page=await blank(context);const before=await setup(page,true);
    const result=await page.evaluate(async before=>{const candidate=structuredClone(before.portable);candidate.recipes[0].name='После переноса';const result=await KitchenImportTransaction.apply({candidate,currentState:before.data,expectedSource:before.source});return {id:result.backup.id,data:result.data};},before);
    await guard(page);await context.close();context=null;context=await chromium.launchPersistentContext(profile,launch);page=await blank(context);
    const reopened=await page.evaluate(async id=>({backup:await KitchenImportTransaction.getBackup(id),data:KitchenStorage.load().data,exported:await KitchenPhotos.exportData(KitchenStorage.load().data)}),result.id);
    assert.deepEqual(reopened.backup.data,before.portable);assert.equal(reopened.backup.source,before.source);assert.deepEqual(reopened.data,result.data);assert.deepEqual(reopened.exported.recipes[0].photo,before.portable.recipes[0].photo);await guard(page);passed++;console.log('PASS import transaction:',name);
  }catch(error){failures.push({name,error:error.stack||error.message});console.error('FAIL import transaction:',name,error.message);}
  finally{if(context)await context.close();await fs.rm(profile,{recursive:true,force:true});}
 }catch(error){failures.push({name:'runner',error:error.stack||error.message});}
 finally{if(browser)await browser.close();}
 for(const failure of failures)console.error(JSON.stringify(failure));console.log(`${passed} import-transaction browser scenarios passed; ${failures.length} failures.`);if(failures.length)process.exitCode=1;
})();
