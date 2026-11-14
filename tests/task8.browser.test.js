/* Task #8 runs exclusively on a disposable loopback origin with fictional data. */
'use strict';
const {replaceJSONFromFile}=require('./helpers/import-preview.js');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const {chromium} = require('playwright');
const TEST_KEY = 'kitchen-calculator-pr2-browser-test-v1';
const DRAFT_KEY = 'kitchen-calculator-pr2-browser-drafts-v1';
const PRODUCTION_KEY = 'kitchen-calculator-v1';
const SENTINEL = '{"fictional":"task-8-production-placeholder"}';
const testURL = process.env.KITCHEN_TEST_URL;
if (!testURL) throw Error('KITCHEN_TEST_URL must point to an isolated loopback server.');
const target = new URL(testURL);
if (!['http:', 'https:'].includes(target.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) {
  throw Error('Task #8 checks may run only against a loopback server.');
}
function fixture() {
  const row = (id, refId, quantity) => ({id, refId, quantity, unit:'g', lossPercent:null, outputGrams:null, note:''});
  return {version:1,
    products:[{id:'rice',name:'Вымышленный рис',aliases:'',price:100,packQuantity:1,unit:'kg',massPerPiece:null,gramsPerMl:null,note:''}],
    packaging:[{id:'foil',name:'Фольга',price:500,packQuantity:100,unit:'m',note:''},{id:'box',name:'Контейнер',price:500,packQuantity:50,unit:'pcs',note:''}],
    recipes:[
      {id:'dish-a',type:'dish',name:'Тестовая порция риса',portions:2,actualYield:240,technology:'1. Разогреть.\n2. Подать.',note:'Вымышленный рецепт.',ingredients:[row('cooked-row','prep-a',200),row('rice-row','rice',50)],packaging:[
        {id:'foil-row',refId:'foil',quantity:60,unit:'cm',freeForGuest:false,costMode:'auto'},
        {id:'box-row',refId:'box',quantity:1,unit:'pcs',freeForGuest:true,costMode:'auto'}]},
      {id:'dish-b',type:'dish',name:'Вторая тестовая порция',portions:1,actualYield:100,technology:'Подать.',note:'',ingredients:[row('second-rice-row','rice',100)]},
      {id:'prep-a',type:'prep',name:'Тестовый варёный рис',actualYield:2000,technology:'Отварить.',note:'',ingredients:[row('prep-rice-row','rice',1000)]}
    ]};
}
const stored = page => page.evaluate(key=>JSON.parse(localStorage.getItem(key)),TEST_KEY);
const drafts = page => page.evaluate(()=>KitchenDrafts.load().items);
const draftById = async (page,id) => (await drafts(page)).find(record=>record.id===id);
const firstPhotoId = recipe => recipe.photoIds?.[0] || recipe.photoId || undefined;
const embeddedPhoto = recipe => recipe.photos?.[0] || recipe.photo;
async function draftSaved(page) {
  await page.waitForFunction(()=>document.querySelector('#draft-status')?.textContent.includes('Черновик сохранён'));
}
async function edit(page,id='dish-a') {
  if (await page.locator('.workspace').getAttribute('data-section') !== 'dish') await page.locator('[data-tab="dish"]').click();
  await page.locator(`[data-open="${id}"]`).click();
  await page.locator('#edit-recipe').click();
}
async function restore(page,id) {
  await page.locator(`#drafts-panel [data-restore-draft="${id}"]`).click();
  assert.equal(await page.locator('#item-name').count(),1);
}
async function noOverflow(page) {
  assert(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1),'No horizontal page overflow');
}
async function guard(page) {
  assert.equal(await page.evaluate(()=>KitchenStorage.KEY),TEST_KEY);
  assert.equal(await page.evaluate(()=>KitchenDrafts.KEY),DRAFT_KEY);
  const proof = await page.evaluate(key=>({sentinel:window.__task8NativeRead(key),ops:window.__task8Ops}),PRODUCTION_KEY);
  assert.equal(proof.sentinel,SENTINEL);
  assert(proof.ops.length && proof.ops.every(op=>op.method!=='clear' && [TEST_KEY,DRAFT_KEY].includes(op.key)),'App touches only the exact test/draft localStorage keys');
  await noOverflow(page);
}
async function makeContext(browser,{width=1366,data=fixture()}={}) {
  const context = await browser.newContext({viewport:{width,height:900},acceptDownloads:true});
  await context.addInitScript(({key,draftKey,productionKey,sentinel,data})=>{
    if (!['http:','https:'].includes(location.protocol)) return;
    const nativeGet=Storage.prototype.getItem,nativeSet=Storage.prototype.setItem;
    if (nativeGet.call(localStorage,key)===null) nativeSet.call(localStorage,key,JSON.stringify(data));
    nativeSet.call(localStorage,productionKey,sentinel);
    window.__task8Ops=[];
    window.__task8NativeRead=k=>nativeGet.call(localStorage,k);
    for (const method of ['getItem','setItem','removeItem','clear']) {
      const original=Storage.prototype[method];
      Storage.prototype[method]=function(...args) {
        window.__task8Ops.push({method,key:args[0]});
        if (method==='setItem' && args[0]===draftKey && window.__task8BlockDrafts) throw new DOMException('Fictional draft quota','QuotaExceededError');
        if (method==='setItem' && args[0]===key && window.__task8BlockMain) throw new DOMException('Fictional main quota','QuotaExceededError');
        return original.apply(this,args);
      };
    }
  },{key:TEST_KEY,draftKey:DRAFT_KEY,productionKey:PRODUCTION_KEY,sentinel:SENTINEL,data});
  return context;
}
async function imageFile(page,color='#476d37',width=1800,height=1400) {
  const source=await page.evaluate(({color,width,height})=>{
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,width,height);
    ctx.fillStyle='#e7ce8f';ctx.beginPath();ctx.arc(width/2,height/2,height/3,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#b43b2c';for(let i=0;i<20;i++){ctx.beginPath();ctx.arc(width*.25+(i%5)*width*.12,height*.25+Math.floor(i/5)*height*.15,height*.035,0,Math.PI*2);ctx.fill();}
    return canvas.toDataURL('image/png');
  },{color,width,height});
  return {name:'fictional-dish.png',mimeType:'image/png',buffer:Buffer.from(source.split(',')[1],'base64')};
}
async function uploadPhoto(page,file) {
  await page.locator('#photo-file').setInputFiles(file);
  await page.waitForFunction(()=>{
    const img=document.querySelector('.photo-editor img');
    return img && img.complete && img.naturalWidth>0 && !document.querySelector('#photo-file')?.disabled;
  });
}
async function showCard(page) {
  await page.locator('#view-recipe').click();
  await page.waitForFunction(()=>document.querySelector('#print-recipe')?.disabled===false);
}
async function exportJSON(page) {
  const waiting=page.waitForEvent('download');await page.locator('#export').click();
  const download=await waiting;return JSON.parse(await fs.readFile(await download.path(),'utf8'));
}
async function importJSON(page,data){return replaceJSONFromFile(page,data,{name:'fictional-task8.json',waitForCompletion:false});}

