/* Task #12: selling price and food profitability, fictional disposable data only. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const testURL=process.env.KITCHEN_TEST_URL;
if(!testURL)throw Error('KITCHEN_TEST_URL must identify a disposable loopback server.');
const target=new URL(testURL);
if(!['http:','https:'].includes(target.protocol)||!['localhost','127.0.0.1','[::1]'].includes(target.hostname))throw Error('Profitability checks never run on a published calculator.');
const KEY='kitchen-calculator-pr2-browser-test-v1',DRAFT='kitchen-calculator-pr2-browser-drafts-v1',PRODUCTION='kitchen-calculator-v1';
const SENTINEL='{"fictional":"task-12-protected-production-placeholder"}';
const NOTE='Расчёт основан на продуктовой себестоимости. Зарплата, аренда, коммунальные расходы, налоги и другие затраты не учитываются. Указанная прибыль не является чистой прибылью заведения';
const output=process.env.KITCHEN_TEST_ARTIFACT_DIR||path.join(os.tmpdir(),'kitchen-task12-artifacts');
const launchOptions={executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']};
let browser,passed=0;const failures=[];
function fixture(sellingPrice){
 const data={version:1,products:[{id:'raw',name:'Тестовое сырьё',aliases:'',price:500,packQuantity:1,unit:'kg',massPerPiece:null,gramsPerMl:null,note:''}],packaging:[{id:'box',name:'Тестовый контейнер',price:100,packQuantity:10,unit:'pcs',note:''}],recipes:[
  {id:'dish',type:'dish',name:'Тестовое блюдо — доходность',portions:2,actualYield:200,technology:'Подготовить готовые компоненты.\nПодать.',note:'Вымышленные данные.',ingredients:[{id:'dish-meat',refId:'prep',quantity:200,unit:'g',lossPercent:null,outputGrams:null,note:''}],packaging:[{id:'dish-box',refId:'box',quantity:1,unit:'pcs',freeForGuest:false,costMode:'auto'}]},
  {id:'prep',type:'prep',name:'Тестовое готовое мясо',actualYield:500,technology:'Приготовить заготовку.',note:'',ingredients:[{id:'prep-raw',refId:'raw',quantity:1000,unit:'g',lossPercent:null,outputGrams:null,note:''}]}
 ]};
 if(sellingPrice!==undefined)data.recipes[0].sellingPrice=sellingPrice;
 return data;
}
const stored=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
const currentDraft=page=>page.evaluate(()=>KitchenDrafts.load().items.find(item=>item.id==='dish'));
async function initialize(context,data=fixture()){
 await context.addInitScript(({key,draftKey,production,sentinel,data})=>{
  if(!['http:','https:'].includes(location.protocol))return;
  const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
  if(get.call(localStorage,key)===null)set.call(localStorage,key,JSON.stringify(data));
  set.call(localStorage,production,sentinel);window.__profitOps=[];window.__profitRead=k=>get.call(localStorage,k);
  for(const method of ['getItem','setItem','removeItem','clear']){const original=Storage.prototype[method];Storage.prototype[method]=function(...args){window.__profitOps.push({method,key:args[0]});if(method==='setItem'&&args[0]===key&&window.__profitBlockMain)throw new DOMException('Fictional main quota','QuotaExceededError');return original.apply(this,args);};}
 },{key:KEY,draftKey:DRAFT,production:PRODUCTION,sentinel:SENTINEL,data});
}
function watch(context,errors){context.on('page',page=>{page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());});}
async function guard(page){
 const proof=await page.evaluate(key=>({sentinel:window.__profitRead(key),ops:window.__profitOps}),PRODUCTION);
 assert.equal(proof.sentinel,SENTINEL);assert(proof.ops.length&&proof.ops.every(op=>op.method!=='clear'&&[KEY,DRAFT].includes(op.key)),'Only exact test and draft keys are touched');
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal page overflow');
}
async function test(name,fn,{data=fixture(),width=1366}={}){
 const context=await browser.newContext({viewport:{width,height:900},acceptDownloads:true,isMobile:width<768,hasTouch:width<768}),errors=[];await initialize(context,data);watch(context,errors);const page=await context.newPage();
 try{await page.goto(testURL);await fn(page,context);for(const open of context.pages())if(!open.isClosed())await guard(open);assert.deepEqual(errors,[],'No uncaught JavaScript errors');passed++;console.log('PASS profitability:',name);}
 catch(error){failures.push({name,error:error.stack||error.message});console.error('FAIL profitability:',name,error.message);}
 finally{await context.close();}
}
async function ready(page){await page.waitForFunction(()=>document.querySelector('#print-recipe')?.disabled===false);}
async function edit(page){if(await page.locator('#edit-recipe').count())await page.locator('#edit-recipe').click();}
async function save(page){await page.locator('#save-item').click();await page.waitForFunction(()=>document.querySelector('#save-item')?.textContent.includes('Сохранено'));}
async function card(page){await page.locator('#view-recipe').click();await ready(page);}
async function waitDraft(page){await page.waitForFunction(()=>document.querySelector('#draft-status')?.textContent.includes('Черновик сохранён'));}
const panel=(page,editor=false)=>page.locator(editor?'#profitability-preview .profitability-card':'#recipe-card .profitability-card');
async function numberValue(scope,key){const text=await scope.locator(`[data-profit="${key}"] .profitability-value`).innerText();const normalized=text.replace(/\s/g,'').replace(/−/g,'-').replace(',','.');const match=normalized.match(/-?\d+(?:\.\d+)?/);return match?Number(match[0]):null;}
async function near(scope,key,expected){const actual=await numberValue(scope,key);if(expected===null)assert.equal(actual,null,`${key} must not fabricate a value`);else assert(actual!==null&&Math.abs(actual-expected)<.011,`${key}: expected ${expected}, got ${actual}`);}
async function metrics(scope,{price,food,profit,markup,margin,foodcost}){for(const [key,value]of Object.entries({'selling-price':price,'food-cost':food,'gross-profit':profit,markup,'gross-margin':margin,'food-cost-percent':foodcost}))await near(scope,key,value);assert.match(await scope.innerText(),new RegExp(NOTE.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));assert.doesNotMatch(await scope.innerText(),/NaN|Infinity/);}
async function exportJSON(page){const waiting=page.waitForEvent('download');await page.locator('#export').click();const download=await waiting;return JSON.parse(await fs.readFile(await download.path(),'utf8'));}
async function importJSON(page,data){await page.locator('#message').evaluate(el=>el.textContent='');await page.locator('#import-file').setInputFiles({name:'fictional-profitability.json',mimeType:'application/json',buffer:Buffer.from(typeof data==='string'?data:JSON.stringify(data))});await page.waitForFunction(()=>/Данные импортированы|Импорт отменён/.test(document.querySelector('#message')?.textContent||''));}
async function image(page,color){const data=await page.evaluate(color=>{const c=document.createElement('canvas');c.width=1400;c.height=950;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,1400,950);x.fillStyle='#efe2bd';x.beginPath();x.ellipse(700,475,500,320,0,0,Math.PI*2);x.fill();x.fillStyle='#a43825';for(let i=0;i<45;i++)x.fillRect(450+i%9*56,320+Math.floor(i/9)*60,18,12);return c.toDataURL('image/jpeg',.9);},color);return {name:'fictional-task12.jpg',mimeType:'image/jpeg',buffer:Buffer.from(data.split(',')[1],'base64')};}
async function uploadPhotos(page){for(const [index,color]of ['#445e36','#63352c'].entries()){await page.locator(index?'#photo-file-2':'#photo-file').setInputFiles(await image(page,color));await page.waitForFunction(index=>{const img=document.querySelector(`.photo-editor [data-photo-slot="${index}"] img`);return img?.naturalWidth>0&&!document.querySelector(index?'#photo-file-2':'#photo-file')?.disabled;},index);}}
function pdfDetails(file){const info=execFileSync('pdfinfo',[file],{encoding:'utf8'}),text=execFileSync('pdftotext',['-layout',file,'-'],{encoding:'utf8'}),images=execFileSync('pdfimages',['-list',file],{encoding:'utf8'});return {info,text,images:images.split('\n').filter(line=>/^\s*\d+\s+\d+\s+image\s/.test(line)).length,pages:Number(info.match(/^Pages:\s+(\d+)/m)?.[1])};}
(async()=>{
 try{
  browser=await chromium.launch(launchOptions);await fs.mkdir(output,{recursive:true});
  await test('sale price is a separate saved field; margins use food cost per portion and exclude packaging',async page=>{
   const before=await stored(page);await edit(page);await page.locator('#selling-price').fill('300');
   await metrics(panel(page,true),{price:300,food:100,profit:200,markup:200,margin:66.67,foodcost:33.33});
   await waitDraft(page);assert.equal((await currentDraft(page)).data.sellingPrice,300);assert.deepEqual(await stored(page),before,'Live calculations never overwrite the saved card');
   await save(page);assert.equal((await stored(page)).recipes[0].sellingPrice,300);await card(page);await metrics(panel(page),{price:300,food:100,profit:200,markup:200,margin:66.67,foodcost:33.33});
   assert.match(await page.locator('.card-cost').innerText(),/220,00/,'Existing total still includes packing');
   await page.locator('#view-portions').fill('10');await ready(page);assert.match((await page.locator('.card-cost').innerText()).replace(/\s/g,''),/1100,00/);await metrics(panel(page),{price:300,food:100,profit:200,markup:200,margin:66.67,foodcost:33.33});
   const saved=await stored(page);await page.reload();await ready(page);assert.deepEqual(await stored(page),saved);await edit(page);assert.equal(await page.locator('#selling-price').inputValue(),'300');
  });
  await test('price, ingredient amount and recipe portions update the live profitability without changing food formulas',async page=>{
   await edit(page);await page.locator('#selling-price').fill('300');await page.locator('#qty-dish-meat').fill('400');
   await metrics(panel(page,true),{price:300,food:200,profit:100,markup:50,margin:33.33,foodcost:66.67});
   await page.locator('#qty-dish-meat').fill('-1');await metrics(panel(page,true),{price:300,food:null,profit:null,markup:null,margin:null,foodcost:null});await page.locator('#qty-dish-meat').fill('400');
   await page.locator('#recipe-portions').fill('4');await metrics(panel(page,true),{price:300,food:100,profit:200,markup:200,margin:66.67,foodcost:33.33});
   await page.locator('#dish-yield').fill('800');await metrics(panel(page,true),{price:300,food:100,profit:200,markup:200,margin:66.67,foodcost:33.33});
   await page.locator('#selling-price').fill('350,50');await near(panel(page,true),'gross-profit',250.5);await save(page);await card(page);await near(panel(page),'selling-price',350.5);await near(panel(page),'gross-profit',250.5);
  });
  await test('saved purchase price and preparation yield propagate to the saved dish profitability',async page=>{
   await edit(page);await page.locator('#selling-price').fill('300');await save(page);await page.locator('[data-tab="products"]').click();await page.locator('#price').fill('600');await save(page);
   await page.locator('[data-tab="dish"]').click();await ready(page);await metrics(panel(page),{price:300,food:120,profit:180,markup:150,margin:60,foodcost:40});
   await page.locator('[data-tab="prep"]').click();await page.locator('#actualYield').fill('1000');await save(page);await page.locator('[data-tab="dish"]').click();await ready(page);
   await metrics(panel(page),{price:300,food:60,profit:240,markup:400,margin:80,foodcost:20});
  });
  await test('invalid sale price survives draft recovery and never replaces the last saved recipe',async page=>{
   const before=await stored(page);await edit(page);await page.locator('#selling-price').fill('-1');await waitDraft(page);assert.equal(await page.locator('#selling-price').getAttribute('aria-invalid'),'true');await metrics(panel(page,true),{price:null,food:100,profit:null,markup:null,margin:null,foodcost:null});
   await page.locator('#save-item').click();assert.deepEqual(await stored(page),before);await page.reload();await page.locator('[data-restore-draft="dish"]').click();assert.equal(await page.locator('#selling-price').inputValue(),'-1');assert.equal(await page.locator('#selling-price').getAttribute('aria-invalid'),'true');
   for(const raw of ['abc','1e309','']){await page.locator('#selling-price').fill(raw);await waitDraft(page);if(raw)await page.locator('#save-item').click();if(raw)assert.deepEqual(await stored(page),before);}
   await page.locator('#selling-price').fill('300');await save(page);await card(page);await near(panel(page),'gross-profit',200);
  });
  await test('blank and zero prices and zero food cost never divide by zero or invent profits',async page=>{
   await edit(page);await metrics(panel(page,true),{price:null,food:100,profit:null,markup:null,margin:null,foodcost:null});
   await page.locator('#selling-price').fill('0');await metrics(panel(page,true),{price:0,food:100,profit:-100,markup:-100,margin:null,foodcost:null});
   await save(page);await card(page);await near(panel(page),'selling-price',0);await edit(page);await page.locator('#selling-price').fill('');await save(page);await card(page);await near(panel(page),'selling-price',null);await near(panel(page),'gross-profit',null);
   const free=fixture(300);free.products[0].price=0;await importJSON(page,free);await ready(page);await metrics(panel(page),{price:300,food:0,profit:300,markup:null,margin:100,foodcost:0});
   const bothZero=fixture(0);bothZero.products[0].price=0;await importJSON(page,bothZero);await ready(page);await metrics(panel(page),{price:0,food:0,profit:0,markup:null,margin:null,foodcost:null});
  });
  await test('losses remain valid numbers; incomplete food calculations do not display false profitability',async page=>{
   await edit(page);await page.locator('#selling-price').fill('50');await metrics(panel(page,true),{price:50,food:100,profit:-50,markup:-50,margin:-100,foodcost:200});
   await save(page);const partial=fixture(300);partial.products[0].price=null;await importJSON(page,partial);await ready(page);for(const key of ['gross-profit','markup','gross-margin','food-cost-percent'])await near(panel(page),key,null);
   assert.match(await panel(page).innerText(),/неполн|заверш|уточни/i);
  });
  await test('old JSON stays structurally compatible and malformed sale prices do not replace any data',async page=>{
   const old=await stored(page);assert.equal(Object.hasOwn(old.recipes[0],'sellingPrice'),false);assert.deepEqual(await exportJSON(page),old);await edit(page);await page.locator('#item-name').fill('Старый рецепт с другим названием');await save(page);
   assert.equal(Object.hasOwn((await stored(page)).recipes[0],'sellingPrice'),false,'An untouched empty selling-price field does not migrate old records');
   const before=await stored(page);
   for(const invalid of [-1,'300','',{},true]){const candidate=fixture(invalid);await importJSON(page,candidate);assert.match(await page.locator('#message').innerText(),/Импорт отменён/);assert.deepEqual(await stored(page),before);}
   await importJSON(page,JSON.stringify(fixture(300)).replace('"sellingPrice":300','"sellingPrice":1e309'));assert.deepEqual(await stored(page),before);
   const valid=fixture(350.5);await importJSON(page,valid);await ready(page);assert.equal((await stored(page)).recipes[0].sellingPrice,350.5);assert.deepEqual(await exportJSON(page),valid);
  });
  await test('both photographs and selling price round-trip together through portable JSON in another browser',async page=>{
   await edit(page);await page.locator('#selling-price').fill('300');await uploadPhotos(page);await save(page);await card(page);const backup=await exportJSON(page);assert.equal(backup.recipes[0].sellingPrice,300);assert.equal(backup.recipes[0].photos.filter(Boolean).length,2);
   const context=await browser.newContext({acceptDownloads:true}),errors=[];await initialize(context);watch(context,errors);const other=await context.newPage();
   try{await other.goto(testURL);await importJSON(other,backup);await ready(other);assert.deepEqual(await exportJSON(other),backup);await metrics(panel(other),{price:300,food:100,profit:200,markup:200,margin:66.67,foodcost:33.33});assert.equal(await other.locator('#card-photos img').count(),2);await guard(other);assert.deepEqual(errors,[]);}finally{await context.close();}
  });
  await test('failed main storage keeps the sale-price draft recoverable',async page=>{
   const before=await stored(page);await edit(page);await page.locator('#selling-price').fill('300');await waitDraft(page);await page.evaluate(()=>window.__profitBlockMain=true);await page.locator('#save-item').click();assert.deepEqual(await stored(page),before);assert.equal((await currentDraft(page)).data.sellingPrice,300);
   await page.reload();await page.locator('[data-restore-draft="dish"]').click();assert.equal(await page.locator('#selling-price').inputValue(),'300');await save(page);assert.equal((await stored(page)).recipes[0].sellingPrice,300);assert.equal(await currentDraft(page),undefined);
  });
  await test('an actual Chromium restart retains the sale price and both local photos',async()=>{
   const profile=await fs.mkdtemp(path.join(os.tmpdir(),'kitchen-task12-profile-'));let context;
   try{context=await chromium.launchPersistentContext(profile,{...launchOptions,acceptDownloads:true});await initialize(context);const errors=[];watch(context,errors);const first=await context.newPage();await first.goto(testURL);await edit(first);await first.locator('#selling-price').fill('300');await uploadPhotos(first);await save(first);const before=await stored(first);await context.close();context=null;
    context=await chromium.launchPersistentContext(profile,{...launchOptions,acceptDownloads:true});await initialize(context);watch(context,errors);const reopened=await context.newPage();await reopened.goto(testURL);await ready(reopened);assert.deepEqual(await stored(reopened),before);assert.equal(await reopened.locator('#card-photos img').count(),2);await near(panel(reopened),'gross-profit',200);await guard(reopened);assert.deepEqual(errors,[]);
   }finally{if(context)await context.close();await fs.rm(profile,{recursive:true,force:true});}
  });
  await test('calculation prints profitability and its exact note; chef never contains financial data',async page=>{
   await edit(page);await page.locator('#selling-price').fill('300');await uploadPhotos(page);await save(page);await card(page);const before=await stored(page);const results=[];
   for(const form of ['calculation','chef'])for(const selection of ['none','first','second','both']){
    await page.locator('#card-mode').selectOption(form);await page.locator('#print-photos').selectOption(selection);await ready(page);
    if(form==='chef'){assert.equal(await page.locator('#recipe-card .profitability-card').count(),0);assert.doesNotMatch(await page.locator('#recipe-card').innerText(),/₽|валовая|фудкост|наценка|рентабельность|чистой прибылью/i);}
    else await near(panel(page),'gross-profit',200);
    await page.emulateMedia({media:'print'});const file=path.join(output,form+'-'+selection+'.pdf');await page.pdf({path:file,format:'A4',preferCSSPageSize:true});const proof=pdfDetails(file),images=selection==='both'?2:selection==='none'?0:1;
    assert.equal(proof.images,images);assert.match(proof.info,/A4/);assert.equal(proof.text.split('\f').filter(x=>x.trim()).length,proof.pages);
    if(form==='chef')assert.doesNotMatch(proof.text,/₽|валовая|фудкост|наценка|рентабельность|чистой прибылью/i);else{assert.match(proof.text,/200,00/);assert.match(proof.text,/Валовая|валовая/);assert.match(proof.text,/не является чистой прибылью/);}
    results.push({form,selection,images,pages:proof.pages});if(selection==='both'){execFileSync('pdftoppm',['-f','1','-singlefile','-scale-to','1600','-png',file,path.join(output,form+'-print')]);if(proof.pages>1)execFileSync('pdftoppm',['-f','2','-singlefile','-scale-to','1600','-png',file,path.join(output,form+'-print-page2')]);}await page.emulateMedia({media:'screen'});
   }
   await fs.writeFile(path.join(output,'print-proof.json'),JSON.stringify(results,null,2)+'\n');assert.deepEqual(await stored(page),before);
  });
  for(const width of [320,390,1366])await test(`profitability editor, saved card and chef fit ${width}px without overflow`,async page=>{
   await edit(page);await page.locator('#selling-price').fill('300');await metrics(panel(page,true),{price:300,food:100,profit:200,markup:200,margin:66.67,foodcost:33.33});await guard(page);
   if(width===390){await page.locator('#selling-price').evaluate(el=>el.focus({preventScroll:true}));await page.evaluate(()=>window.scrollTo(0,scrollY+document.querySelector('.selling-price-editor').getBoundingClientRect().top-12));const clip=await page.evaluate(()=>{const a=document.querySelector('.selling-price-editor').getBoundingClientRect(),b=document.querySelector('#profitability-preview').getBoundingClientRect();return {x:Math.max(0,Math.min(a.left,b.left)-4),y:Math.max(0,a.top-4),width:Math.max(a.right,b.right)-Math.min(a.left,b.left)+8,height:b.bottom-a.top+8};});await page.screenshot({path:path.join(output,'editor-mobile.png'),clip});}await save(page);await card(page);await guard(page);if([390,1366].includes(width))await page.locator('#recipe-card').screenshot({path:path.join(output,width===390?'card-mobile.png':'card-desktop.png')});
   await page.locator('#card-mode').selectOption('chef');await ready(page);assert.equal(await page.locator('#recipe-card .profitability-card').count(),0);await guard(page);
  },{width});
 }catch(error){failures.push({name:'runner',error:error.stack||error.message});}
 finally{if(browser)await browser.close();}
 for(const failure of failures)console.error(JSON.stringify(failure));console.log(`${passed} profitability browser scenarios passed; ${failures.length} failures.`);if(failures.length)process.exitCode=1;
})();
