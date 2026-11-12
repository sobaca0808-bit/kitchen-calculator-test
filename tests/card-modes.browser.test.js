/* Two presentations of one recipe: fresh local contexts and fictional data only. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const testURL=process.env.KITCHEN_TEST_URL;
if(!testURL)throw Error('KITCHEN_TEST_URL must point to a disposable loopback server.');
const target=new URL(testURL);
if(!['http:','https:'].includes(target.protocol)||!['127.0.0.1','localhost','[::1]'].includes(target.hostname))throw Error('Card-mode checks run only on loopback, never a published calculator.');
const KEY='kitchen-calculator-pr2-browser-test-v1',DRAFT='kitchen-calculator-pr2-browser-drafts-v1',PRODUCTION='kitchen-calculator-v1';
const SENTINEL='{"fictional":"card-modes-protected-production-placeholder"}';
const output=process.env.KITCHEN_TEST_ARTIFACT_DIR||path.join(os.tmpdir(),'kitchen-card-modes-artifacts');
const pdfRoot=path.join(os.tmpdir(),'kitchen-card-modes-pdfs');
const executablePath=process.env.CHROMIUM_PATH||'/usr/bin/chromium';
const launchOptions={executablePath,headless:true,args:['--no-sandbox']};
const selections={none:[],first:[0],second:[1],both:[0,1]};
let browser,passed=0;const failures=[];
function fixture(){
 const product=(id,name,price,unit='kg',extra={})=>({id,name,aliases:'',price,packQuantity:1,unit,massPerPiece:null,gramsPerMl:null,note:'',...extra});
 const row=(id,refId,quantity,unit='g',extra={})=>({id,refId,quantity,unit,lossPercent:null,outputGrams:null,note:'',...extra});
 return {version:1,products:[
  product('raw-meat','Сырьё для мяса — тест',500),product('ketchup','Кетчуп покупной — тест',200),
  product('name-only','Полуфабрикат в названии — обычный продукт',100),
  product('oil','Масло — тест',300,'l',{gramsPerMl:.9}),product('egg','Яйцо — тест',10,'pcs',{massPerPiece:50}),
  product('potato','Картофель — тест',100)
 ],packaging:[{id:'box',name:'Контейнер — тест',price:500,packQuantity:50,unit:'pcs',note:''}],recipes:[
  {id:'dish',type:'dish',name:'Тестовая сборка — две формы',portions:5,actualYield:1750,technology:'1. Подготовить готовые компоненты.\n2. Собрать блюдо.\nКОНЕЦ_ТЕХНОЛОГИИ',note:'Только вымышленные данные.',ingredients:[
   row('dish-meat','prep-meat',500),row('dish-nested','prep-nested',.25,'kg'),row('dish-ketchup','ketchup',.1,'kg'),
   row('dish-name-only','name-only',.05,'kg'),row('dish-oil','oil',.1,'l'),row('dish-egg','egg',5,'pcs'),
   row('dish-potato','potato',800,'g',{lossPercent:37.5,outputGrams:500})
  ],packaging:[{id:'dish-box',refId:'box',quantity:1,unit:'pcs',freeForGuest:true,costMode:'auto'}]},
  {id:'prep-meat',type:'prep',name:'Мясо готовое — тест',actualYield:600,technology:'Приготовить заготовку.',note:'',ingredients:[row('prep-meat-raw','raw-meat',1000)]},
  {id:'prep-nested',type:'prep',name:'Готовая смесь — тест',actualYield:500,technology:'Смешать готовые компоненты.',note:'',ingredients:[row('prep-nested-meat','prep-meat',300)]}
 ]};
}
const stored=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
const photoIds=page=>page.evaluate(()=>KitchenPhotos.ids(KitchenStorage.load().data.recipes.find(r=>r.id==='dish')));
async function initialize(context,data=fixture()){
 await context.addInitScript(({key,draftKey,production,sentinel,data})=>{
  if(!['http:','https:'].includes(location.protocol))return;
  const nativeGet=Storage.prototype.getItem,nativeSet=Storage.prototype.setItem;
  if(nativeGet.call(localStorage,key)===null)nativeSet.call(localStorage,key,JSON.stringify(data));
  nativeSet.call(localStorage,production,sentinel);
  window.__cardModeOps=[];window.__cardModeRead=k=>nativeGet.call(localStorage,k);
  for(const method of ['getItem','setItem','removeItem','clear']){
   const original=Storage.prototype[method];
   Storage.prototype[method]=function(...args){window.__cardModeOps.push({method,key:args[0]});return original.apply(this,args);};
  }
 },{key:KEY,draftKey:DRAFT,production:PRODUCTION,sentinel:SENTINEL,data});
}
function watch(context,errors){context.on('page',page=>{page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());});}
async function guard(page){
 const proof=await page.evaluate(key=>({sentinel:window.__cardModeRead(key),ops:window.__cardModeOps}),PRODUCTION);
 assert.equal(proof.sentinel,SENTINEL);
 assert(proof.ops.length&&proof.ops.every(op=>op.method!=='clear'&&[KEY,DRAFT].includes(op.key)),'Only the exact test and draft keys are used');
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal page overflow');
}
async function test(name,fn,{data=fixture(),width=1366}={}){
 const context=await browser.newContext({viewport:{width,height:900},acceptDownloads:true,isMobile:width<768,hasTouch:width<768}),errors=[];
 await initialize(context,data);watch(context,errors);const page=await context.newPage();
 try{await page.goto(testURL);await fn(page,context);for(const opened of context.pages())if(!opened.isClosed())await guard(opened);assert.deepEqual(errors,[],'No uncaught application errors');passed++;console.log('PASS card modes:',name);}
 catch(error){failures.push({name,error:error.stack||error.message});console.error('FAIL card modes:',name,error.message);}
 finally{await context.close();}
}
async function ready(page){await page.waitForFunction(()=>document.querySelector('#print-recipe')?.disabled===false);}
async function mode(page,value){await page.locator('#card-mode').selectOption(value);}
async function photos(page,value){await page.locator('#print-photos').selectOption(value);}
const row=(page,id)=>page.locator(`.food-ingredients tbody tr[data-ingredient-id="${id}"]`);
async function image(page,color){
 const url=await page.evaluate(color=>{const c=document.createElement('canvas');c.width=1400;c.height=950;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,c.width,c.height);x.fillStyle='#f4edda';x.beginPath();x.ellipse(700,475,510,330,0,0,Math.PI*2);x.fill();x.fillStyle='#c3a96c';x.beginPath();x.ellipse(700,475,380,240,0,0,Math.PI*2);x.fill();for(let i=0;i<60;i++){x.fillStyle=i%2?'#456b38':'#a63827';x.fillRect(450+(i%10)*48,320+Math.floor(i/10)*54,15,9);}return c.toDataURL('image/jpeg',.9);},color);
 return {name:'fictional-plating.jpg',mimeType:'image/jpeg',buffer:Buffer.from(url.split(',')[1],'base64')};
}
async function addPhotos(page){
 await page.locator('#edit-recipe').click();
 for(const [index,color] of ['#3d5138','#513a32'].entries()){
  await page.locator(index?'#photo-file-2':'#photo-file').setInputFiles(await image(page,color));
  await page.waitForFunction(index=>{const node=document.querySelector(`.photo-editor [data-photo-slot="${index}"] img`);return node?.complete&&node.naturalWidth>0&&!document.querySelector(index?'#photo-file-2':'#photo-file')?.disabled;},index);
 }
 await page.locator('#save-item').click();await page.locator('#view-recipe').click();await ready(page);
}
async function exportJSON(page){const waiting=page.waitForEvent('download');await page.locator('#export').click();const download=await waiting;return JSON.parse(await fs.readFile(await download.path(),'utf8'));}
async function importJSON(page,data){await page.locator('#import-file').setInputFiles({name:'fictional-card-modes.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});}
async function visibleSlots(page){return page.locator('#card-photos [data-photo-slot]').evaluateAll(nodes=>nodes.filter(el=>getComputedStyle(el).display!=='none'&&el.getBoundingClientRect().width>0&&el.getBoundingClientRect().height>0).map(el=>Number(el.dataset.photoSlot)));}
function pdfDetails(file){
 const info=execFileSync('pdfinfo',[file],{encoding:'utf8'}),images=execFileSync('pdfimages',['-list',file],{encoding:'utf8'});
 const text=execFileSync('pdftotext',['-layout',file,'-'],{encoding:'utf8'});
 return {pages:Number(info.match(/^Pages:\s+(\d+)/m)?.[1]),imageCount:images.split('\n').filter(line=>/^\s*\d+\s+\d+\s+image\s/.test(line)).length,text,info};
}
(async()=>{
 try{
  browser=await chromium.launch(launchOptions);await fs.mkdir(output,{recursive:true});await fs.mkdir(pdfRoot,{recursive:true});
  await test('chef shows ready one-portion quantities and tags only linked preparations',async page=>{
   const before=await stored(page);assert.equal(await page.locator('#card-mode').inputValue(),'calculation');await mode(page,'chef');await ready(page);
   assert.equal(await page.locator('.food-ingredients tbody tr').count(),7,'Nested preparations stay one row each');
   for(const [id,quantity] of [['dish-meat','100 г'],['dish-nested','50 г'],['dish-ketchup','20 г'],['dish-name-only','10 г'],['dish-oil','20 мл'],['dish-egg','1 шт.'],['dish-potato','100 г']]){
    assert.equal((await row(page,id).locator('.chef-per-portion').innerText()).replace(/\s+/g,' ').trim(),quantity);
   }
   assert.equal(await row(page,'dish-meat').locator('.prep-label').count(),1);assert.equal(await row(page,'dish-nested').locator('.prep-label').count(),1);
   assert.equal(await row(page,'dish-ketchup').locator('.prep-label').count(),0);assert.equal(await row(page,'dish-name-only').locator('.prep-label').count(),0);
   assert.doesNotMatch(await page.locator('.food-ingredients').innerText(),/Сырьё для мяса|1000|800|37,5|₽|%|Выход|Сумма/);
   assert.equal(await page.locator('.card-cost,.portion-cost,.food-cost').count(),0);
   assert.doesNotMatch(await page.locator('#recipe-card').innerText(),/₽|себестоимост|закупочн|потери|масса ингредиентов/i);
   await page.locator('#view-portions').fill('10');await ready(page);
   assert.match(await row(page,'dish-meat').locator('.chef-total').innerText(),/1000\s*г/);assert.match(await row(page,'dish-meat').locator('.chef-per-portion').innerText(),/^100\s*г$/);
   await page.locator('#view-portions').fill('1');await ready(page);assert.equal(await page.locator('.food-ingredients th').count(),2);assert.equal(await page.locator('.chef-total').count(),0);
   assert.deepEqual(await stored(page),before,'Both chef quantities are derived without changing the saved recipe');
  });
  await test('calculation keeps the original cost, raw amount, output and preparation labels',async page=>{
   const before=await stored(page),proof=await page.evaluate(()=>{const state=KitchenStorage.load().data,recipe=state.recipes.find(r=>r.id==='dish');return {food:KitchenCalc.calcRecipe(state,'dish').knownCost,packing:KitchenPackaging.calculate(state,recipe,5).knownCost};});
   assert(Math.abs(proof.food-726.6666666666667)<1e-8);assert.equal(proof.packing,50);
   assert.match(await page.locator('.card-cost').innerText(),/776,67/);assert.equal(await page.locator('.food-ingredients th').count(),4);
   assert.match(await row(page,'dish-potato').innerText(),/800\s*г/);assert.match(await row(page,'dish-potato').innerText(),/500/);assert.match(await row(page,'dish-meat').innerText(),/416,67/);
   assert.equal(await page.locator('.food-ingredients .prep-label').count(),2);
   await mode(page,'chef');await mode(page,'calculation');await ready(page);assert.match(await page.locator('.card-cost').innerText(),/776,67/);assert.deepEqual(await stored(page),before);
  });
  const unpriced=fixture();for(const product of unpriced.products)product.price=null;
  await test('missing prices never hide a known ready quantity or leak financial issues into chef form',async page=>{
   await mode(page,'chef');await ready(page);assert.match(await row(page,'dish-meat').locator('.chef-per-portion').innerText(),/^100\s*г$/);
   assert.match(await row(page,'dish-potato').locator('.chef-per-portion').innerText(),/^100\s*г$/);assert.doesNotMatch(await page.locator('#recipe-card').innerText(),/₽|нет цены|стоимост|неполный расчёт полуфабриката/i);
   await mode(page,'calculation');await ready(page);assert.match(await page.locator('.card-cost').innerText(),/неполн/i);
  },{data:unpriced});
  await test('invalid portions never expose a stale financial card after switching to chef mode',async page=>{
   const before=await stored(page);assert(await page.locator('.card-cost').isVisible());
   await page.locator('#view-portions').fill('0');await mode(page,'chef');
   assert.equal(await page.locator('#recipe-card').isVisible(),false);assert.equal(await page.locator('.card-cost').isVisible(),false);assert(await page.locator('#print-recipe').isDisabled());
   await photos(page,'none');assert(await page.locator('#print-recipe').isDisabled());
   await page.emulateMedia({media:'print'});assert.equal(await page.locator('#recipe-card').isVisible(),false);await page.emulateMedia({media:'screen'});
   await page.locator('#view-portions').fill('1');await ready(page);assert(await page.locator('#recipe-card').isVisible());assert.equal(await page.locator('.card-cost').count(),0);
   assert.match(await row(page,'dish-meat').locator('.chef-per-portion').innerText(),/^100\s*г$/);assert.deepEqual(await stored(page),before);
  });
  await test('photo choices are independent per form, screen keeps both photos and storage never changes',async page=>{
   await addPhotos(page);const before=await stored(page),storedDrafts=await page.evaluate(key=>localStorage.getItem(key),DRAFT);
   await photos(page,'none');await mode(page,'chef');assert.equal(await page.locator('#print-photos').inputValue(),'both');await photos(page,'first');
   await mode(page,'calculation');assert.equal(await page.locator('#print-photos').inputValue(),'none');await photos(page,'second');
   await mode(page,'chef');assert.equal(await page.locator('#print-photos').inputValue(),'first');await ready(page);
   assert.equal(await page.locator('#card-photos img').count(),2);for(const item of await page.locator('#card-photos img').all())assert(await item.isVisible());
   assert.deepEqual(await stored(page),before);assert.equal(await page.evaluate(key=>localStorage.getItem(key),DRAFT),storedDrafts);
   assert.deepEqual(await page.locator('#card-mode option').evaluateAll(nodes=>nodes.map(el=>el.value).sort()),['calculation','chef'],'No future third form is introduced');
  });
  for(const missing of [0,1])await test(`an unavailable photo in slot ${missing+1} does not block printing the other slot`,async page=>{
   await addPhotos(page);const before=await stored(page),ids=await photoIds(page);await page.evaluate(id=>KitchenPhotos.remove(id),ids[missing]);await page.reload();
   await page.waitForFunction(()=>document.querySelector('#view-error')?.textContent.length>0);
   await photos(page,missing===0?'second':'first');await ready(page);await page.emulateMedia({media:'print'});assert.deepEqual(await visibleSlots(page),[1-missing]);
   assert.doesNotMatch(await page.locator('#recipe-card').innerText(),/Фотография недоступна/);await page.emulateMedia({media:'screen'});
   await photos(page,'none');await ready(page);assert.deepEqual(await stored(page),before);
  });
  await test('eight A4 print combinations contain exactly the requested photographs and correct form data',async page=>{
   await addPhotos(page);const before=await stored(page),details=[];
   for(const form of ['chef','calculation'])for(const [selection,indexes] of Object.entries(selections)){
    await mode(page,form);await photos(page,selection);await ready(page);assert.equal(await page.locator('#card-photos img').count(),2);
    await page.emulateMedia({media:'print'});assert.deepEqual(await visibleSlots(page),indexes);
    assert.equal(await page.locator('.card-controls').isVisible(),false);assert.equal(await page.locator('.library').isVisible(),false);
    assert.equal(await page.locator('#card-photos').isVisible(),indexes.length>0);
    const file=path.join(pdfRoot,form+'-'+selection+'.pdf');await page.pdf({path:file,format:'A4',preferCSSPageSize:true});const pdf=pdfDetails(file);
    assert.match(pdf.info,/595(?:\.\d+)?\s+x\s+841(?:\.\d+)?\s+pts|A4/i);assert.equal(pdf.imageCount,indexes.length);
    assert(pdf.pages>0&&pdf.pages<=2,'The short recipe fits at most two occupied A4 pages');
    assert(pdf.text.split('\f').filter(text=>text.trim()).length===pdf.pages,'Every PDF page contains recipe text');assert.match(pdf.text,/КОНЕЦ_ТЕХНОЛОГИИ/);
    if(form==='chef'){assert.doesNotMatch(pdf.text,/₽|себестоимост|37,5|800\s+г|Закупочн/i);assert.match(pdf.text,/На 1 порцию/);}
    else{assert.match(pdf.text,/776,67/);assert.match(pdf.text,/416,67/);assert.match(pdf.text,/50,00/);}
    details.push({form,selection,pages:pdf.pages,images:pdf.imageCount});
    if(selection==='both')execFileSync('pdftoppm',['-f','1','-singlefile','-scale-to','1600','-png',file,path.join(output,form+'-print')]);
    await page.emulateMedia({media:'screen'});
   }
   await fs.writeFile(path.join(output,'print-proof.json'),JSON.stringify(details,null,2)+'\n');assert.deepEqual(await stored(page),before);
  });
  const long=fixture();long.recipes[0].ingredients=Array.from({length:90},(_,i)=>({id:'long-row-'+i,refId:i%2?'ketchup':'prep-meat',quantity:5,unit:'g',lossPercent:null,outputGrams:null,note:'СТРОКА_'+String(i).padStart(3,'0')}));
  long.recipes[0].technology='ТЕХНОЛОГИЯ_НАЧАЛО\n'+('Аккуратно подготовить компоненты и собрать блюдо. '.repeat(180))+'\nКОНЕЦ_ДЛИННОЙ_ТЕХНОЛОГИИ';
  await test('long ingredient tables repeat headers and preserve final rows and technology in both forms',async page=>{
   for(const form of ['chef','calculation']){
    await mode(page,form);await photos(page,'none');await ready(page);assert.equal(await page.locator('.food-ingredients tbody tr').count(),90);
    await page.emulateMedia({media:'print'});const file=path.join(pdfRoot,form+'-long.pdf');await page.pdf({path:file,format:'A4'});const proof=pdfDetails(file);
    assert(proof.pages>1&&proof.pages<12);assert.match(proof.text,/СТРОКА_089/);assert.match(proof.text,/КОНЕЦ_ДЛИННОЙ_ТЕХНОЛОГИИ/);assert.equal(proof.imageCount,0);
    assert.equal(proof.text.split('\f').filter(text=>text.trim()).length,proof.pages);if(form==='chef')assert.doesNotMatch(proof.text,/₽|себестоимост/i);
    assert.equal(await page.locator('.food-ingredients thead').evaluate(el=>getComputedStyle(el).display),'table-header-group');await page.emulateMedia({media:'screen'});
   }
  },{data:long});
  await test('both forms and their photo choices preserve portable JSON and old recipe compatibility',async page=>{
   await addPhotos(page);const before=await stored(page),backup=await exportJSON(page);await mode(page,'chef');await photos(page,'second');await mode(page,'calculation');await photos(page,'first');
   assert.deepEqual(await exportJSON(page),backup);assert.deepEqual(await stored(page),before);
   const other=await browser.newContext({acceptDownloads:true}),errors=[];await initialize(other);watch(other,errors);const second=await other.newPage();
   try{await second.goto(testURL);await importJSON(second,backup);await second.waitForFunction(()=>KitchenPhotos.ids(KitchenStorage.load().data.recipes.find(r=>r.id==='dish')).filter(Boolean).length===2);await ready(second);
    assert.deepEqual(await exportJSON(second),backup);await mode(second,'chef');assert.match(await row(second,'dish-meat').locator('.chef-per-portion').innerText(),/^100\s*г$/);
    const legacy=fixture();legacy.recipes[0].photo=backup.recipes[0].photos[0];await importJSON(second,legacy);await second.waitForFunction(()=>!!KitchenStorage.load().data.recipes[0].photoId);await ready(second);
    const legacySaved=await stored(second);assert.equal(legacySaved.recipes[0].photoIds,undefined,'A one-photo backup keeps its legacy reference shape');
    for(const [selection,indexes] of Object.entries(selections)){
     await photos(second,selection);await ready(second);await second.emulateMedia({media:'print'});assert.deepEqual(await visibleSlots(second),indexes.includes(0)?[0]:[]);
     assert.equal(await second.locator('#card-photos').isVisible(),indexes.includes(0));await second.emulateMedia({media:'screen'});
    }
    assert.deepEqual(await stored(second),legacySaved);assert.deepEqual(await exportJSON(second),legacy);
    const old=fixture();delete old.recipes[0].portions;delete old.recipes[0].technology;await importJSON(second,old);await second.waitForFunction(()=>!KitchenStorage.load().data.recipes[0].portions);await ready(second);
    assert.deepEqual(await stored(second),old);await mode(second,'chef');await ready(second);assert.match(await row(second,'dish-meat').locator('.chef-per-portion').innerText(),/^500\s*г$/);assert.equal(await second.locator('#card-photos img').count(),0);await guard(second);assert.deepEqual(errors,[]);
   }finally{await other.close();}
  });
  await test('an actual browser restart keeps the single saved recipe and both local photographs',async()=>{
   const profile=await fs.mkdtemp(path.join(os.tmpdir(),'kitchen-card-profile-'));let persistent;
   try{
    persistent=await chromium.launchPersistentContext(profile,{...launchOptions,viewport:{width:1366,height:900},acceptDownloads:true});await initialize(persistent);const errors=[];watch(persistent,errors);
    const first=await persistent.newPage();await first.goto(testURL);await addPhotos(first);await mode(first,'chef');await photos(first,'second');const before=await stored(first),ids=await photoIds(first);await guard(first);await persistent.close();persistent=null;
    persistent=await chromium.launchPersistentContext(profile,{...launchOptions,viewport:{width:1366,height:900},acceptDownloads:true});await initialize(persistent);watch(persistent,errors);const reopened=await persistent.newPage();await reopened.goto(testURL);await ready(reopened);
    assert.deepEqual(await stored(reopened),before);assert.deepEqual(await photoIds(reopened),ids);assert.equal(await reopened.locator('#card-photos img').count(),2);await mode(reopened,'chef');assert.match(await row(reopened,'dish-meat').locator('.chef-per-portion').innerText(),/^100\s*г$/);assert.deepEqual(await stored(reopened),before);await guard(reopened);assert.deepEqual(errors,[]);
   }finally{if(persistent)await persistent.close();await fs.rm(profile,{recursive:true,force:true});}
  });
  for(const width of [320,390,768,1366])await test(`both forms and photo controls fit ${width}px without horizontal scrolling`,async page=>{
   await addPhotos(page);const before=await stored(page);
   for(const form of ['chef','calculation']){
    await mode(page,form);await photos(page,'both');await ready(page);await guard(page);assert.equal(await page.locator('.food-ingredients tbody tr').count(),7);
    if(width===390)await page.locator('#recipe-card').screenshot({path:path.join(output,form+'-mobile.png')});
   }
   assert.deepEqual(await stored(page),before);
  },{width});
 }catch(error){failures.push({name:'runner',error:error.stack||error.message});}
 finally{if(browser)await browser.close();}
 for(const failure of failures)console.error(JSON.stringify(failure));console.log(`${passed} card-mode browser scenarios passed; ${failures.length} failures.`);if(failures.length)process.exitCode=1;
})();
