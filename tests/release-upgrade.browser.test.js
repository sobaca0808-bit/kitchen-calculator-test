'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{chromium}=require('playwright');
const {start}=require('./helpers/runtime-server'),{guard}=require('./helpers/release-storage-guard');
const LIVE='https://sobaca0808-bit.github.io/kitchen-calculator-test/';
const launch={executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']};
const data={version:1,futureOwnerField:{keep:'legacy synthetic value'},products:[{id:'old-food',name:'Проверка обновления · сырьё',price:471.1,packQuantity:1,unit:'kg',massPerPiece:null,gramsPerMl:null}],packaging:[{id:'old-box',name:'Проверка обновления · упаковка',price:390,packQuantity:100,unit:'pcs'}],folders:[{id:'old-folder',name:'Проверка обновления'}],recipes:[{id:'old-prep',type:'prep',name:'Проверка обновления · заготовка',actualYield:1000,ingredients:[{id:'old-raw',refId:'old-food',quantity:1000,unit:'g'}]},{id:'old-dish',type:'dish',name:'Проверка обновления · блюдо',folderId:'old-folder',actualYield:null,portions:1,sellingPrice:350,technology:'1. Взвесить заготовку.\n2. Подать.',photoIds:['old-photo-1','old-photo-2'],ingredients:[{id:'old-ready',refId:'old-prep',quantity:400,unit:'g'}],packaging:[{id:'old-material',refId:'old-box',quantity:1,unit:'pcs',costMode:'auto',freeForGuest:false}]}]};
let server;
async function snapshot(page,keys){return page.evaluate(async keys=>{
 const state=KitchenStorage.load().data,photos=[];
 for(const r of state.recipes)for(const id of KitchenPhotos.ids(r))if(id){const p=await KitchenPhotos.get(id),hash=await crypto.subtle.digest('SHA-256',await p.blob.arrayBuffer());photos.push({id,width:p.width,height:p.height,hash:Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('')});}
 const backups=[];for(const meta of await KitchenImportTransaction.listBackups())backups.push(await KitchenImportTransaction.getBackup(meta.id));
 return {book:localStorage.getItem(keys.book),drafts:localStorage.getItem(keys.drafts),appearance:localStorage.getItem(keys.appearance),photos,backups};
},keys);}
async function save(page){await page.locator('#save-item').click();await page.waitForFunction(()=>document.querySelector('#save-item')?.textContent.includes('Сохранено ✓'));}
(async()=>{
 assert(process.env.KITCHEN_RELEASE_LEGACY_RUNTIME);const bundle=JSON.parse(await fs.readFile(process.env.KITCHEN_RELEASE_LEGACY_RUNTIME,'utf8')),keys=bundle.keys;
 const output=process.env.KITCHEN_RELEASE_ARTIFACTS||path.join(os.tmpdir(),'release-upgrade-proof');await fs.mkdir(output,{recursive:true});
 if(!process.env.KITCHEN_RELEASE_URL){assert(process.env.KITCHEN_RELEASE_RUNTIME_ROOT);server=await start(process.env.KITCHEN_RELEASE_RUNTIME_ROOT);}
 const url=process.env.KITCHEN_RELEASE_URL||server.url;assert(['127.0.0.1','localhost'].includes(new URL(url).hostname)||url===LIVE);const proof=[];
 for(const width of [1366,390]){
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'kitchen-legacy-upgrade-')),errors=[],violations=[];let context,expected,legacyProtected;
  try{
   for(let cycle=0;cycle<3;cycle++){
    context=await chromium.launchPersistentContext(profile,{...launch,locale:'ru-RU',viewport:{width,height:900},isMobile:width<768,hasTouch:width<768,acceptDownloads:true});
    await context.route('**/favicon.ico',r=>r.fulfill({status:204,body:''}));
    if(cycle===0){
     const fixtureURL=new URL('__release_fixture__',url).href;
     await context.route(url+'**',r=>{const requested=new URL(r.request().url()),name=requested.pathname.slice(new URL(url).pathname.length)||'index.html';if(r.request().url()===fixtureURL)return r.fulfill({contentType:'text/html',body:'<!doctype html><title>Legacy setup fixture only</title>'});const bytes=bundle.files[name];assert(bytes,'Unexpected old fixture resource: '+name);return r.fulfill({contentType:name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':name.endsWith('.js')?'text/javascript':name.endsWith('.webp')?'image/webp':'image/svg+xml',body:Buffer.from(bytes,'base64')});});
     const seed=await context.newPage();await seed.goto(fixtureURL);
     await seed.evaluate(async({keys,data})=>{
      localStorage.setItem(keys.book,JSON.stringify(data));localStorage.setItem(keys.appearance,'sage');
      localStorage.setItem('kitchen-calculator-preview-v1','foreign preview sentinel');localStorage.setItem('kitchen-calculator-v1','foreign production sentinel');
      const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(keys.photos,1);r.onupgradeneeded=()=>r.result.createObjectStore('photos',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      for(let i=1;i<=2;i++){const c=document.createElement('canvas');c.width=160;c.height=100;const x=c.getContext('2d');x.fillStyle=i===1?'#a65b77':'#788672';x.fillRect(0,0,160,100);const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));await new Promise((resolve,reject)=>{const tx=db.transaction('photos','readwrite');tx.objectStore('photos').add({id:'old-photo-'+i,blob,width:160,height:100,mime:blob.type});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}db.close();
     },{keys,data});await seed.close();
    }
    await guard(context,keys,violations);const page=await context.newPage();page.setDefaultTimeout(25000);page.on('dialog',d=>d.accept());page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    const response=await page.goto(url);assert.equal(response.status(),200);await page.waitForFunction(()=>window.KitchenStorage&&window.KitchenPhotos&&window.KitchenDrafts&&window.KitchenImportTransaction);
    if(cycle===0){
     await page.evaluate(async()=>{const state=KitchenStorage.load().data,raw=localStorage.getItem(KitchenStorage.KEY),dish=state.recipes.find(r=>r.id==='old-dish');const saved=KitchenDrafts.save({id:dish.id,type:'dish',isNew:false,data:{...dish,technology:'Незавершённая работа до обновления'}});if(!saved.ok)throw Error(saved.error);await KitchenImportTransaction.prepareBackup(state,{expectedSource:raw,draftSource:localStorage.getItem(KitchenDrafts.KEY)});});
     expected=await snapshot(page,keys);assert.equal(expected.photos.length,2);assert.equal(expected.backups.length,1);legacyProtected=expected;
    }else{
     await page.waitForFunction(()=>window.KitchenExpensesUI&&window.KitchenAppearance);assert.deepEqual(await snapshot(page,keys),expected,'Upgrade and browser restart must preserve exact database, photos, draft, backup and appearance');
     const names=await page.evaluate(()=>({book:KitchenStorage.KEY,drafts:KitchenDrafts.KEY,photos:KitchenPhotos.DB_NAME,backups:KitchenImportTransaction.DB_NAME,appearance:KitchenAppearance.KEY}));assert.deepEqual(names,keys);
     assert.equal(await page.evaluate(()=>document.documentElement.dataset.kitchenTheme),'sage');
     assert.match(await page.title(),/Кухонный калькулятор себестоимости/);assert(!/ТЕСТ PR/.test(await page.locator('.test-notice').innerText()));
     await page.locator('[data-tab=dish]').click();await page.locator('[data-open=old-dish]').click();await page.waitForFunction(()=>!document.querySelector('#print-recipe').disabled);assert.equal(await page.locator('#card-photos img').count(),2);
     if(cycle===1){
      assert(!(await page.locator('#include-establishment-expenses').isChecked()));assert.match(await page.locator('.card-cost').innerText(),/192,34/);
      const before=await page.evaluate(()=>KitchenStorage.load().data);await page.locator('[data-tab=expenses]').click();await page.locator('#expense-period').fill('2026-11');
      for(const [name,value] of Object.entries({plannedPortions:3000,rent:120000,utilities:18000,payroll:84000,other:0}))await page.locator('#expense-'+name).fill(String(value));await save(page);
      const after=await page.evaluate(()=>KitchenStorage.load().data);for(const key of ['products','packaging','folders','recipes','futureOwnerField'])assert.deepEqual(after[key],before[key]);
      await page.locator('[data-tab=dish]').click();await page.locator('[data-open=old-dish]').click();await page.waitForFunction(()=>!document.querySelector('#print-recipe').disabled);await page.locator('#include-establishment-expenses').check();assert.match(await page.locator('.card-cost').innerText(),/266,34/);
      expected=await snapshot(page,keys);for(const key of ['drafts','photos','backups','appearance'])assert.deepEqual(expected[key],legacyProtected[key]);
      await page.screenshot({path:path.join(output,'upgrade-'+width+'.png'),fullPage:true});
     }else{assert(await page.locator('#include-establishment-expenses').isChecked());assert.match(await page.locator('.card-cost').innerText(),/266,34/);}
     assert.equal(await page.evaluate(()=>__releaseRead('kitchen-calculator-preview-v1')),'foreign preview sentinel');assert.equal(await page.evaluate(()=>__releaseRead('kitchen-calculator-v1')),'foreign production sentinel');
     assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    }
    await context.close();context=null;
   }
   assert.deepEqual(errors,[]);assert.deepEqual(violations,[]);proof.push({width,url,passed:true,legacySetup:'intercepted previous-main fixture in a disposable profile',upgradeTransport:process.env.KITCHEN_RELEASE_URL?'real HTTPS; no application response overrides':'local release build',chromeStarts:3,exactLegacyDataPreserved:true,photos:2,backups:1,draftPreserved:true,foreignStorageViolations:violations,consoleErrors:errors});await fs.writeFile(path.join(output,'upgrade-proof.json'),JSON.stringify(proof,null,2)+'\n');console.log('PASS RELEASE UPGRADE:',width,'old main -> current release -> complete browser restart; exact data, photos, backup, draft and own keys preserved');
  }finally{await context?.close();await fs.rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
 }
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await server?.close();});