let browser,passed=0;
const failures=[];
async function test(name,fn,options={}) {
  const context=await makeContext(browser,options),errors=[];
  context.on('page',page=>{page.setDefaultTimeout(9000);page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());});
  const page=await context.newPage();
  try {
    await page.goto(testURL);await guard(page);
    await fn(page,context);
    for(const opened of context.pages())if(!opened.isClosed())await guard(opened);
    assert.deepEqual(errors,[],'No uncaught application JavaScript errors');
    passed++;console.log('PASS task8:',name);
  } catch(error) {failures.push({name,error:error.stack||error.message});console.error('FAIL task8:',name,error.message);}
  finally {await context.close();}
}
(async()=>{
  try {
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});

    await test('new recipe restores all entered fields and invalid raw values after immediate refresh',async page=>{
      const before=await stored(page);await page.locator('#create').click();
      await page.locator('#item-name').fill('Незавершённый рис');
      await page.locator('#technology').fill('1. Промыть.\n2. Отварить.');
      await page.locator('#recipe-note').evaluate(el=>el.closest('details').open=true);
      await page.locator('#recipe-note').fill('Соль уточнить.');
      await page.locator('#recipe-portions').fill('3,5');await page.locator('#dish-yield').fill('450');
      await page.locator('#add-row').click();
      const rowId=await page.locator('[data-row]').last().getAttribute('data-row');
      await page.locator('#unit-'+rowId).selectOption('ml');
      await page.locator('#search-'+rowId).fill('Незаконченный поиск');
      await page.locator('#unit-'+rowId).selectOption('l');
      assert.equal(await page.locator('#search-'+rowId).inputValue(),'Незаконченный поиск','Changing a unit preserves an unfinished ingredient search');
      await page.locator('#add-row').click();
      assert.equal(await page.locator('#search-'+rowId).inputValue(),'Незаконченный поиск','Adding another row preserves an unfinished ingredient search');
      // Set the last value immediately before refresh: beforeunload must flush the debounce.
      await page.locator('#qty-'+rowId).fill('12,неверно');
      await page.reload();assert.deepEqual(await stored(page),before,'A new draft never creates a main recipe');
      const records=await drafts(page);assert.equal(records.length,1);const id=records[0].id;
      assert.equal(records[0].data.name,'Незавершённый рис');await restore(page,id);
      assert.equal(await page.locator('#technology').inputValue(),'1. Промыть.\n2. Отварить.');
      assert.equal(await page.locator('#recipe-note').inputValue(),'Соль уточнить.');
      assert.equal(await page.locator('#recipe-portions').inputValue(),'3,5');assert.equal(await page.locator('#dish-yield').inputValue(),'450');
      assert.equal(await page.locator('#unit-'+rowId).inputValue(),'l');assert.equal(await page.locator('#search-'+rowId).inputValue(),'Незаконченный поиск');
      assert.equal(await page.locator('#qty-'+rowId).inputValue(),'12,неверно');assert.equal(await page.locator('#qty-'+rowId).getAttribute('aria-invalid'),'true');
      assert.equal(await page.locator('#recipe-note').evaluate(el=>el.closest('details').open),true);
      await page.locator('#save-item').click();assert.deepEqual(await stored(page),before,'Invalid restored input cannot enter the main database');
    },{width:390});

    await test('edited recipe and packaging survive navigation without overwriting the saved card',async page=>{
      const before=await stored(page);await edit(page);
      await page.locator('#item-name').fill('Черновик первой карточки');await page.locator('#pack-qty-foil-row').fill('17,ошибка');
      await page.locator('[data-tab="products"]').click();assert.deepEqual(await stored(page),before);
      await page.locator('[data-tab="dish"]').click();assert.equal(await page.locator('#recipe-card h1').innerText(),before.recipes[0].name);
      await restore(page,'dish-a');assert.equal(await page.locator('#item-name').inputValue(),'Черновик первой карточки');
      assert.equal(await page.locator('#pack-qty-foil-row').inputValue(),'17,ошибка');
      assert.equal(await page.locator('#pack-qty-foil-row').getAttribute('aria-invalid'),'true');
      await page.locator('#pack-qty-foil-row').fill('60');await page.locator('#save-item').click();
      const after=await stored(page);assert.equal(after.recipes[0].name,'Черновик первой карточки');
      assert.deepEqual(after.products,before.products);assert.deepEqual(after.packaging,before.packaging);
      assert.deepEqual(after.recipes[0].ingredients,before.recipes[0].ingredients);assert.deepEqual(after.recipes[0].packaging,before.recipes[0].packaging);
      assert.equal((await drafts(page)).some(record=>record.id==='dish-a'),false);
    });

    await test('different dishes and preparations keep separate drafts; explicit save clears only one',async page=>{
      const before=await stored(page);await edit(page);await page.locator('#item-name').fill('Черновик A');
      await page.locator('[data-open="dish-b"]').click();await page.locator('#edit-recipe').click();await page.locator('#item-name').fill('Черновик B');
      await page.locator('[data-tab="prep"]').click();await page.locator('#actualYield').fill('1777,5');await page.locator('#technology').fill('Неоконченная заготовка');
      await page.locator('[data-tab="products"]').click();
      assert.deepEqual(new Set((await drafts(page)).map(record=>record.id)),new Set(['dish-a','dish-b','prep-a']));assert.deepEqual(await stored(page),before);
      await restore(page,'prep-a');assert.equal(await page.locator('#actualYield').inputValue(),'1777,5');assert.equal(await page.locator('#technology').inputValue(),'Неоконченная заготовка');
      await page.locator('#save-item').click();assert.equal((await stored(page)).recipes.find(record=>record.id==='prep-a').actualYield,1777.5);
      assert.deepEqual(new Set((await drafts(page)).map(record=>record.id)),new Set(['dish-a','dish-b']));
      await restore(page,'dish-a');assert.equal(await page.locator('#item-name').inputValue(),'Черновик A');
      await restore(page,'dish-b');assert.equal(await page.locator('#item-name').inputValue(),'Черновик B');
    },{width:390});

    await test('closing a tab and reopening in the same browser context offers the draft',async (page,context)=>{
      const before=await stored(page);await edit(page);await page.locator('#item-name').fill('До закрытия вкладки');
      const closed=page.waitForEvent('close');await page.close({runBeforeUnload:true});await closed;
      const reopened=await context.newPage();await reopened.goto(testURL);assert.deepEqual(await stored(reopened),before);
      await restore(reopened,'dish-a');assert.equal(await reopened.locator('#item-name').inputValue(),'До закрытия вкладки');
    });

    await test('deleting a draft requires confirmation and preserves the saved recipe',async page=>{
      const before=await stored(page);await edit(page);await page.locator('#item-name').fill('Удаляемый черновик');await draftSaved(page);
      page.removeAllListeners('dialog');page.once('dialog',dialog=>dialog.dismiss());
      await page.locator('[data-delete-draft="dish-a"]').click();assert(await draftById(page,'dish-a'));
      page.once('dialog',dialog=>dialog.accept());await page.locator('[data-delete-draft="dish-a"]').click();
      assert.equal(await draftById(page,'dish-a'),undefined);assert.deepEqual(await stored(page),before);
      assert.equal(await page.locator('#recipe-card h1').innerText(),before.recipes[0].name);
      await page.waitForTimeout(500);assert.equal(await draftById(page,'dish-a'),undefined,'Discarded active draft does not immediately reappear');
    });

    await test('draft quota keeps the previous checkpoint and main data and warns before unsafe navigation',async page=>{
      const before=await stored(page);await edit(page);await page.locator('#item-name').fill('Надёжная точка');await draftSaved(page);
      const checkpoint=await page.evaluate(key=>localStorage.getItem(key),DRAFT_KEY);
      await page.evaluate(()=>window.__task8BlockDrafts=true);await page.locator('#item-name').fill('Не удалось записать');
      await page.waitForFunction(()=>document.querySelector('#draft-status')?.textContent.includes('Черновик не сохранён'));
      assert.equal(await page.evaluate(key=>localStorage.getItem(key),DRAFT_KEY),checkpoint);assert.deepEqual(await stored(page),before);
      page.removeAllListeners('dialog');let warning='';page.once('dialog',dialog=>{warning=dialog.message();dialog.dismiss();});
      await page.locator('[data-tab="products"]').click();assert.match(warning,/черновик|несохран/i);
      assert.equal(await page.locator('.workspace').getAttribute('data-section'),'dish');assert.equal(await page.locator('#item-name').inputValue(),'Не удалось записать');
      await page.evaluate(()=>window.__task8BlockDrafts=false);await page.locator('[data-tab="products"]').click();
      await restore(page,'dish-a');assert.equal(await page.locator('#item-name').inputValue(),'Не удалось записать');
      assert.deepEqual(await stored(page),before);
    });

    await test('a damaged draft envelope is not overwritten and never damages the main database',async page=>{
      const before=await stored(page);await page.evaluate(key=>localStorage.setItem(key,'{fictional-broken-json'),DRAFT_KEY);await page.reload();
      assert.match(await page.locator('#drafts-panel').innerText(),/не удалось|поврежд/i);await edit(page);await page.locator('#item-name').fill('Новый ввод');
      await page.waitForFunction(()=>document.querySelector('#draft-status')?.textContent.includes('Черновик не сохранён'));
      assert.equal(await page.evaluate(key=>localStorage.getItem(key),DRAFT_KEY),'{fictional-broken-json');assert.deepEqual(await stored(page),before);
    });

    await test('a malformed draft cannot break the app or overwrite the saved database',async page=>{
      const before=await stored(page);
      assert.equal(await page.evaluate(()=>KitchenDrafts.save({id:'dish-a',type:'dish',isNew:false,updatedAt:Date.now(),data:{id:'dish-a',type:'dish',name:'Повреждённые строки',ingredients:[null]},errors:[],invalidValues:[],formValues:[],details:[]}).ok),true);
      await page.reload();await page.locator('[data-restore-draft="dish-a"]').click();
      assert.match(await page.locator('#message').innerText(),/не удалось открыть черновик/i);assert.deepEqual(await stored(page),before);
      assert.equal((await draftById(page,'dish-a')).data.name,'Повреждённые строки');
    });

    await test('a pending photo import locks editing and navigation while preserving the pre-import draft',async page=>{
      const before=await stored(page);await edit(page);await page.locator('#item-name').fill('Черновик до импорта');
      await page.evaluate(()=>{
        const original=KitchenPhotos.prepareImport;
        KitchenPhotos.prepareImport=async(...args)=>{await new Promise(resolve=>{window.__task8ReleaseImport=resolve;});return original(...args);};
      });
      const incoming=fixture();incoming.recipes[0].name='Импортированная карточка';await importJSON(page,incoming);
      await page.waitForFunction(()=>typeof window.__task8ReleaseImport==='function');
      assert.equal(await page.locator('.workspace').evaluate(el=>el.inert),true);assert.equal(await page.locator('#drafts-panel').evaluate(el=>el.inert),true);
      assert.equal(await page.locator('#import').isDisabled(),true);assert.equal(await page.locator('#export').isDisabled(),true);
      assert.equal((await draftById(page,'dish-a')).data.name,'Черновик до импорта');
      await page.evaluate(()=>{
        document.querySelector('[data-tab="products"]').click();
        document.querySelector('#save-item').click();document.querySelector('#delete-item').click();
        document.querySelector('[data-delete-draft="dish-a"]').click();document.querySelector('#create').click();
      });
      assert.equal(await page.locator('.workspace').getAttribute('data-section'),'dish');assert.equal(await page.locator('#item-name').inputValue(),'Черновик до импорта');
      assert.deepEqual(await stored(page),before);assert.equal((await draftById(page,'dish-a')).data.name,'Черновик до импорта');
      await page.evaluate(()=>window.__task8ReleaseImport());await page.waitForFunction(()=>KitchenStorage.load().data.recipes[0].name==='Импортированная карточка');
      await page.waitForFunction(()=>!document.querySelector('.workspace').inert);assert.equal(await page.locator('#drafts-panel').evaluate(el=>el.inert),false);
      assert.equal((await draftById(page,'dish-a')).data.name,'Черновик до импорта');await restore(page,'dish-a');
      assert.equal(await page.locator('#item-name').inputValue(),'Черновик до импорта');assert.equal((await stored(page)).recipes[0].name,'Импортированная карточка');
    });

    await test('photo is compressed, persists through draft recovery and explicit save, and does not affect costs',async page=>{
      const before=await stored(page),file=await imageFile(page);await edit(page);await uploadPhoto(page,file);await draftSaved(page);
      assert.equal(firstPhotoId((await stored(page)).recipes[0]),undefined,'Uploading only changes the separate draft');
      const photoId=firstPhotoId((await draftById(page,'dish-a')).data);assert(photoId);
      const info=await page.evaluate(async id=>{const photo=await KitchenPhotos.get(id);return {width:photo.width,height:photo.height,mime:photo.mime,bytes:photo.blob.size};},photoId);
      assert(info.width<=1920 && info.height<=1920 && info.bytes<=500*1024);assert.equal(info.mime,'image/jpeg');
      await page.reload();await restore(page,'dish-a');await page.waitForFunction(()=>document.querySelector('.photo-editor img')?.naturalWidth>0);
      await page.locator('#save-item').click();const saved=await stored(page);assert.equal(firstPhotoId(saved.recipes[0]),photoId);
      assert.equal(await draftById(page,'dish-a'),undefined);assert.deepEqual(saved.products,before.products);assert.deepEqual(saved.packaging,before.packaging);
      assert.deepEqual(saved.recipes[0].ingredients,before.recipes[0].ingredients);assert.deepEqual(saved.recipes[0].packaging,before.recipes[0].packaging);
      await showCard(page);assert(await page.locator('.recipe-photo img').isVisible());
      const calculation=await page.evaluate(()=>{const data=KitchenStorage.load().data;return {food:KitchenCalc.calcRecipe(data,'dish-a').knownCost,pack:KitchenPackaging.calculate(data,data.recipes[0],2).knownCost};});
      assert.deepEqual(calculation,{food:15,pack:26});assert.match(await page.locator('.card-cost').innerText(),/41,00/);
      await page.locator('#view-portions').fill('10');assert.match(await page.locator('.card-cost').innerText(),/205,00/);assert.deepEqual(await stored(page),saved);
      await page.reload();await page.waitForFunction(()=>document.querySelector('.recipe-photo img')?.naturalWidth>0);assert.equal(firstPhotoId((await stored(page)).recipes[0]),photoId);
    },{width:390});

    await test('replacing and removing a photo remain drafts until explicitly saved',async page=>{
      await edit(page);await uploadPhoto(page,await imageFile(page,'#53724b'));await page.locator('#save-item').click();
      const original=firstPhotoId((await stored(page)).recipes[0]);await uploadPhoto(page,await imageFile(page,'#713b30'));await draftSaved(page);
      const replacement=firstPhotoId((await draftById(page,'dish-a')).data);assert.notEqual(replacement,original);assert.equal(firstPhotoId((await stored(page)).recipes[0]),original);
      await page.reload();await restore(page,'dish-a');await page.waitForFunction(()=>document.querySelector('.photo-editor img')?.naturalWidth>0);
      await page.locator('#save-item').click();assert.equal(firstPhotoId((await stored(page)).recipes[0]),replacement);
      await page.locator('#remove-photo').click();await draftSaved(page);assert.equal(firstPhotoId((await stored(page)).recipes[0]),replacement);
      assert.equal(firstPhotoId((await draftById(page,'dish-a')).data),undefined);await page.locator('#save-item').click();assert.equal(firstPhotoId((await stored(page)).recipes[0]),undefined);
      await showCard(page);assert.equal(await page.locator('.recipe-photo').count(),0);await page.reload();assert.equal(await page.locator('.recipe-photo').count(),0);
    });

    await test('bad and oversized photo input leaves the saved image and main recipe intact',async page=>{
      await edit(page);await uploadPhoto(page,await imageFile(page));await page.locator('#save-item').click();const before=await stored(page);
      await page.locator('#photo-file').setInputFiles({name:'broken.jpg',mimeType:'image/jpeg',buffer:Buffer.from('fictional not an image')});
      await page.waitForTimeout(150);assert.deepEqual(await stored(page),before);assert(await page.locator('.photo-editor img').isVisible());
      await page.locator('#photo-file').setInputFiles({name:'oversized.jpg',mimeType:'image/jpeg',buffer:Buffer.alloc(11*1024*1024)});
      await page.waitForTimeout(150);assert.deepEqual(await stored(page),before);assert(await page.locator('.photo-editor img').isVisible());
      await page.locator('#save-item').click();assert.equal(firstPhotoId((await stored(page)).recipes[0]),firstPhotoId(before.recipes[0]));
    });

    await test('photo storage quota preserves the previous photo, saved recipe and recoverable draft',async page=>{
      await edit(page);await uploadPhoto(page,await imageFile(page));await page.locator('#save-item').click();const before=await stored(page);
      await page.locator('#item-name').fill('Изменение без новой фотографии');await draftSaved(page);
      const checkpoint=await draftById(page,'dish-a');
      await page.evaluate(()=>{
        const nativeAdd=IDBObjectStore.prototype.add;
        IDBObjectStore.prototype.add=function(...args){if(this.name==='photos')throw new DOMException('Fictional photo quota','QuotaExceededError');return nativeAdd.apply(this,args);};
      });
      await page.locator('#photo-file').setInputFiles(await imageFile(page,'#78382b'));
      await page.waitForFunction(()=>document.querySelector('.photo-status')?.textContent.includes('Фотография не добавлена'));
      assert.deepEqual(await stored(page),before);assert.deepEqual((await draftById(page,'dish-a')).data,checkpoint.data);
      assert(await page.locator('.photo-editor img').isVisible());
      const retained=await page.evaluate(async id=>{const record=await KitchenPhotos.get(id);return record.blob.size;},firstPhotoId(before.recipes[0]));
      assert(retained>0,'A failed replacement never deletes the original blob');
      await page.reload();await restore(page,'dish-a');assert.equal(await page.locator('#item-name').inputValue(),'Изменение без новой фотографии');
      await page.waitForFunction(()=>document.querySelector('.photo-editor img')?.naturalWidth>0);
    });

    await test('a failed main save keeps the separate photo draft until saving succeeds',async page=>{
      const before=await stored(page);await edit(page);await page.locator('#item-name').fill('Восстановить после ошибки main');await uploadPhoto(page,await imageFile(page));
      const checkpoint=await draftById(page,'dish-a');await page.evaluate(()=>window.__task8BlockMain=true);await page.locator('#save-item').click();
      assert.deepEqual(await stored(page),before);assert.equal(firstPhotoId((await draftById(page,'dish-a')).data),firstPhotoId(checkpoint.data));
      assert.match(await page.locator('#save-state').innerText(),/памяти|JSON/);
      const salvage=await exportJSON(page);assert.equal(salvage.recipes[0].name,'Восстановить после ошибки main');assert(embeddedPhoto(salvage.recipes[0])?.dataUrl);
      await page.reload();assert.deepEqual(await stored(page),before);await restore(page,'dish-a');
      await page.waitForFunction(()=>document.querySelector('.photo-editor img')?.naturalWidth>0);await page.locator('#save-item').click();
      assert.equal((await stored(page)).recipes[0].name,'Восстановить после ошибки main');assert.equal(await draftById(page,'dish-a'),undefined);
    });

    await test('a missing local photo is reported; printing without a photo remains possible',async page=>{
      await edit(page);await uploadPhoto(page,await imageFile(page));await page.locator('#save-item').click();
      const id=firstPhotoId((await stored(page)).recipes[0]);await page.evaluate(id=>KitchenPhotos.remove(id),id);await page.reload();
      await page.waitForFunction(()=>document.querySelector('#view-error')?.textContent.length>0);
      assert.equal(await page.locator('#print-recipe').isDisabled(),true,'Printing with a missing image is blocked explicitly');
      assert.match(await page.locator('.recipe-photo').innerText(),/недоступна|не найдена/i);
      await page.locator('#print-photos').selectOption('none');await page.waitForFunction(()=>document.querySelector('#print-recipe')?.disabled===false);
      await page.emulateMedia({media:'print'});assert.equal(await page.locator('.recipe-photo').isVisible(),false);await page.emulateMedia({media:'screen'});
      const before=await stored(page);await importJSON(page,{...before,recipes:before.recipes.map(recipe=>recipe.id==='dish-a'?{...recipe,photoIds:['missing-photo',null]}:recipe)});
      await page.waitForFunction(()=>document.querySelector('#message')?.textContent.includes('Импорт отменён'));assert.deepEqual(await stored(page),before);
    });

    await test('print photo and price controls work independently; screen photo stays visible',async page=>{
      await edit(page);await uploadPhoto(page,await imageFile(page));await page.locator('#save-item').click();await showCard(page);
      for(const withPhoto of [true,false])for(const withPrices of [true,false]) {
        await page.locator('#card-mode').selectOption(withPrices?'calculation':'chef');await page.locator('#print-photos').selectOption(withPhoto?'both':'none');
        await page.waitForFunction(()=>document.querySelector('#print-recipe')?.disabled===false);
        assert(await page.locator('.recipe-photo img').isVisible(),'The print option never hides the screen preview');
        await page.emulateMedia({media:'print'});assert.equal(await page.locator('.recipe-photo').isVisible(),withPhoto);
        assert.equal(await page.locator('.card-controls').isVisible(),false);assert.equal(await page.locator('#drafts-panel').isVisible(),false);
        assert.equal(await page.locator('.card-cost').count()>0,withPrices);
        if(!withPrices)assert.doesNotMatch(await page.locator('#recipe-card').innerText(),/₽|себестоимост/i);
        if(withPhoto && withPrices)await page.pdf({path:'/tmp/kitchen-task8-manager-photo.pdf',format:'A4'});
        if(!withPhoto && !withPrices)await page.pdf({path:'/tmp/kitchen-task8-chef-no-photo.pdf',format:'A4'});
        await page.emulateMedia({media:'screen'});
      }
    });

    await test('JSON includes portable photos and imports into a fresh browser; old backups remain compatible',async page=>{
      await edit(page);await uploadPhoto(page,await imageFile(page));await page.locator('#save-item').click();const original=await stored(page),backup=await exportJSON(page);
      assert(embeddedPhoto(backup.recipes[0])?.dataUrl.startsWith('data:image/jpeg;base64,'));assert.equal(backup.recipes[0].photoId,undefined);
      const isolated=await makeContext(browser),second=await isolated.newPage();second.setDefaultTimeout(9000);second.on('dialog',dialog=>dialog.accept());
      try {
        await second.goto(testURL);await importJSON(second,backup);
        await second.waitForFunction(()=>KitchenPhotos.ids(KitchenStorage.load().data.recipes[0]).some(Boolean));
        const imported=await stored(second);assert(firstPhotoId(imported.recipes[0]));assert.notEqual(firstPhotoId(imported.recipes[0]),firstPhotoId(original.recipes[0]));
        assert.equal(imported.recipes[0].photo,undefined);await second.waitForFunction(()=>document.querySelector('.recipe-photo img')?.naturalWidth>0);
        assert.deepEqual(await exportJSON(second),backup,'A backup round trip keeps all compressed photo bytes and recipe fields');
        const before=await stored(second),bad=JSON.parse(JSON.stringify(backup));embeddedPhoto(bad.recipes[0]).width=1;
        await importJSON(second,bad);await second.waitForFunction(()=>document.querySelector('#message')?.textContent.includes('Импорт отменён'));
        assert.deepEqual(await stored(second),before,'A bad embedded photo never replaces the main database');
        const old=fixture();delete old.packaging;for(const recipe of old.recipes)delete recipe.packaging;
        await importJSON(second,old);await second.waitForFunction(()=>!KitchenPhotos.ids(KitchenStorage.load().data.recipes[0]).some(Boolean));
        assert.deepEqual(await stored(second),old);await second.reload();assert.deepEqual(await stored(second),old);assert.equal(await second.locator('.recipe-photo').count(),0);
        await guard(second);
      } finally {await isolated.close();}
    });

    await test('export preserves an unfinished draft without silently saving it as a recipe',async page=>{
      const before=await stored(page);await edit(page);await page.locator('#item-name').fill('Экспорт не подтверждает рецепт');
      await uploadPhoto(page,await imageFile(page));const backup=await exportJSON(page);
      assert.deepEqual(backup,before);assert.deepEqual(await stored(page),before);assert(firstPhotoId((await draftById(page,'dish-a')).data));
      assert.equal((await draftById(page,'dish-a')).data.name,'Экспорт не подтверждает рецепт');
    });

    for(const width of [320,390,1366])await test(`photos, drafts and the white working surfaces fit ${width}px`,async page=>{
      const info=await page.evaluate(()=>({background:getComputedStyle(document.body).backgroundImage,editor:getComputedStyle(document.querySelector('.editor')).backgroundColor,input:getComputedStyle(document.querySelector('#view-portions')).backgroundColor}));
      assert.match(info.background,/gastronomic-background\.webp/);assert.equal(info.editor,'rgb(255, 255, 255)');assert.equal(info.input,'rgb(255, 255, 255)');
      await edit(page);await uploadPhoto(page,await imageFile(page));await page.locator('#item-name').fill('Длинное название незавершённого блюда '.repeat(3));await draftSaved(page);await noOverflow(page);
      await page.locator('[data-tab="products"]').click();await noOverflow(page);await restore(page,'dish-a');await noOverflow(page);
      await page.locator('#save-item').click();await showCard(page);await noOverflow(page);
    },{width});
  } catch(error) {failures.push({name:'runner',error:error.stack||error.message});}
  finally {if(browser)await browser.close();}
  for(const failure of failures)console.error(JSON.stringify(failure));
  console.log(`${passed} task8 browser scenarios passed; ${failures.length} failures.`);
  if(failures.length)process.exitCode=1;
})();
