'use strict';
if(process.env.KITCHEN_UNIFIED_TEST==='1')require('./helpers/unified-navigation').bootstrap();
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{chromium}=require('playwright');
const {start}=require('./helpers/combined-preview-server.js'),{lifecycle,PREVIEW,TEST}=require('./helpers/persistence-lifecycle.js');
const root=path.resolve(__dirname,'..'),output=process.env.KITCHEN_TEST_ARTIFACT_DIR||path.join(os.tmpdir(),'kitchen-issue21-proof');
const launch={executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']};
const book=(price=130)=>({version:1,products:[{id:'rice',name:'Учебный рис',aliases:'',price,packQuantity:1,unit:'kg',massPerPiece:null,gramsPerMl:null,note:''}],recipes:[]});
let server,browser,passed=0;const failures=[],proof=[];
async function setup(entries={},photos={},width=390){
 const context=await browser.newContext({viewport:{width,height:900},isMobile:width<768,hasTouch:width<768,acceptDownloads:true}),page=await context.newPage(),errors=[];
 await context.route('**/favicon.ico',route=>route.fulfill({status:204,body:''}));await page.route('**/__issue21_setup',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Synthetic storage fixture</title>'}));
 await page.goto(new URL('/__issue21_setup',server.url).href);
 await page.evaluate(async({entries,photos})=>{
  for(const [key,value]of Object.entries(entries))localStorage.setItem(key,value);
  for(const [name,ids]of Object.entries(photos)){
   const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>r.result.createObjectStore('photos',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
   const canvas=document.createElement('canvas');canvas.width=160;canvas.height=120;const ctx=canvas.getContext('2d');ctx.fillStyle='#819878';ctx.fillRect(0,0,160,120);ctx.fillStyle='#f6efe4';ctx.fillRect(40,30,70,55);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
   for(const id of ids)await new Promise((resolve,reject)=>{const tx=db.transaction('photos','readwrite');tx.objectStore('photos').add({id,blob,width:160,height:120,mime:blob.type});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
  }
 },{entries,photos});
 await context.addInitScript(({book,drafts})=>{
  const nativeGet=Storage.prototype.getItem,nativeSet=Storage.prototype.setItem;window.__read=key=>nativeGet.call(localStorage,key);window.__write=(key,value)=>nativeSet.call(localStorage,key,value);window.__bookOps=[];
  Storage.prototype.setItem=function(key,value){window.__bookOps.push(key);if(key===book&&window.__quota)throw new DOMException('Fictional quota','QuotaExceededError');if((key===book||key===drafts)&&window.__silentWrite)return;return nativeSet.call(this,key,value);};
 },{book:PREVIEW.book,drafts:PREVIEW.drafts});
 page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});page.setDefaultTimeout(20000);await page.goto(server.previewURL);return {context,page,errors};
}
async function test(name,entries,photos,fn,width){
 const state=await setup(entries,photos,width);
 try{await fn(state.page,state.context);assert.deepEqual(state.errors,[]);assert(await state.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));console.log('PASS preview persistence:',name);passed++;proof.push({name,passed:true,consoleErrors:state.errors});}
 catch(error){console.error('FAIL preview persistence:',name,error.stack);failures.push(name+': '+error.message);}
 finally{await state.context.close();}
}
const raw=(page,key=PREVIEW.book)=>page.evaluate(key=>window.__read(key),key);
async function diagnostics(page){if(!await page.locator('#storage-diagnostics-open').isVisible())await page.goto(server.previewURL+'#storage-diagnostics');else await page.locator('#storage-diagnostics-open').click();await page.waitForSelector('#storage-sources [data-storage-source]');}
async function download(page,selector){const event=page.waitForEvent('download');await page.locator(selector).click();const file=await event;return fs.readFile(await file.path(),'utf8');}
async function mergeSource(page,id='test-root'){
 await page.locator(`[data-storage-source="${id}"] [data-diagnostic-action=merge]`).click();
 await page.waitForFunction(()=>!document.querySelector('#import-panel').hidden&&document.querySelector('#import-panel').getAttribute('aria-busy')==='false');
}
async function apply(page){await page.locator('#import-apply').click();await page.waitForFunction(()=>/Объединение выполнено|Импорт отменён|не подтвердил/.test(document.querySelector('#message').textContent));}
async function dbCount(page,name,store){return page.evaluate(async({name,store})=>{
 if(!(await indexedDB.databases()).some(db=>db.name===name))return 0;const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(name);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readonly'),r=tx.objectStore(store).count();tx.oncomplete=()=>{db.close();resolve(r.result);};tx.onerror=()=>{db.close();reject(tx.error);};});
 },{name,store});}
(async()=>{
 await fs.mkdir(output,{recursive:true});server=await start(root);browser=await chromium.launch(launch);
 await test('absent preview stays empty despite valuable records in other namespaces; first folder saves explicitly',{[TEST.book]:JSON.stringify(book(170)),['kitchen-calculator-v1']:JSON.stringify(book(240))},{},async page=>{
  assert.equal(await raw(page),null);assert.equal(await page.locator('[data-open]').count(),0);assert.equal(await page.locator('#count-products').innerText(),'0');assert(!(await page.evaluate(()=>window.__bookOps)).includes(PREVIEW.book));assert.match(await page.locator('#message').innerText(),/отсутствует/);
  await page.locator('#folder-create').click();await page.locator('#folder-name').fill('Первая папка без демо');await page.locator('#folder-submit').click();const value=JSON.parse(await raw(page));assert.equal(value.products.length,0);assert.equal(value.recipes.length,0);assert.equal(value.folders[0].name,'Первая папка без демо');assert.equal(await raw(page,TEST.book),JSON.stringify(book(170)));assert(await page.locator('#storage-help').isHidden());
 });
 await test('a saved preview opens itself with no migration, write or recovery panel',{[PREVIEW.book]:JSON.stringify({...book(),futureOwnerField:{keep:'yes'}})},{},async page=>{
  const before=await raw(page);assert(await page.locator('#storage-help').isHidden());assert(await page.locator('#storage-diagnostics').isHidden());assert(!await page.locator('#message').isVisible());await page.reload();assert.equal(await raw(page),before);assert(!(await page.evaluate(()=>window.__bookOps)).includes(PREVIEW.book));
 });
 await test('corruption remains exact, raw export works and import stays blocked',{[PREVIEW.book]:'{broken raw',[TEST.book]:JSON.stringify(book())},{},async page=>{
  assert.match(await page.locator('#message').innerText(),/заблокированы/);assert.equal(await download(page,'#download-damaged-source'),'{broken raw');await diagnostics(page);assert.match(await page.locator('[data-storage-source=current]').innerText(),/JSON/);assert.equal(await raw(page),'{broken raw');assert.equal(await raw(page,TEST.book),JSON.stringify(book()));
 });
 await test('diagnosis of both different databases is read-only, with individual exports',{[PREVIEW.book]:JSON.stringify(book(130)),[TEST.book]:JSON.stringify(book(170))},{},async page=>{
  const current=await raw(page),other=await raw(page,TEST.book);await diagnostics(page);assert.match(await page.locator('[data-storage-source=current]').innerText(),/130/);assert.match(await page.locator('[data-storage-source=test-root]').innerText(),/170/);
  assert.equal(await download(page,'[data-storage-source=current] [data-diagnostic-action=raw]'),current);assert.equal(await download(page,'[data-storage-source=test-root] [data-diagnostic-action=raw]'),other);assert.equal(await raw(page),current);assert.equal(await raw(page,TEST.book),other);await page.screenshot({path:path.join(output,'diagnostics-mobile.png'),fullPage:true});
 });
 const portableSource={...book(150),folders:[{id:'folder',name:'Учебная папка'}],recipes:[{id:'dish',type:'dish',name:'Учебная карточка',note:'',actualYield:null,ingredients:[],folderId:'folder',photoId:'source-photo',sellingPrice:249}]};
 await test('explicit recovery reuses merge preview and mandatory backup; donor photos and drafts stay unchanged',{[TEST.book]:JSON.stringify(portableSource),[TEST.drafts]:JSON.stringify({version:1,items:[]})},{[TEST.photos]:['source-photo']},async page=>{
  const donor=await raw(page,TEST.book),drafts=await raw(page,TEST.drafts);await diagnostics(page);await mergeSource(page);assert.equal(await raw(page),null);assert.equal(await dbCount(page,PREVIEW.backups,'backups'),0);await apply(page);
  const value=JSON.parse(await raw(page));assert.equal(value.products[0].price,150);assert.equal(value.folders[0].name,'Учебная папка');assert.equal(value.recipes[0].sellingPrice,249);assert(value.recipes[0].photoId!=='source-photo');assert.equal(await dbCount(page,PREVIEW.photos,'photos'),1);assert.equal(await dbCount(page,TEST.photos,'photos'),1);assert.equal(await raw(page,TEST.book),donor);assert.equal(await raw(page,TEST.drafts),drafts);assert.equal(await dbCount(page,PREVIEW.backups,'backups'),1);
  await page.reload();assert.equal(JSON.parse(await raw(page)).recipes[0].name,'Учебная карточка');assert.equal(await page.locator('#card-photos img').count(),1);
 });
 await test('conflicting prices require a choice and both versions can be kept',{[PREVIEW.book]:JSON.stringify(book(130)),[TEST.book]:JSON.stringify(book(170))},{},async page=>{
  const donor=await raw(page,TEST.book);await diagnostics(page);await mergeSource(page);assert(await page.locator('#import-apply').isDisabled());const choices=page.locator('[data-conflict-choice]');assert(await choices.count()>0);for(const select of await choices.all())await select.selectOption('both');await page.waitForFunction(()=>!document.querySelector('#import-apply').disabled);await apply(page);assert.deepEqual(JSON.parse(await raw(page)).products.map(p=>p.price).sort((a,b)=>a-b),[130,170]);assert.equal(await raw(page,TEST.book),donor);
 });
 await test('cancel recovery leaves both databases unchanged without a backup write',{[PREVIEW.book]:JSON.stringify(book(130)),[TEST.book]:JSON.stringify({...book(170),products:[{...book(170).products[0],id:'other-rice'}]})},{},async page=>{
  const before=await raw(page),donor=await raw(page,TEST.book);await diagnostics(page);await mergeSource(page);await page.locator('#import-cancel').click();assert.equal(await raw(page),before);assert.equal(await raw(page,TEST.book),donor);assert.equal(await dbCount(page,PREVIEW.backups,'backups'),0);
 });
 await test('a donor changed after preview aborts recovery and keeps the new donor data',{[PREVIEW.book]:JSON.stringify(book(130)),[TEST.book]:JSON.stringify({...book(170),products:[{...book(170).products[0],id:'other-rice'}]})},{},async page=>{
  const before=await raw(page);await diagnostics(page);await mergeSource(page);for(const select of await page.locator('[data-conflict-choice]').all())await select.selectOption('both');await page.waitForFunction(()=>!document.querySelector('#import-apply').disabled);const newer=JSON.stringify(book(181));await page.evaluate(({key,value})=>window.__write(key,value),{key:TEST.book,value:newer});await apply(page);assert.match(await page.locator('#message').innerText(),/изменился/);assert.equal(await raw(page),before);assert.equal(await raw(page,TEST.book),newer);
 });
 await test('stale save is rejected even if no storage event was delivered; input can be exported',{[PREVIEW.book]:JSON.stringify(book(130))},{},async page=>{
  await page.locator('[data-tab=products]').click();await page.locator('#price').fill('999,25');const newer=JSON.stringify(book(180));await page.evaluate(({key,value})=>window.__write(key,value),{key:PREVIEW.book,value:newer});await page.locator('#save-item').click();assert.match(await page.locator('#message').innerText(),/другой вкладке/);assert.equal(await raw(page),newer);assert.equal(await page.locator('#price').inputValue(),'999,25');const exported=JSON.parse(await download(page,'#export'));assert.equal(exported.products[0].price,999.25);assert.equal(await raw(page),newer);
 });
 await test('quota never looks saved and keeps the last database plus editable input',{[PREVIEW.book]:JSON.stringify(book(130))},{},async page=>{
  const before=await raw(page);await page.locator('[data-tab=products]').click();await page.locator('#price').fill('234,5');await page.evaluate(()=>window.__quota=true);await page.locator('#save-item').click();assert.equal(await raw(page),before);assert.match(await page.locator('#save-item').innerText(),/Повторить/);assert.match(await page.locator('#save-state').innerText(),/В памяти/);assert.equal(JSON.parse(await download(page,'#export')).products[0].price,234.5);assert.equal(await raw(page),before);
 });
 await test('silent failed writes are detected instead of reporting success',{[PREVIEW.book]:JSON.stringify(book(130))},{},async page=>{
  const before=await raw(page);await page.locator('[data-tab=products]').click();await page.locator('#price').fill('234');await page.evaluate(()=>window.__silentWrite=true);await page.locator('#save-item').click();assert.match(await page.locator('#message').innerText(),/не подтвердил/);assert.equal(await raw(page),before);assert.equal(await page.locator('#save-item').getAttribute('class'),'primary');
 });
 await test('missing foreign photo blocks recovery and does not create a foreign database',{[TEST.book]:JSON.stringify(portableSource)},{},async page=>{
  await diagnostics(page);await page.locator('[data-storage-source=test-root] [data-diagnostic-action=merge]').click();await page.waitForFunction(()=>document.querySelector('#storage-diagnostics').getAttribute('aria-busy')==='false');assert.match(await page.locator('#message').innerText(),/фотографий/);assert.equal(await raw(page),null);assert(!(await page.evaluate(()=>indexedDB.databases())).some(db=>db.name===TEST.photos));
 });
 await test('unconfirmed import keeps committed photo references and reloads the actual saved database',{[PREVIEW.book]:JSON.stringify(book(130))},{},async page=>{
  const image=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=160;canvas.height=120;const ctx=canvas.getContext('2d');ctx.fillStyle='#78916a';ctx.fillRect(0,0,160,120);return canvas.toDataURL('image/png');});
  const incoming={...book(180),recipes:[{id:'new-dish',type:'dish',name:'Запись с неподтверждённым чтением',note:'',actualYield:null,ingredients:[],photo:{dataUrl:image,mime:'image/png',width:160,height:120}}]};
  await page.locator('#import-file').setInputFiles({name:'uncertain-test.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(incoming))});await page.waitForFunction(()=>!document.querySelector('#import-panel').hidden&&document.querySelector('#import-panel').getAttribute('aria-busy')==='false');
  for(const select of await page.locator('[data-conflict-choice]').all())await select.selectOption('both');await page.waitForFunction(()=>!document.querySelector('#import-apply').disabled);
  await page.evaluate(bookKey=>{const get=Storage.prototype.getItem,set=Storage.prototype.setItem;let written=false;Storage.prototype.setItem=function(key,value){const result=set.call(this,key,value);if(key===bookKey)written=true;return result;};Storage.prototype.getItem=function(key){if(key===bookKey&&written)throw new DOMException('Fictional verification denial','SecurityError');return get.call(this,key);};},PREVIEW.book);
  await apply(page);assert.match(await page.locator('#message').innerText(),/не подтвердил/);const actual=JSON.parse(await raw(page)),saved=actual.recipes.find(r=>r.id==='new-dish');assert(saved.photoId);assert.equal(await dbCount(page,PREVIEW.photos,'photos'),1);assert.equal(await dbCount(page,PREVIEW.backups,'backups'),1);
  if(process.env.KITCHEN_UNIFIED_TEST==='1')page.once('dialog',dialog=>dialog.accept());
  await page.reload();await page.locator('[data-open="new-dish"]').click();await page.waitForFunction(()=>!document.querySelector('#print-recipe').disabled);assert.equal(await page.locator('#card-photos img').count(),1);
 });
 await test('denied storage does not replace anything and has an explicit diagnosis',{}, {},async(page,context)=>{
  await context.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Fictional security denial','SecurityError');}}));await page.reload();assert.match(await page.locator('#message').innerText(),/Не удалось прочитать/);await page.locator('#storage-diagnostics-open').click();assert.match(await page.locator('#storage-sources').innerText(),/недоступно/);
 });
 await test('diagnostics are opt-in on a healthy database and hidden in A4',{[PREVIEW.book]:JSON.stringify(book())},{},async page=>{
  assert(await page.locator('#storage-help').isHidden());await diagnostics(page);await page.emulateMedia({media:'print'});assert(await page.locator('#storage-help').isHidden());assert(await page.locator('#storage-diagnostics').isHidden());
 },1366);
 await browser.close();browser=null;
 const routed=process.env.KITCHEN_ROUTED_HTTPS_AUDIT==='1',runtimeBundle=routed?path.join(output,'candidate-runtime.json'):undefined;
 if(routed)await fs.writeFile(runtimeBundle,JSON.stringify({base:Object.fromEntries([...server.base].map(([name,data])=>[name,data.toString('base64')])),preview:Object.fromEntries([...server.preview].map(([name,data])=>[name,data.toString('base64')]))}));
 const lifecycleReports=[];
 for(const theme of ['berry','graphite','sage'])for(const width of [1366,390]){
  const name=`${theme}: product, price, prep, dish, folder, packaging, both photos and draft survive three Chrome restarts at ${width}px`;
  try{const folder=path.join(output,theme);await fs.mkdir(folder,{recursive:true});const result=await lifecycle({chromium,url:routed?'https://sobaca0808-bit.github.io/kitchen-calculator-test/preview/':server.previewURL,rootURL:routed?'https://sobaca0808-bit.github.io/kitchen-calculator-test/':server.url,keys:PREVIEW,width,cycles:3,output:folder,launch,theme,expectInitialEmpty:true,expectStaleProtection:true,downloadPolicy:process.env.KITCHEN_PERSISTENCE_DOWNLOAD_POLICY||'all',runtimeBundle});lifecycleReports.push(result);console.log('PASS preview persistence:',name);passed++;proof.push({name,passed:true,consoleErrors:result.errors});}
  catch(error){console.error('FAIL preview persistence:',name,error.stack);failures.push(name+': '+error.message);}
 }
 await fs.writeFile(path.join(output,'fixed-lifecycle.json'),JSON.stringify(lifecycleReports,null,2)+'\n');await fs.writeFile(path.join(output,'persistence-proof.json'),JSON.stringify(proof,null,2)+'\n');
 console.log(`${passed} preview-persistence browser scenarios passed; ${failures.length} failures.`);if(failures.length)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();await server?.close();});
