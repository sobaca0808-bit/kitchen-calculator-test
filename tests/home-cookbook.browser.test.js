'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process'),{chromium}=require('playwright');
const {start}=require('./helpers/runtime-server'),fixture=require('./helpers/unified-fixture'),{snapshot}=require('./helpers/persistence-lifecycle'),{guard}=require('./helpers/release-storage-guard');
const keys={book:'kitchen-calculator-sintez-preview-v1',drafts:'kitchen-calculator-sintez-drafts-v1',photos:'kitchen-calculator-sintez-photos-v1',backups:'kitchen-calculator-sintez-import-backups-v1',appearance:'kitchen-calculator-sintez-appearance-v1'},seen='kitchen-calculator-sintez-presentation-seen-v1';
const output=process.env.HOME_COOKBOOK_ARTIFACTS||path.join(os.tmpdir(),'home-cookbook-proof'),launch={executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']},results=[],printProof=[];
let browser,server,url,baselineServer,baselineURL;
async function seed(context,{empty=false,photos=1,old=false,theme='graphite'}={}){
 const p=await context.newPage(),target=new URL('__unified_fixture__',url).href;await p.route(target,r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Synthetic unified fixture</title>'}));await p.goto(target);
 const photo=(await fs.readFile(path.join(__dirname,'fixtures/risotto.webp'))).toString('base64');
 await p.evaluate(async({keys,seen,data,photo,empty,photos,old,theme})=>{
  localStorage.setItem('kitchen-calculator-v1','PROTECTED production database');localStorage.setItem(seen,'1');if(theme)localStorage.setItem(keys.appearance,theme);if(empty)return;
  const recipe=data.recipes.find(r=>r.id==='risotto');if(old)delete recipe.cookingMinutes;if(photos)recipe[old?'photoId':'photoIds']=old?'one':photos===1?['one',null]:['one','two'];
  localStorage.setItem(keys.book,JSON.stringify(data));const raw=atob(photo),blob=new Blob([Uint8Array.from(raw,c=>c.charCodeAt(0))],{type:'image/webp'}),bitmap=await createImageBitmap(blob),width=bitmap.width,height=bitmap.height;bitmap.close();
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(keys.photos,1);r.onupgradeneeded=()=>r.result.createObjectStore('photos',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});for(const id of ['one','two'])await new Promise((resolve,reject)=>{const tx=db.transaction('photos','readwrite');tx.objectStore('photos').put({id,blob,width,height,mime:blob.type});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
 },{keys,seen,data:fixture(),photo,empty,photos,old,theme});await p.close();
}
async function ready(p){await p.waitForFunction(()=>!!window.KitchenUnifiedUI);await p.evaluate(()=>document.fonts.ready);}
async function cardReady(p){await p.waitForFunction(()=>document.querySelector('#print-recipe')?.disabled===false);}
async function menu(p,id){if(await p.locator('#unified-sidebar').isHidden())await p.locator('#unified-menu-toggle').click();await p.locator('#unified-menu [data-unified-tool='+id+']').click();}
async function mode(p,id){await p.locator('[data-sintez-mode='+id+']').click();assert.equal(await p.locator('html').getAttribute('data-sintez-workspace-mode'),id);}
async function settings(p){await p.locator('.sintez-header [data-sintez-route=settings]').click();}
async function back(p){await p.locator('#sintez-settings [data-sintez-home]').click();}
async function save(p){await p.locator('#save-item').click();await p.waitForFunction(()=>document.querySelector('#save-item')?.textContent.includes('Сохранено ✓'));}
async function view(p){await p.locator('#view-recipe').click();await cardReady(p);}
async function settle(p){await p.mouse.move(0,0);await p.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));}
async function noOverflow(p){assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No page horizontal overflow');}
async function shot(p,name){await noOverflow(p);await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:path.join(output,name+'.png'),fullPage:true});await p.screenshot({path:path.join(output,name+'-viewport.png')});}
async function test(name,fn,{width=1440,height=1000,...data}={}){
 if(process.env.HOME_COOKBOOK_FILTER&&!name.includes(process.env.HOME_COOKBOOK_FILTER))return;
 const context=await browser.newContext({viewport:{width,height},isMobile:width<768,hasTouch:width<768,acceptDownloads:true}),errors=[],violations=[];let page;
 try{await seed(context,data);await guard(context,{...keys,extraLocal:[seen],readOnly:['kitchen-calculator-v1','kitchen-calculator-pwa-preview-v1','kitchen-calculator-pr2-browser-test-v1']},violations);context.on('page',p=>{p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});p.on('dialog',d=>d.accept());});page=await context.newPage();await page.goto(url);await ready(page);await fn(page,context);assert.deepEqual(errors,[]);assert.deepEqual(violations,[]);await noOverflow(page);results.push({name,passed:true});console.log('PASS HOME:',name);}
 catch(e){if(page)await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});throw e;}finally{await context.close();}
}
async function addIngredient(p,name,quantity){await p.locator('#add-row').click();const row=p.locator('.ingredient-row').last();await row.locator('.ingredient-search').fill(name);await row.locator('.suggestion').first().click();await row.locator('input[id^=qty-]').fill(String(quantity));}
async function exportJSON(p){await settings(p);const event=p.waitForEvent('download');await p.locator('#export').click();const download=await event;assert.equal(await download.failure(),null);const data=JSON.parse(await fs.readFile(await download.path(),'utf8'));return data;}
async function importJSON(p,data){await settings(p);await p.locator('#import').click();await p.locator('#import-file').setInputFiles({name:'unified-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});await p.waitForFunction(()=>!document.querySelector('#import-panel').hidden&&document.querySelector('#import-panel').getAttribute('aria-busy')==='false');if(await p.locator('#import-apply').isDisabled()){assert.match(await p.locator('#import-progress').innerText(),/Новых изменений нет/);await p.locator('#import-cancel').click();}else{await p.locator('#import-apply').click();await p.waitForFunction(()=>/Объединение выполнено/.test(document.querySelector('#message').textContent));}}
async function upload(p,index){await p.locator(index?'#photo-file-2':'#photo-file').setInputFiles(path.join(__dirname,'fixtures/risotto.webp'));await p.waitForFunction(index=>{const image=document.querySelector('.photo-editor [data-photo-slot="'+index+'"] img'),input=document.querySelector(index?'#photo-file-2':'#photo-file');return image?.naturalWidth>0&&!input.disabled;},index);}
const finance=/₽|цен[аыу]|стоимост|нацен|марж|прибыл|фудкост|рентабельн|расход[ыао]|финансов/iu;
async function noFinance(p){
 assert.doesNotMatch(await p.locator('body').innerText(),finance);
 for(const selector of ['#price','#packQuantity','#base-price','#selling-price','#profitability-preview','#packaging-editor','#expenses-preview','#card-mode','#print-expense-detail','.item-cost'])for(const el of await p.locator(selector).all())assert(await el.isHidden(),'Home hides '+selector);
 assert.equal(await p.locator('.card-cost,.portion-cost,.profitability-card,.packaging-card,#include-establishment-expenses').count(),0);
 await noOverflow(p);
}
async function options(p){if(!await p.locator('#print-photos').isVisible())await p.locator('.unified-card-options>summary').click();}
(async()=>{
 await fs.mkdir(output,{recursive:true});
 if(process.env.HOME_COOKBOOK_URL){url=process.env.HOME_COOKBOOK_URL;assert.equal(url,'https://sobaca0808-bit.github.io/kitchen-calculator-test/sintez-home-book/');}
 else {server=await start(process.env.KITCHEN_SINTEZ_RUNTIME_ROOT||path.resolve(__dirname,'..'),{home:true});url=server.url;}
 browser=await chromium.launch(launch);
 for(const width of [1440,390,320])await test('Home areas, product/prep editors, suggestions and settings contain no financial UI '+width,async p=>{
  const before=await snapshot(p);await noFinance(p);await shot(p,'home-card-'+width);
  await menu(p,'products');await p.locator('[data-open=rice]').click();await noFinance(p);await p.locator('#item-name').focus();await p.keyboard.press('Tab');assert(!['price','packQuantity'].includes(await p.evaluate(()=>document.activeElement.id)));
  await menu(p,'prep');await p.locator('[data-open=stock]').click();await noFinance(p);await shot(p,'home-prep-'+width);
  await menu(p,'recipes');await p.locator('[data-open=bowl]').click();await cardReady(p);assert.match(await p.locator('.chef-ingredients').innerText(),/Грибная основа.*Полуфабрикат/s);await noFinance(p);
  await p.locator('#edit-recipe').click();await addIngredient(p,'Рис',20);await noFinance(p);await p.locator('.remove-row').last().click();
  await settings(p);await noFinance(p);for(const id of ['about','help','feedback']){await p.locator('[data-info='+id+']').click();await noFinance(p);await p.keyboard.press('Escape');}await back(p);
  assert.equal((await snapshot(p)).raw,before.raw);
 },{width,photos:2});
 for(const width of [1440,390])await test('Home creates, edits, saves and deletes recipes, products and linked preps without prices '+width,async p=>{
  const original=await snapshot(p);
  await menu(p,'products');await p.locator('#create').click();await p.locator('#item-name').fill('Домашний рис');await noFinance(p);await save(p);await p.locator('#item-name').fill('Домашний рис круглый');await save(p);
  await menu(p,'prep');await p.locator('#create').click();await p.locator('#item-name').fill('Домашний отварной рис');await addIngredient(p,'Домашний рис',100);await p.locator('#actualYield').fill('250');await p.locator('#technology').fill('Отварить.');await save(p);
  await menu(p,'recipes');await p.locator('#create').click();await p.locator('#item-name').fill('Моя домашняя тарелка');await addIngredient(p,'Домашний отварной рис',200);await p.locator('#recipe-portions').fill('2');await p.locator('#dish-yield').fill('200');await p.locator('#cooking-minutes').fill('25');await p.locator('#technology').fill('Выложить и подать.');await p.locator('.recipe-note summary').last().click();await p.locator('#recipe-note').fill('Семейная запись.');await upload(p,0);await upload(p,1);await noFinance(p);await save(p);await view(p);await noFinance(p);
  assert.match(await p.locator('.chef-ingredients').innerText(),/100 г.*200 г/s);assert.equal(await p.locator('#card-photos img').count(),2);
  const saved=await p.evaluate(()=>KitchenStorage.load().data.recipes.find(r=>r.name==='Моя домашняя тарелка'));assert(saved.id);await p.reload();await ready(p);await menu(p,'recipes');await p.locator('[data-open="'+saved.id+'"]').click();await cardReady(p);await noFinance(p);
  await p.locator('#edit-recipe').click();await p.locator('#item-name').fill('Домашняя тарелка после правки');await save(p);await view(p);await noFinance(p);
  const data=await exportJSON(p);assert.equal(data.products.find(x=>x.id==='rice').price,420);assert.deepEqual(data.establishmentExpenses,original.data.establishmentExpenses);assert.equal(data.recipes.find(r=>r.id===saved.id).photos.filter(Boolean).length,2);await back(p);await importJSON(p,data);await back(p);await noFinance(p);
  await menu(p,'recipes');await p.locator('[data-open="'+saved.id+'"]').click();await cardReady(p);await p.locator('#edit-recipe').click();await p.locator('#delete-item').click();assert.equal(await p.evaluate(id=>KitchenStorage.load().data.recipes.some(r=>r.id===id),saved.id),false);
  const after=await snapshot(p);for(const id of ['risotto','bowl','stock'])assert.deepEqual(after.data.recipes.find(r=>r.id===id),original.data.recipes.find(r=>r.id===id));assert.deepEqual(after.data.packaging,original.data.packaging);
 },{width,photos:2});
 await test('Home edits preserve all professional values and hidden raw invalid product/recipe drafts',async p=>{
  const before=await snapshot(p);await p.locator('#edit-recipe').click();await p.locator('#technology').fill('Домашнее приготовление');await save(p);const saved=await snapshot(p),a=saved.data.recipes.find(r=>r.id==='risotto'),b=before.data.recipes.find(r=>r.id==='risotto');assert.deepEqual({...a,technology:b.technology},b);assert.deepEqual(saved.photos,before.photos);assert.deepEqual(saved.data.packaging,before.data.packaging);assert.deepEqual(saved.data.establishmentExpenses,before.data.establishmentExpenses);
  await mode(p,'business');await p.locator('#selling-price').fill('3,');await mode(p,'home');assert.equal(await p.locator('#selling-price').inputValue(),'3,');await noFinance(p);await p.locator('#save-item').click();assert.equal((await snapshot(p)).raw,saved.raw);await mode(p,'business');assert.equal(await p.locator('#selling-price').inputValue(),'3,');await p.locator('#selling-price').fill('420');await save(p);
  await menu(p,'products');await p.locator('[data-open=rice]').click();await p.locator('#price').fill('5,');await p.locator('#packQuantity').fill('2,');await mode(p,'home');await noFinance(p);await p.locator('#save-item').click();assert.equal(await p.evaluate(()=>KitchenStorage.load().data.products.find(p=>p.id==='rice').price),420);await mode(p,'chef');assert.equal(await p.locator('#price').inputValue(),'5,');assert.equal(await p.locator('#packQuantity').inputValue(),'2,');
 },{photos:2});
 await test('valid product and prep edits preserve hidden prices, metadata and full JSON',async p=>{
  const before=await snapshot(p);await menu(p,'products');await p.locator('[data-open=rice]').click();await p.locator('#item-name').fill('Рис с домашним названием');await save(p);let after=await snapshot(p);assert.deepEqual({...after.data.products[0],name:before.data.products[0].name},before.data.products[0]);
  await menu(p,'prep');await p.locator('[data-open=stock]').click();await p.locator('#technology').fill('Обновлённое приготовление');await save(p);after=await snapshot(p);assert.deepEqual({...after.data.recipes[0],technology:before.data.recipes[0].technology},before.data.recipes[0]);const backup=await exportJSON(p);assert.deepEqual(backup.products,after.data.products);assert.deepEqual(backup.recipes.map(r=>r.sellingPrice),after.data.recipes.map(r=>r.sellingPrice));assert.deepEqual(backup.establishmentExpenses,before.data.establishmentExpenses);
 });
 await test('Home photo print choices never reveal money, while professional print choices survive',async p=>{
  const before=await snapshot(p);await mode(p,'business');await options(p);await p.locator('#print-photos').selectOption('first');await mode(p,'home');await options(p);assert.equal(await p.locator('#print-photos').inputValue(),'both');
  for(const selection of ['none','first','second','both']){await p.emulateMedia({media:'screen'});await p.locator('#print-photos').selectOption(selection);await cardReady(p);await noFinance(p);await p.emulateMedia({media:'print'});await noFinance(p);const pdf=path.join(output,'home-'+selection+'.pdf');await p.pdf({path:pdf,format:'A4',preferCSSPageSize:true});const text=execFileSync('pdftotext',[pdf,'-']).toString();assert.doesNotMatch(text,finance);assert.match(text,/Рис арборио/);assert.match(text,/1800 г/);const visible=await p.locator('#card-photos img:visible').count();assert.equal(visible,{none:0,first:1,second:1,both:2}[selection]);printProof.push({selection,financeFree:true,photos:visible});}
  await p.emulateMedia({media:'screen'});await mode(p,'business');await options(p);assert.equal(await p.locator('#print-photos').inputValue(),'first');assert(await p.locator('#card-mode').isVisible());assert(await p.locator('.card-cost').isVisible());assert.deepEqual(await snapshot(p),before);
 },{photos:2});
 await test('Home comparison hides financial fields but confirmed import/export retains complete records',async p=>{
  const original=await snapshot(p),data=await exportJSON(p);await back(p);data.products[0].price=777;data.recipes.find(r=>r.id==='risotto').sellingPrice=900;data.establishmentExpenses.rent=50000;
  await settings(p);await p.locator('#import').click();await p.locator('#import-file').setInputFiles({name:'home-conflicts.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});await p.waitForFunction(()=>document.querySelector('#import-panel').getAttribute('aria-busy')==='false');for(const d of await p.locator('#import-conflicts details').all())await d.locator('summary').click();await noFinance(p);for(const field of ['price','sellingPrice','rent','payroll'])assert(!(await p.locator('#import-conflicts').innerText()).includes('"'+field+'"'));
  const n=await p.locator('[data-conflict-choice]').count();assert(n>=3);for(let i=0;i<n;i++){await p.locator('[data-conflict-choice]').nth(i).selectOption('incoming');await p.waitForFunction(()=>document.querySelector('#import-panel').getAttribute('aria-busy')==='false');}await p.locator('#import-apply').click();await p.waitForFunction(()=>document.querySelector('#import-panel').hidden);const after=await exportJSON(p);assert.equal(after.products[0].price,777);assert.equal(after.recipes.find(r=>r.id==='risotto').sellingPrice,900);assert.equal(after.establishmentExpenses.rent,50000);assert.deepEqual((await snapshot(p)).photos,original.photos);assert(await p.locator('#import-backups').isVisible());await back(p);await noFinance(p);
 },{photos:2});
 await test('Home draft restores after reload; mode changes preserve money and working ingredients',async p=>{
  const original=await snapshot(p);await p.locator('#edit-recipe').click();await p.locator('#item-name').fill('Незавершённая домашняя запись');await p.locator('#technology').fill('Не потерять после закрытия.');await menu(p,'prep');await p.reload();await ready(p);await p.locator('[data-restore-draft=risotto]').click();await noFinance(p);assert.equal(await p.locator('#item-name').inputValue(),'Незавершённая домашняя запись');await mode(p,'chef');assert.equal(await p.locator('#selling-price').inputValue(),'420');await mode(p,'business');assert(await p.locator('#packaging-editor').isVisible());await mode(p,'home');await noFinance(p);assert.equal((await snapshot(p)).raw,original.raw);await save(p);assert.equal((await snapshot(p)).data.recipes.find(r=>r.id==='risotto').sellingPrice,420);
 },{photos:2});
 await test('legacy single photo and no-price products stay usable across all three modes',async p=>{
  const before=await snapshot(p);await noFinance(p);assert.equal(await p.locator('#card-photos img').count(),1);await mode(p,'chef');assert(await p.locator('.card-cost').isVisible());await mode(p,'business');assert(await p.locator('#include-establishment-expenses').isVisible());await mode(p,'home');await noFinance(p);assert.deepEqual(await snapshot(p),before);
 },{old:true});
 await fs.writeFile(path.join(output,'home-cookbook-proof.json'),JSON.stringify({url,passed:results.length,scenarios:results,printProof,physicalAndroidTested:false},null,2)+'\n');console.log(results.length+' HOME scenarios passed; 0 failures.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();await server?.close();});
