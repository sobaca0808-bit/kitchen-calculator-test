'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const target=new URL(process.env.KITCHEN_PREVIEW_URL||'');
if(!['localhost','127.0.0.1','[::1]'].includes(target.hostname)&&target.href!=='https://sobaca0808-bit.github.io/kitchen-calculator-test/preview/')throw Error('Only the isolated preview may be checked.');
const KEY='kitchen-calculator-preview-v1',DRAFT='kitchen-calculator-preview-drafts-v1';
const PREF='kitchen-calculator-appearance-preview-v1';
const PHOTO='kitchen-calculator-preview-photos-v1',BACKUP='kitchen-calculator-preview-import-backups-v1';
const protectedKeys=['kitchen-calculator-v1','kitchen-calculator-pr2-browser-test-v1','kitchen-calculator-pr2-browser-drafts-v1','kitchen-calculator-appearance-test-v1'];
const sentinel='{"fictional":"preview-protected-placeholder"}';
const output=process.env.KITCHEN_PREVIEW_ARTIFACTS||'/tmp/kitchen-published-preview-proof';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const proof=[];
 try{await fs.mkdir(output,{recursive:true});
 for(const width of [1366,390]){
  const context=await browser.newContext({viewport:{width,height:900},isMobile:width<768,hasTouch:width<768,acceptDownloads:true});const errors=[];
  await context.route('**/favicon.ico',route=>route.fulfill({status:204,body:''}));
  await context.addInitScript(({key,draft,pref,photo,backup,protectedKeys,sentinel})=>{
   const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
   for(const name of protectedKeys)if(get.call(localStorage,name)===null)set.call(localStorage,name,sentinel);
   window.__previewRead=name=>get.call(localStorage,name);window.__previewStorage=[];window.__previewDB=[];
   for(const method of ['getItem','setItem','removeItem','clear']){const original=Storage.prototype[method];Storage.prototype[method]=function(...args){window.__previewStorage.push({method,key:args[0]});if(method==='clear'||![key,draft,pref].includes(args[0]))throw Error('Forbidden preview storage access: '+String(args[0]));return original.apply(this,args);};}
   for(const method of ['open','deleteDatabase']){const original=IDBFactory.prototype[method];IDBFactory.prototype[method]=function(name,...args){window.__previewDB.push({method,name});if(method==='deleteDatabase'||![photo,backup].includes(name))throw Error('Forbidden preview IndexedDB access: '+name);return original.apply(this,[name,...args]);};}
  },{key:KEY,draft:DRAFT,pref:PREF,photo:PHOTO,backup:BACKUP,protectedKeys,sentinel});
  const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});page.on('dialog',dialog=>dialog.accept());
  try{
   const response=await page.goto(target.href);assert.equal(response.status(),200);await page.waitForFunction(()=>window.KitchenStorage&&window.KitchenPhotos&&window.KitchenImportTransaction);
   assert.equal(await page.evaluate(()=>KitchenStorage.KEY),KEY);assert.equal(await page.evaluate(()=>KitchenDrafts.KEY),DRAFT);assert.equal(await page.evaluate(()=>KitchenPhotos.DB_NAME),PHOTO);assert.equal(await page.evaluate(()=>KitchenImportTransaction.DB_NAME),BACKUP);
   assert.equal(await page.evaluate(()=>KitchenAppearance.KEY),PREF);assert.equal(await page.evaluate(()=>KitchenAppearance.current()),'berry');
   assert.match(await page.locator('.test-notice').innerText(),/PR №20/);assert.equal(await page.locator('#editor').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 253, 249)');
   assert.match(await page.evaluate(()=>getComputedStyle(document.body).backgroundImage),/watercolor-kitchen\.webp/);
   for(const slot of await page.locator('#card-photos [data-empty=true]').all())assert((await slot.boundingBox()).height<=96);
   const initial=await page.evaluate(()=>KitchenStorage.load().data);assert(initial.products.every(p=>p.price===null),'No real prices were published');
   await page.locator('[data-tab="dish"]').click();await page.locator('#create').click();await page.locator('#item-name').fill('Проверка предпросмотра');await page.locator('#technology').fill('Вымышленная карточка, только для проверки.');
   await page.waitForFunction(()=>KitchenDrafts.load().items.some(r=>r.data.name==='Проверка предпросмотра'));
   const id=await page.evaluate(()=>KitchenDrafts.load().items.find(r=>r.data.name==='Проверка предпросмотра').id);
   await page.reload();await page.locator(`[data-restore-draft="${id}"]`).click();assert.equal(await page.locator('#item-name').inputValue(),'Проверка предпросмотра');
   const sourceCommit=JSON.parse(await fs.readFile(path.join(__dirname,'dist/preview-version.json'),'utf8')).source_commit;
   assert.match(sourceCommit,/^[a-f0-9]{40}$/);const image=execFileSync('git',['show',sourceCommit+':tests/fixtures/berry-galette.webp']);
   for(const [i,selector]of ['#photo-file','#photo-file-2'].entries()){
    await page.locator(selector).setInputFiles({name:'fictional-preview.webp',mimeType:'image/webp',buffer:image});
    await page.waitForFunction(i=>document.querySelector(`.photo-editor [data-photo-slot="${i}"] img`)?.naturalWidth>0&&!document.querySelector(i?'#photo-file-2':'#photo-file').disabled,i);
   }
   await page.locator('#save-item').click();await page.locator('#save-item').click();assert.equal(await page.evaluate(id=>KitchenStorage.load().data.recipes.filter(r=>r.id===id).length,id),1);
   await page.locator('#view-recipe').click();await page.waitForFunction(()=>document.querySelectorAll('#card-photos img').length===2&&Array.from(document.querySelectorAll('#card-photos img')).every(img=>img.naturalWidth>0));
   const downloadEvent=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadEvent;const backupData=JSON.parse(await fs.readFile(await download.path(),'utf8'));
   assert.equal(backupData.recipes.find(r=>r.id===id).photos.filter(Boolean).length,2);assert(!JSON.stringify(backupData).includes('preview-protected-placeholder'));
   backupData.products.push({...backupData.products[0],id:'preview-ui-extra',name:'Учебный продукт предпросмотра'});
   await page.locator('#import-file').setInputFiles({name:'fictional-preview.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backupData))});
   await page.waitForFunction(()=>!document.querySelector('#import-panel').hidden&&document.querySelector('#import-panel').getAttribute('aria-busy')==='false');await page.locator('#import-apply').click();
   await page.waitForFunction(()=>/Объединение выполнено/.test(document.querySelector('#message').textContent));
   assert(await page.evaluate(()=>KitchenStorage.load().data.products.some(p=>p.id==='preview-ui-extra')));
   await page.reload();await page.locator(`[data-open="${id}"]`).click();await page.waitForFunction(()=>document.querySelectorAll('#card-photos img').length===2&&Array.from(document.querySelectorAll('#card-photos img')).every(img=>img.naturalWidth>0));
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   const beforeTheme=await page.evaluate(key=>window.__previewRead(key),KEY),origin=await page.evaluate(()=>performance.timeOrigin),themes=[];
   for(const theme of ['berry','graphite','sage']){
    await page.locator('#appearance-toggle').click();await page.locator(`input[name=kitchen-appearance][value=${theme}]`).check();await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>KitchenAppearance.current()),theme);assert.equal(await page.evaluate(key=>window.__previewRead(key),KEY),beforeTheme);assert.equal(await page.evaluate(()=>performance.timeOrigin),origin);
    await page.evaluate(async()=>{await document.fonts.ready;const urls=[...getComputedStyle(document.body).backgroundImage.matchAll(/url\(["']?([^"')]+)/g)].map(m=>m[1]);await Promise.all(urls.map(url=>new Promise(resolve=>{const i=new Image();i.onload=resolve;i.onerror=resolve;i.src=url;})));});
    await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(output,theme+'-'+(width===390?'mobile':'desktop')+'.png'),fullPage:true});themes.push(theme);
   }
   await page.reload();await page.waitForFunction(()=>!document.querySelector('#print-recipe').disabled);assert.equal(await page.evaluate(()=>KitchenAppearance.current()),'sage');assert.equal(await page.evaluate(key=>window.__previewRead(key),KEY),beforeTheme);
   const guard=await page.evaluate(keys=>({protected:keys.map(k=>window.__previewRead(k)),storage:window.__previewStorage,db:window.__previewDB}),protectedKeys);
   assert(guard.protected.every(value=>value===sentinel));assert(guard.storage.every(op=>op.method!=='clear'&&[KEY,DRAFT,PREF].includes(op.key)));assert(guard.db.every(op=>op.method!=='deleteDatabase'&&[PHOTO,BACKUP].includes(op.name)));assert.deepEqual(errors,[]);
   proof.push({url:target.href,width,httpStatus:response.status(),themes,preferencePersisted:true,draftRestored:true,photosPersisted:2,jsonMerged:true,protectedStorageUnchanged:true,storageAccess:guard.storage,indexedDBAccess:guard.db,consoleErrors:errors});console.log('PASS isolated three-theme published preview at '+width+'px');
  }finally{await context.close();}
 }
 await fs.writeFile(path.join(output,'browser-proof.json'),JSON.stringify(proof,null,2)+'\n');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
