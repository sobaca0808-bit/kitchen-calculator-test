'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const PREVIEW={book:'kitchen-calculator-preview-v1',drafts:'kitchen-calculator-preview-drafts-v1',photos:'kitchen-calculator-preview-photos-v1',backups:'kitchen-calculator-preview-import-backups-v1',appearance:'kitchen-calculator-appearance-preview-v1'};
const TEST={book:'kitchen-calculator-pr2-browser-test-v1',drafts:'kitchen-calculator-pr2-browser-drafts-v1',photos:'kitchen-calculator-test-photos-v1',backups:'kitchen-calculator-test-import-backups-v1',appearance:'kitchen-calculator-appearance-test-v1'};
const names={product:'Проверка 21 · Рис учебный',material:'Проверка 21 · Контейнер учебный',prep:'Проверка 21 · Отварной рис',dish:'Проверка 21 · Подача риса',folder:'Проверка 21 · Учебная кухня',draft:'Черновик 21 · Продолжить приготовление'};
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
async function snapshot(page){
 return page.evaluate(async()=>{
  const data=KitchenStorage.load().data,raw=localStorage.getItem(KitchenStorage.KEY),drafts=KitchenDrafts.load();
  if(drafts.error)throw Error(drafts.error);
  const records=drafts.items.map(record=>{const copy=structuredClone(record);delete copy.updatedAt;return copy;});
  const photos=[];
  for(const recipe of data?.recipes||[])for(const id of KitchenPhotos.ids(recipe))if(id){const record=await KitchenPhotos.get(id),hash=await crypto.subtle.digest('SHA-256',await record.blob.arrayBuffer());photos.push({id,sha256:Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join(''),width:record.width,height:record.height});}
  return {raw,data,drafts:records,photos,appearance:localStorage.getItem(KitchenAppearance.KEY)};
 });
}
async function tab(page,name){await page.locator(`[data-tab="${name}"]`).click();}
async function save(page){await page.locator('#save-item').click();await page.waitForFunction(()=>document.querySelector('#save-item')?.textContent.includes('Сохранено ✓'));}
async function createCatalog(page,type,name,price,quantity){
 await tab(page,type);await page.locator('#create').click();await page.locator('#item-name').fill(name);await page.locator('#price').fill(String(price));await page.locator('#packQuantity').fill(String(quantity));await save(page);
 return page.evaluate(({type,name})=>KitchenStorage.load().data[type].find(item=>item.name===name).id,{type,name});
}
async function ingredient(page,name,quantity){
 await page.locator('#add-row').click();const row=page.locator('.ingredient-row').last();await row.locator('.ingredient-search').fill(name);await row.locator('.suggestion').first().click();await row.locator('input[id^="qty-"]').fill(String(quantity));
}
async function upload(page,index){
 const data=await page.evaluate(index=>{const canvas=document.createElement('canvas');canvas.width=240;canvas.height=160;const ctx=canvas.getContext('2d');ctx.fillStyle=index?'#6b855c':'#9b6079';ctx.fillRect(0,0,240,160);ctx.fillStyle='#fff8ee';ctx.beginPath();ctx.ellipse(120,80,70,45,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#bda670';ctx.fillRect(80,55,70,35);return canvas.toDataURL('image/jpeg',.9);},index);
 await page.locator(index?'#photo-file-2':'#photo-file').setInputFiles({name:'fictional-lifecycle-'+index+'.jpg',mimeType:'image/jpeg',buffer:Buffer.from(data.split(',')[1],'base64')});
 await page.waitForFunction(index=>document.querySelector(`.photo-editor [data-photo-slot="${index}"] img`)?.naturalWidth>0&&!document.querySelector(index?'#photo-file-2':'#photo-file').disabled,index);
}
async function createThroughUI(page){
 const product=await createCatalog(page,'products',names.product,137.5,1),material=await createCatalog(page,'packaging',names.material,300,100);
 await tab(page,'prep');await page.locator('#create').click();await page.locator('#item-name').fill(names.prep);await ingredient(page,names.product,1000);await page.locator('#actualYield').fill('2000');await page.locator('#technology').fill('Учебный сценарий: отварить рис.');await save(page);
 const prep=await page.evaluate(name=>KitchenStorage.load().data.recipes.find(r=>r.name===name).id,names.prep);
 await tab(page,'dish');await page.locator('#folder-create').click();await page.locator('#folder-name').fill(names.folder);await page.locator('#folder-submit').click();
 const folder=await page.evaluate(name=>KitchenStorage.load().data.folders.find(f=>f.name===name).id,names.folder);
 await page.locator('#create').click();await page.locator('#item-name').fill(names.dish);await page.locator('#recipe-folder').selectOption(folder);await ingredient(page,names.prep,400);await page.locator('#recipe-portions').fill('2');await page.locator('#dish-yield').fill('400');await page.locator('#selling-price').fill('249');await page.locator('#technology').fill('1. Взвесить готовый рис.\n2. Разделить на две порции.');await page.locator('details:has(#recipe-note) summary').click();await page.locator('#recipe-note').fill('Данные вымышленные, создано проверкой Issue 21.');
 await page.locator('#add-packaging-row').click();await page.locator('select[id^="pack-ref-"]').selectOption(material);await page.locator('input[id^="pack-qty-"]').fill('1');
 await upload(page,0);await upload(page,1);await save(page);await page.locator('#view-recipe').click();await page.waitForFunction(()=>!document.querySelector('#print-recipe').disabled);
 const dish=await page.evaluate(name=>KitchenStorage.load().data.recipes.find(r=>r.name===name).id,names.dish);
 await page.locator('#edit-recipe').click();await page.locator('#item-name').fill(names.draft);await page.locator('#technology').fill('Незавершённая технология должна остаться после закрытия.');
 await page.waitForFunction(name=>KitchenDrafts.load().items.some(r=>r.data.name===name),names.draft);await tab(page,'products');
 return {product,material,prep,folder,dish};
}
async function checkContents(page,ids,price){
 const result=await page.evaluate(({ids,price,names})=>{
  const loaded=KitchenStorage.load();if(loaded.error||!loaded.data)throw Error(loaded.error||'Saved database is absent');const data=loaded.data;
  const product=data.products.find(p=>p.id===ids.product),recipe=data.recipes.find(r=>r.id===ids.dish),prep=data.recipes.find(r=>r.id===ids.prep);
  const cost=KitchenCalc.calcRecipe(data,ids.dish),packaging=KitchenPackaging.calculate(data,recipe,2);
  return {price:product?.price,name:recipe?.name,folderId:recipe?.folderId,folderName:data.folders.find(f=>f.id===ids.folder)?.name,prep:prep?.name,photoCount:KitchenPhotos.ids(recipe).filter(Boolean).length,sellingPrice:recipe?.sellingPrice,cost:cost.knownCost,packaging:packaging.knownCost,draft:KitchenDrafts.load().items.some(r=>r.data.name===names.draft)};
 },{ids,price,names});
 assert.equal(result.price,price);assert.equal(result.name,names.dish);assert.equal(result.folderId,ids.folder);assert.equal(result.folderName,names.folder);assert.equal(result.prep,names.prep);assert.equal(result.photoCount,2);assert.equal(result.sellingPrice,249);assert(Math.abs(result.cost-price*.2)<1e-9);assert.equal(result.packaging,6);assert(result.draft);return result;
}
async function runCycle({chromium,url,rootURL,keys,width,cycles,output,launch,theme,expectInitialEmpty,expectStaleProtection,downloadPolicy,runtimeBundle,profile,cycle,state}){
 let {expected,ids,price}=state;const report=state.report;let context;
 try{
   await fs.mkdir(path.join(profile,'downloads'),{recursive:true});
   context=await chromium.launchPersistentContext(profile,{...launch,viewport:{width,height:900},isMobile:width<768,hasTouch:width<768,acceptDownloads:true,downloadsPath:path.join(profile,'downloads'),timezoneId:'Europe/Moscow',env:{...process.env,...launch.env,XDG_DATA_HOME:path.join(profile,'xdg-data'),XDG_CONFIG_HOME:path.join(profile,'xdg-config'),XDG_CACHE_HOME:path.join(profile,'xdg-cache')}});
   await context.route('**/favicon.ico',route=>route.fulfill({status:204,body:''}));
   if(runtimeBundle){
    const bundle=JSON.parse(await fs.readFile(runtimeBundle,'utf8'));
    await context.route('https://sobaca0808-bit.github.io/kitchen-calculator-test/**',route=>{
      const requested=new URL(route.request().url()),preview=requested.pathname.startsWith('/kitchen-calculator-test/preview/'),prefix=preview?'/kitchen-calculator-test/preview/':'/kitchen-calculator-test/';
      const file=requested.pathname.slice(prefix.length)||'index.html',entry=(preview?bundle.preview:bundle.base)[file];
      if(route.request().method()!=='GET'||!entry)throw Error('Unexpected candidate fixture request: '+requested.pathname);
      const contentType=file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.webp')?'image/webp':'text/javascript';
      return route.fulfill({status:200,contentType,body:Buffer.from(entry,'base64'),headers:{'x-kitchen-fixture':'candidate-only-not-published'}});
    });
   }
   const watched=new WeakSet(),watch=page=>{if(watched.has(page))return;watched.add(page);page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});};
   context.on('page',watch);for(const existing of context.pages())watch(existing);
   await context.addInitScript(key=>{try{window.__beforeCalculator=localStorage.getItem(key);}catch(error){window.__beforeCalculatorError=error.message;}},keys.book);
   let page=context.pages().find(existing=>existing.url()==='about:blank')||await context.newPage();page.setDefaultTimeout(25000);const response=await page.goto(url);assert.equal(response.status(),200);await page.waitForFunction(()=>window.KitchenStorage&&window.KitchenPhotos&&window.KitchenDrafts&&window.KitchenAppearance);
   const namespaces=await page.evaluate(()=>({book:KitchenStorage.KEY,drafts:KitchenDrafts.KEY,photos:KitchenPhotos.DB_NAME,backups:KitchenImportTransaction.DB_NAME,appearance:KitchenAppearance.KEY}));assert.deepEqual(namespaces,keys);
   if(cycle===0){
    const before=await page.evaluate(()=>window.__beforeCalculator),after=await snapshot(page);report.initialRecordPresent=before!==null;report.wroteInitialDatabase=before===null&&after.raw!==null;report.initialProducts=after.data?.products.length||0;report.initialRecipes=after.data?.recipes.length||0;
    if(expectInitialEmpty){assert.equal(after.raw,null);assert.equal(report.initialProducts,0);assert.equal(report.initialRecipes,0);}
    ids=await createThroughUI(page);
    if(theme&&(theme!=='berry'||process.env.KITCHEN_GLASS_TEST==='1')){await page.locator('#appearance-toggle').click();await page.locator(`input[name=kitchen-appearance][value=${theme}]`).check();await page.keyboard.press('Escape');}
   }else{
    const reopened=await snapshot(page);assert.deepEqual(reopened,expected,'All saved values/photo bytes and drafts survive a real browser restart, without re-seeding or import');
    await checkContents(page,ids,price);price+=1;
    await tab(page,'products');await page.locator(`[data-open="${ids.product}"]`).click();await page.locator('#price').fill(String(price));await save(page);
   }
   const contents=await checkContents(page,ids,price);expected=await snapshot(page);
   // The ordinary JSON export includes saved cards, folders and both photos;
   // unfinished draft changes intentionally remain separate.
   let portable;const verifyDownload=downloadPolicy==='all'||cycle===0;
   if(verifyDownload){const event=page.waitForEvent('download');await page.locator('#export').click();const download=await event;assert.equal(await download.failure(),null,'The portable JSON download completes before browser shutdown, cycle '+(cycle+1));portable=JSON.parse(await fs.readFile(await download.path(),'utf8'));}
   else portable=await page.evaluate(()=>KitchenPhotos.exportData(KitchenStorage.load().data));
   const exported=portable.recipes.find(r=>r.id===ids.dish);assert.equal(exported.name,names.dish);assert.equal(exported.photos.filter(Boolean).length,2);assert.equal(portable.folders.find(f=>f.id===ids.folder).name,names.folder);assert.equal(portable.products.find(p=>p.id===ids.product).price,price);
   let rootNamespaces;
   if(rootURL&&cycle===0){
    const root=await context.newPage();await root.goto(rootURL);await root.waitForFunction(()=>window.KitchenStorage&&window.KitchenDrafts&&window.KitchenPhotos);
    rootNamespaces=await root.evaluate(()=>({book:KitchenStorage.KEY,drafts:KitchenDrafts.KEY,photos:KitchenPhotos.DB_NAME}));assert.equal(rootNamespaces.book,TEST.book);assert.notEqual(rootNamespaces.book,keys.book);assert.deepEqual(await snapshot(page),expected,'Opening the root must not alter the preview data');await root.close();
   }
   await tab(page,'dish');await page.locator('#folder-filter').selectOption('all');await page.locator(`[data-open="${ids.dish}"]`).click();await page.waitForFunction(()=>!document.querySelector('#print-recipe').disabled);await page.screenshot({path:path.join(output,`lifecycle-${width}-${cycle+1}.png`),fullPage:true});
   report.cycles.push({cycle:cycle+1,contents,rawSha256:sha(expected.raw),photoHashes:expected.photos.map(p=>p.sha256),draftCount:expected.drafts.length,rootNamespaces,exportVerifiedBy:verifyDownload?'browser-download':'portable-export-api',closedChromeProcess:true});
   if(cycle===cycles-1){
    const stale=await context.newPage();stale.setDefaultTimeout(25000);await stale.goto(url);await stale.waitForFunction(()=>window.KitchenStorage);
    const markerName='Проверка 21 · Новая запись другой вкладки';await createCatalog(page,'products',markerName,51,1);
    await tab(stale,'products');await stale.locator(`[data-open="${ids.product}"]`).click();await stale.locator('#price').fill('999.25');await stale.locator('#save-item').click();
    const latest=await stale.evaluate(()=>KitchenStorage.load().data);report.staleOverwriteObserved=!latest.products.some(p=>p.name===markerName);report.staleSaveMessage=await stale.locator('#message').innerText();
    if(expectStaleProtection){assert.equal(report.staleOverwriteObserved,false,'A stale tab must not erase a newer saved record');assert.equal(latest.products.find(p=>p.id===ids.product).price,price);assert.equal(await stale.locator('#price').inputValue(),'999.25');}
    await stale.close();
   }
   await context.close();context=null;
  return {expected,ids,price,report};
 }finally{await context?.close();}
}
async function lifecycle({url,rootURL,keys=PREVIEW,width=390,cycles=3,output,launch,theme,expectInitialEmpty=false,expectStaleProtection=false,downloadPolicy='all',runtimeBundle}){
 const target=new URL(url);assert(['127.0.0.1','localhost','[::1]'].includes(target.hostname)||target.href==='https://sobaca0808-bit.github.io/kitchen-calculator-test/preview/');
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'kitchen-issue21-profile-'));
 assert(['all','first-process'].includes(downloadPolicy));
 const config={url,rootURL,keys,width,cycles,output,launch,theme,expectInitialEmpty,expectStaleProtection,downloadPolicy,runtimeBundle};
 let state={expected:null,ids:null,price:137.5,report:{url,width,theme:theme||'berry',cycles:[],errors:[],profileSeeded:false,isolatedDriverPerRestart:true,runtimeTransport:runtimeBundle?'intercepted-candidate-not-published':'http'}};
 try{
  for(let cycle=0;cycle<cycles;cycle++){
   const request=path.join(profile,'cycle-'+cycle+'.json'),result=request+'.result';
   await fs.writeFile(request,JSON.stringify({...config,profile,cycle,state}));
   // Restart both the browser process and its driver. The expected-state JSON is
   // only an assertion oracle; it is never written back into browser storage.
   await new Promise((resolve,reject)=>{
    const child=require('node:child_process').spawn(process.execPath,[path.join(__dirname,'persistence-worker.js'),request,result],{env:{...process.env,KITCHEN_TEST_THEME:''},stdio:['ignore','pipe','pipe']});
    let logs='';for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{logs=(logs+chunk).slice(-16000);});
    child.once('error',reject);child.once('exit',(code,signal)=>code===0?resolve():reject(Error('Browser restart '+(cycle+1)+' failed ('+(signal||code)+'): '+logs)));
   });
   state=JSON.parse(await fs.readFile(result,'utf8'));
  }
  assert.deepEqual(state.report.errors,[]);state.report.namespaces=keys;state.report.passed=true;return state.report;
 }finally{await fs.rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
}
module.exports={PREVIEW,TEST,names,snapshot,lifecycle,runCycle};
