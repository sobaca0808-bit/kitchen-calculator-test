/* Issue #16: manual JSON transfers, fictional data and disposable loopback profiles. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {chromium} = require('playwright');

const testURL = process.env.KITCHEN_TEST_URL;
if (!testURL) throw Error('KITCHEN_TEST_URL must identify an isolated loopback server.');
const target = new URL(testURL);
if (!['http:','https:'].includes(target.protocol) || !['localhost','127.0.0.1','[::1]'].includes(target.hostname)) {
  throw Error('Safe JSON merge tests never run against a published calculator.');
}
const KEY='kitchen-calculator-pr2-browser-test-v1', DRAFT='kitchen-calculator-pr2-browser-drafts-v1';
const PRODUCTION='kitchen-calculator-v1', SENTINEL='{"fictional":"issue16-protected-production-placeholder"}';
const PHOTO_DB='kitchen-calculator-test-photos-v1', BACKUP_DB='kitchen-calculator-test-import-backups-v1';
const output=process.env.KITCHEN_TEST_ARTIFACT_DIR || path.join(os.tmpdir(),'kitchen-issue16-artifacts');
const launchOptions={executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']};
const clone=value=>JSON.parse(JSON.stringify(value));
let browser, passed=0;
const failures=[];

function product(id,name,price=500) {
  return {id,name,aliases:'',price,packQuantity:1,unit:'kg',massPerPiece:null,gramsPerMl:null,note:''};
}
function ingredient(id,refId,quantity=200) {
  return {id,refId,quantity,unit:'g',lossPercent:null,outputGrams:null,note:''};
}
function fixture() {
  return {version:1, transferNote:{label:'Вымышленная кухня',revision:1},
    products:[{...product('raw','Тестовый рис'),supplierInfo:{lot:'fictional-A'}}, product('local-only','Только на этом устройстве',100)],
    packaging:[{id:'box',name:'Тестовый контейнер',price:100,packQuantity:10,unit:'pcs',note:''}],
    folders:[{id:'folder-base',name:'Локальные блюда'}],
    recipes:[
      {id:'dish',type:'dish',name:'Блюдо кухни · тест',portions:1,actualYield:250,sellingPrice:300,folderId:'folder-base',technology:'Подготовить и подать.',note:'Вымышленные данные.',
        ingredients:[{...ingredient('dish-row','prep-main'),assembly:{step:1}}],
        packaging:[{id:'dish-box',refId:'box',quantity:1,unit:'pcs',freeForGuest:false,costMode:'additional',serviceNote:{fictional:true}}],plating:{plate:'test'}},
      {id:'prep-main',type:'prep',name:'Тестовая заготовка',actualYield:500,technology:'Подготовить.',note:'',ingredients:[ingredient('prep-main-row','prep-inner',500)]},
      {id:'prep-inner',type:'prep',name:'Тестовый базовый компонент',actualYield:800,technology:'Подготовить.',note:'',ingredients:[ingredient('prep-inner-row','raw',1000)]}
    ]};
}
function additions() {
  return {version:1, sourceInfo:{device:'fictional-phone'},
    products:[{...product('remote-raw','Продукт второго устройства',220),supplierInfo:{lot:'fictional-B'}}],
    packaging:[{id:'remote-box',name:'Упаковка второго устройства',price:50,packQuantity:10,unit:'pcs',note:''}],
    folders:[{id:'remote-folder',name:'Импортированные блюда'}],
    recipes:[
      {id:'remote-prep',type:'prep',name:'Заготовка второго устройства',actualYield:700,note:'',technology:'Приготовить.',ingredients:[ingredient('remote-prep-row','remote-raw',1000)]},
      {id:'remote-dish',type:'dish',name:'Блюдо второго устройства',portions:1,actualYield:250,sellingPrice:350,folderId:'remote-folder',note:'Импортированная тестовая запись.',technology:'Собрать.',
        ingredients:[ingredient('remote-dish-row','remote-prep')],packaging:[{id:'remote-dish-pack',refId:'remote-box',quantity:1,unit:'pcs',freeForGuest:false,costMode:'additional'}],kitchenExtension:{kept:true}}
    ]};
}
const stored=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
const raw=page=>page.evaluate(key=>localStorage.getItem(key),KEY);
const drafts=page=>page.evaluate(key=>localStorage.getItem(key),DRAFT);
function draftContent(source) {
  if(source===null)return null;
  const data=JSON.parse(source);
  data.items=data.items.map(({updatedAt,...record})=>record);
  return data;
}
const portable=page=>page.evaluate(()=>KitchenPhotos.exportData(KitchenStorage.load().data));
const entityCounts=data=>({products:data.products.length,recipes:data.recipes.length,packaging:(data.packaging || []).length,folders:(data.folders || []).length});

async function initialize(context,data=fixture()) {
  await context.addInitScript(({key,draftKey,production,sentinel,data,photoDB,backupDB})=>{
    if (!['http:','https:'].includes(location.protocol)) return;
    const get=Storage.prototype.getItem, set=Storage.prototype.setItem;
    if (get.call(localStorage,key)===null) set.call(localStorage,key,JSON.stringify(data));
    set.call(localStorage,production,sentinel);
    window.__mergeRead=k=>get.call(localStorage,k);
    window.__mergeOps=[];window.__mergeDBs=[];
    for(const method of ['getItem','setItem','removeItem','clear']) {
      const original=Storage.prototype[method];
      Storage.prototype[method]=function(...args) {
        window.__mergeOps.push({method,key:args[0]});
        if(method==='setItem' && args[0]===key && window.__mergeFailMain) throw new DOMException('Fictional main quota','QuotaExceededError');
        return original.apply(this,args);
      };
    }
    const open=IDBFactory.prototype.open;
    IDBFactory.prototype.open=function(name,...args) {window.__mergeDBs.push(name);return open.call(this,name,...args);};
    for(const method of ['add','put']) {
      const original=IDBObjectStore.prototype[method];
      IDBObjectStore.prototype[method]=function(...args) {
        const db=this.transaction.db.name;
        if(db===backupDB && window.__mergeFailBackup) throw new DOMException('Fictional backup quota','QuotaExceededError');
        if(db===photoDB && window.__mergeFailPhoto) throw new DOMException('Fictional photo quota','QuotaExceededError');
        return original.apply(this,args);
      };
    }
  },{key:KEY,draftKey:DRAFT,production:PRODUCTION,sentinel:SENTINEL,data,photoDB:PHOTO_DB,backupDB:BACKUP_DB});
}
function watch(context,errors) {
  context.on('page',page=>{page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());});
}
async function guard(page) {
  const result=await page.evaluate(key=>({sentinel:window.__mergeRead(key),ops:window.__mergeOps,dbs:window.__mergeDBs}),PRODUCTION);
  assert.equal(result.sentinel,SENTINEL);
  assert(result.ops.length && result.ops.every(op=>op.method!=='clear' && [KEY,DRAFT].includes(op.key)),'Only exact test/draft localStorage namespaces are used');
  assert(result.dbs.every(name=>[PHOTO_DB,BACKUP_DB].includes(name)),'Only isolated photo and import-backup databases are opened');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal page overflow');
}
async function test(name,fn,{data=fixture(),width=1366,beforeOpen}={}) {
  if(process.env.KITCHEN_MERGE_TEST_FILTER && !name.includes(process.env.KITCHEN_MERGE_TEST_FILTER)) return;
  const context=await browser.newContext({viewport:{width,height:900},acceptDownloads:true,isMobile:width<768,hasTouch:width<768});
  await initialize(context,data);const errors=[];watch(context,errors);const page=await context.newPage();
  try {if(beforeOpen)await beforeOpen(page,context);await page.goto(testURL);await page.locator('#folder-filter').waitFor();await fn(page,context);for(const p of context.pages())if(!p.isClosed())await guard(p);assert.deepEqual(errors,[]);passed++;console.log('PASS safe merge:',name);}
  catch(error) {failures.push({name,error:error.stack || error.message});console.error('FAIL safe merge:',name,error.message);}
  finally {await context.close();}
}
async function waitPreview(page) {
  await page.waitForFunction(()=>{
    const panel=document.querySelector('#import-panel');
    return panel && !panel.hidden && panel.getAttribute('aria-busy')!=='true' && document.querySelector('#import-summary')?.textContent.trim();
  });
}
async function preview(page,data,{mode='merge',invalid=false}={}) {
  if(await page.locator('#import-panel').isVisible()) await cancel(page);
  await page.locator('#message').evaluate(el=>el.textContent='');
  await page.locator('#import-file').setInputFiles({name:'fictional-safe-transfer.json',mimeType:'application/json',buffer:Buffer.from(typeof data==='string'?data:JSON.stringify(data))});
  if(invalid) {await page.waitForFunction(()=>/Импорт отменён/.test(document.querySelector('#message')?.textContent || ''));return;}
  await waitPreview(page);
  if((await page.locator('#import-mode').inputValue())!==mode) {await page.locator('#import-mode').selectOption(mode);await waitPreview(page);}
}
async function chooseAll(page,preference='both') {
  for(let attempt=0;attempt<100;attempt++) {
    await waitPreview(page);
    const choices=page.locator('select[data-conflict-choice]');
    let pending=false;
    for(let index=0;index<await choices.count();index++) {
      const select=choices.nth(index);
      if(await select.inputValue()) continue;
      const options=await select.locator('option').evaluateAll(nodes=>nodes.map(node=>node.value));
      await select.selectOption(options.includes(preference)?preference:'local');pending=true;break;
    }
    if(!pending) return;
  }
  throw Error('Conflict decisions did not settle');
}
async function apply(page,{allowNoop=false}={}) {
  await waitPreview(page);
  if(allowNoop && await page.locator('#import-apply').isDisabled()) {
    assert.equal(await page.locator('select[data-conflict-choice]').evaluateAll(nodes=>nodes.filter(node=>!node.value).length),0,'A no-op must not hide unresolved conflicts');return false;
  }
  await page.locator('#message').evaluate(el=>el.textContent='');
  await page.locator('#import-apply').click();
  await page.waitForFunction(()=>/Данные импортированы|Объединение выполнено|База заменена|Импорт отменён/.test(document.querySelector('#message')?.textContent || ''));
  return true;
}
async function backupJSON(page) {
  await page.locator('#download-import-backup').waitFor();
  await page.waitForFunction(()=>!document.querySelector('#download-import-backup')?.disabled);
  const waiting=page.waitForEvent('download');await page.locator('#download-import-backup').click();
  const file=await waiting;return JSON.parse(await fs.readFile(await file.path(),'utf8'));
}
async function exportJSON(page) {
  const waiting=page.waitForEvent('download');await page.locator('#export').click();const file=await waiting;return JSON.parse(await fs.readFile(await file.path(),'utf8'));
}
async function addPhotos(page) {
  await page.locator('#edit-recipe').click();
  for(const [index,color] of ['#5b733d','#794b37'].entries()) {
    const image=await imageData(page,color);
    await page.locator(index?'#photo-file-2':'#photo-file').setInputFiles({name:'fictional-plate.jpg',mimeType:image.mime,buffer:Buffer.from(image.dataUrl.split(',')[1],'base64')});
    await page.waitForFunction(index=>document.querySelector(`.photo-editor [data-photo-slot="${index}"] img`)?.naturalWidth>0 && !document.querySelector(index?'#photo-file-2':'#photo-file')?.disabled,index);
  }
  await page.locator('#save-item').click();await page.waitForFunction(()=>document.querySelector('#save-item')?.textContent.includes('Сохранено'));
  await page.locator('#view-recipe').click();
}
async function imageData(page,color='#4c6538') {
  return page.evaluate(color=>{
    const canvas=document.createElement('canvas');canvas.width=480;canvas.height=320;const ctx=canvas.getContext('2d');
    ctx.fillStyle=color;ctx.fillRect(0,0,480,320);ctx.fillStyle='#efe5cf';ctx.beginPath();ctx.ellipse(240,160,170,110,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#4b8b3a';for(let n=0;n<35;n++)ctx.fillRect(130+n%7*30,90+Math.floor(n/7)*30,15,10);
    return {mime:'image/jpeg',width:480,height:320,dataUrl:canvas.toDataURL('image/jpeg',.9)};
  },color);
}
async function photoProof(page,id='dish') {
  return page.evaluate(async id=>{
    const item=KitchenStorage.load().data.recipes.find(recipe=>recipe.id===id),ids=KitchenPhotos.ids(item),photos=[];
    for(const photoId of ids) if(photoId) {const record=await KitchenPhotos.get(photoId),digest=await crypto.subtle.digest('SHA-256',await record.blob.arrayBuffer());photos.push({id:photoId,sha:[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('')});}
    return photos;
  },id);
}
async function photoCount(page) {
  return page.evaluate(name=>new Promise((resolve,reject)=>{
    const request=indexedDB.open(name);request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{const db=request.result,tx=db.transaction('photos','readonly'),count=tx.objectStore('photos').count();tx.oncomplete=()=>{db.close();resolve(count.result);};tx.onerror=()=>{db.close();reject(tx.error);};};
  }),PHOTO_DB);
}
async function assertValid(page) {assert.equal(await page.evaluate(()=>{try {KitchenStorage.validate(KitchenStorage.load().data);return true;}catch {return false;}}),true);}
async function cancel(page) {await page.locator('#import-cancel').click();}

(async()=>{
  try {
    browser=await chromium.launch(launchOptions);await fs.mkdir(output,{recursive:true});
    await test('file preview and cancellation leave saved data byte-identical and preserve all draft fields',async page=>{
      await page.locator('#edit-recipe').click();await page.locator('#item-name').fill('Несохранённая работа · тест');
      await page.waitForFunction(()=>document.querySelector('#draft-status')?.textContent.includes('Черновик сохранён'));
      const before=await raw(page),beforeDraft=await drafts(page);
      await preview(page,additions());assert.equal(await page.locator('#import-mode').inputValue(),'merge');assert(await page.locator('#import-summary').innerText());
      assert.equal(await raw(page),before);assert.deepEqual(draftContent(await drafts(page)),draftContent(beforeDraft));await cancel(page);
      assert.equal(await raw(page),before);assert.deepEqual(draftContent(await drafts(page)),draftContent(beforeDraft));assert.equal(await page.locator('#item-name').inputValue(),'Несохранённая работа · тест');
    });
    await test('default merge adds a complete connected graph and retains every local record and extension',async page=>{
      const before=await stored(page),incoming=additions();await preview(page,incoming);await chooseAll(page);await apply(page);const after=await stored(page);
      for(const key of ['products','recipes','packaging','folders']) for(const item of before[key]) assert.deepEqual(after[key].find(next=>next.id===item.id),item);
      assert.equal(after.recipes.length,before.recipes.length+2);assert.deepEqual(after.sourceInfo,incoming.sourceInfo);
      assert.equal(after.recipes.find(item=>item.id==='remote-dish').folderId,'remote-folder');assert.deepEqual(after.recipes.find(item=>item.id==='remote-dish').kitchenExtension,{kept:true});
      await assertValid(page);assert.deepEqual((await backupJSON(page)).recipes,before.recipes);
    });
    await test('repeating the same merged file skips records without multiplying identities',async page=>{
      const incoming=additions();await preview(page,incoming);await chooseAll(page);await apply(page);const before=await stored(page);
      await preview(page,incoming);await chooseAll(page);await apply(page,{allowNoop:true});assert.deepEqual(await stored(page),before);await assertValid(page);
    });
    await test('a changed price is an explicit conflict and local choice keeps the saved graph',async page=>{
      const before=await stored(page),incoming=clone(before);incoming.products[0].price=800;await preview(page,incoming);
      assert(await page.locator('select[data-conflict-choice]').count());assert.equal(await page.locator('#import-apply').isDisabled(),true);
      await page.locator('#import-panel').screenshot({path:path.join(output,'merge-conflicts-mobile.png')});
      assert.equal(await raw(page),JSON.stringify(fixture()));await chooseAll(page,'local');await apply(page,{allowNoop:true});assert.deepEqual(await stored(page),before);
    },{width:390});
    await test('keep both preserves old recipes and remaps imported dependent preparations and dishes',async page=>{
      const before=await stored(page),incoming=clone(before);incoming.products[0].price=800;
      await preview(page,incoming);await chooseAll(page,'both');await apply(page);const after=await stored(page);
      for(const item of before.recipes) assert.deepEqual(after.recipes.find(next=>next.id===item.id),item);
      assert.equal(after.products.find(item=>item.id==='raw').price,500);assert(after.products.some(item=>item.id!=='raw' && item.price===800));
      const derived=after.recipes.filter(item=>!before.recipes.some(old=>old.id===item.id));assert(derived.some(item=>item.type==='dish'),'Dependent incoming dish is retained separately');
      const newDish=derived.find(item=>item.type==='dish');const newPrep=after.recipes.find(item=>item.id===newDish.ingredients[0].refId);
      assert(newPrep && newPrep.id!=='prep-main');assert.notEqual(newDish.name,before.recipes[0].name);await assertValid(page);
      const costs=await page.evaluate(id=>{const data=KitchenStorage.load().data;return {local:KitchenCalc.calcRecipe(data,'dish').knownCost,incoming:KitchenCalc.calcRecipe(data,id).knownCost};},newDish.id);
      assert.equal(costs.local,125);assert.equal(costs.incoming,200,'The cloned dish uses its incoming changed-price chain');
      const once=await stored(page);await preview(page,incoming);await chooseAll(page,'both');await apply(page,{allowNoop:true});assert.deepEqual(await stored(page),once,'Repeated keep-both transfer is idempotent');
    });
    await test('equal names with different IDs and different composition never imply entity identity',async page=>{
      const before=await stored(page),incoming={version:1,products:[product('another-rice','Тестовый рис',900)],recipes:[]};
      await preview(page,incoming);await chooseAll(page,'both');await apply(page);const after=await stored(page);
      assert.equal(after.products.find(item=>item.id==='raw').price,500);assert(after.products.some(item=>item.id!=='raw' && item.price===900));
      assert.deepEqual(after.recipes,before.recipes);await assertValid(page);
    });
    await test('cross-kind IDs and ingredient-row collisions are remapped without broken folder links',async page=>{
      const incoming=additions();incoming.folders[0].id='raw';incoming.recipes[1].folderId='raw';incoming.recipes[1].ingredients[0].id='dish-row';
      const before=await stored(page);await preview(page,incoming);await chooseAll(page,'both');await apply(page);const after=await stored(page);
      assert.deepEqual(after.products.find(item=>item.id==='raw'),before.products[0]);const dish=after.recipes.find(item=>item.name.startsWith('Блюдо второго устройства'));
      assert.notEqual(dish.folderId,'raw');assert(after.folders.some(item=>item.id===dish.folderId));assert.notEqual(dish.ingredients[0].id,'dish-row');await assertValid(page);
    });
    await test('root extension conflicts require an explicit choice and preserve unrelated extension data',async page=>{
      const incoming=clone(await stored(page));incoming.transferNote={label:'Явно выбранная версия',revision:2};
      await preview(page,incoming);assert(await page.locator('select[data-conflict-choice]').count());await chooseAll(page,'incoming');await apply(page);
      const after=await stored(page);assert.deepEqual(after.transferNote,incoming.transferNote);assert.deepEqual(after.products[0].supplierInfo,{lot:'fictional-A'});
    });
    await test('explicit replacement warns and makes a portable downloadable backup before removing local-only records',async page=>{
      await addPhotos(page);const before=await portable(page),incoming=additions();await preview(page,incoming,{mode:'replace'});
      assert.match(await page.locator('#import-panel').innerText(),/замен|удал|текущ/i);await apply(page);const after=await stored(page);
      assert(!after.products.some(item=>item.id==='local-only'));assert.equal(after.recipes.length,incoming.recipes.length);
      const backup=await backupJSON(page);assert.deepEqual(backup.products,before.products);assert.deepEqual(backup.recipes,before.recipes);assert.deepEqual(backup.folders,before.folders);
      assert.equal(backup.recipes.find(item=>item.id==='dish').photos.filter(Boolean).length,2);
    });
    await test('merge preserves existing photo references and bytes and exports imported photos with prices and folders',async page=>{
      await addPhotos(page);const before=await photoProof(page),incoming=additions();incoming.recipes[1].photos=[await imageData(page,'#6c4f37'),null];
      await preview(page,incoming);await chooseAll(page);await apply(page);assert.deepEqual(await photoProof(page),before);
      const exported=await exportJSON(page);assert.equal(exported.recipes.find(item=>item.id==='remote-dish').photos.filter(Boolean).length,1);
      assert.equal(exported.recipes.find(item=>item.id==='remote-dish').sellingPrice,350);assert.equal(exported.recipes.find(item=>item.id==='remote-dish').folderId,'remote-folder');
      const once=entityCounts(await stored(page));await preview(page,exported);await chooseAll(page);await apply(page,{allowNoop:true});assert.deepEqual(entityCounts(await stored(page)),once);
    });
    await test('backup-storage failure prevents both merge and replacement without touching main data or drafts',async page=>{
      const before=await raw(page),beforeDraft=await drafts(page);await page.evaluate(()=>window.__mergeFailBackup=true);
      for(const mode of ['merge','replace']) {await preview(page,additions(),{mode});await chooseAll(page);await apply(page);assert.match(await page.locator('#message').innerText(),/Импорт отменён/);assert.equal(await raw(page),before);assert.equal(await drafts(page),beforeDraft);if(await page.locator('#import-panel').isVisible())await cancel(page);}
    });
    await test('main-storage quota keeps original data and images and leaves the automatic backup downloadable',async page=>{
      await addPhotos(page);const before=await raw(page),beforePhotos=await photoProof(page),beforePortable=await portable(page),beforeDraft=await drafts(page);
      await preview(page,additions());await chooseAll(page);await page.evaluate(()=>window.__mergeFailMain=true);await apply(page);
      assert.match(await page.locator('#message').innerText(),/Импорт отменён/);assert.equal(await raw(page),before);assert.deepEqual(await photoProof(page),beforePhotos);assert.equal(await drafts(page),beforeDraft);
      assert.deepEqual((await backupJSON(page)).recipes,beforePortable.recipes);
    });
    await test('new-photo staging failure leaves saved recipes, old images and drafts untouched',async page=>{
      await addPhotos(page);const before=await raw(page),beforePhotos=await photoProof(page),beforeDraft=await drafts(page),incoming=additions();incoming.recipes[1].photos=[await imageData(page),null];
      await preview(page,incoming);await chooseAll(page);await page.evaluate(()=>window.__mergeFailPhoto=true);await apply(page);
      assert.match(await page.locator('#message').innerText(),/Импорт отменён/);assert.equal(await raw(page),before);assert.deepEqual(await photoProof(page),beforePhotos);assert.equal(await drafts(page),beforeDraft);
    });
    await test('a database changed after preview is never overwritten by applying an obsolete plan',async page=>{
      await preview(page,additions());await chooseAll(page);const next=await stored(page);next.products[0].price=1234;
      await page.evaluate(({key,data})=>localStorage.setItem(key,JSON.stringify(data)),{key:KEY,data:next});const external=await raw(page);
      await apply(page);assert.match(await page.locator('#message').innerText(),/Импорт отменён/);assert.equal(await raw(page),external);
    });
    await test('a change during asynchronous photo staging rolls back new images and preserves the other-tab database',async page=>{
      await addPhotos(page);const beforePhotos=await photoProof(page),beforeCount=await photoCount(page),incoming=additions();incoming.recipes[1].photos=[await imageData(page,'#703b79'),null];
      await preview(page,incoming);await chooseAll(page);
      await page.evaluate(()=>{
        const original=KitchenPhotos.prepareImport;let paused=false;
        KitchenPhotos.prepareImport=async function(...args) {const result=await original.apply(this,args);if(!paused && result.createdIds.length){paused=true;window.__mergeStagePaused=true;await new Promise(resolve=>window.__mergeReleaseStage=resolve);}return result;};
      });
      await page.locator('#message').evaluate(el=>el.textContent='');await page.locator('#import-apply').click();await page.waitForFunction(()=>window.__mergeStagePaused===true);
      const external=await stored(page);external.products[0].price=777;
      await page.evaluate(({key,data})=>{localStorage.setItem(key,JSON.stringify(data));window.__mergeReleaseStage();},{key:KEY,data:external});
      await page.waitForFunction(()=>/Импорт отменён/.test(document.querySelector('#message')?.textContent || ''));
      assert.deepEqual(await stored(page),external);assert.deepEqual(await photoProof(page),beforePhotos);assert.equal(await photoCount(page),beforeCount,'Only newly staged images were rolled back');
    });
    await test('malformed, unsupported and oversized JSON never replaces the current database',async page=>{
      const before=await raw(page);
      for(const invalid of ['{broken','{"version":2,"products":[],"recipes":[]}',{version:1,products:[],recipes:[{id:'broken',type:'dish',name:'Нет ссылок',ingredients:[ingredient('bad-row','missing')]}]}]) {
        await preview(page,invalid,{invalid:true});assert.equal(await raw(page),before);
      }
      const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'kitchen-issue16-oversize-'));
      try {
        const file=path.join(temporary,'fictional-over-limit.json');await fs.writeFile(file,Buffer.alloc(50*1024*1024+1,32));
        await page.locator('#message').evaluate(el=>el.textContent='');await page.locator('#import-file').setInputFiles(file);
        await page.waitForFunction(()=>/Импорт отменён/.test(document.querySelector('#message')?.textContent || ''));assert.equal(await raw(page),before);
      } finally {await fs.rm(temporary,{recursive:true,force:true});}
    });
    await test('legacy JSON without folders, selling price or photos merges into an empty database',async page=>{
      const old={version:1,products:[product('old-raw','Старый продукт',200)],recipes:[{id:'old-dish',type:'dish',name:'Старая карточка',actualYield:null,note:'',ingredients:[ingredient('old-row','old-raw')]}]};
      await preview(page,old);await chooseAll(page);await apply(page);const after=await stored(page);assert.equal(after.folders,undefined);assert.equal(after.recipes[0].sellingPrice,undefined);assert.equal(after.recipes[0].photoIds,undefined);await assertValid(page);
    },{data:{version:1,products:[],recipes:[]}});
    await test('an empty incoming database deletes nothing in merge mode and empties only through explicit replacement with backup',async page=>{
      const before=await stored(page),empty={version:1,products:[],recipes:[]};await preview(page,empty);await chooseAll(page);await apply(page,{allowNoop:true});assert.deepEqual(await stored(page),before);
      if(await page.locator('#import-panel').isVisible())await cancel(page);
      await preview(page,empty,{mode:'replace'});await apply(page);assert.deepEqual(entityCounts(await stored(page)),{products:0,recipes:0,packaging:0,folders:0});assert.deepEqual((await backupJSON(page)).recipes,before.recipes);
    });
    await test('retained drafts cannot overwrite a replacement entity of another type or silently replace a same-type new record',async page=>{
      await page.locator('#edit-recipe').click();await page.locator('#item-name').fill('Незавершённое блюдо до замены');
      await page.waitForFunction(()=>document.querySelector('#draft-status')?.textContent.includes('Черновик сохранён'));
      const replacement={version:1,products:[],recipes:[{id:'dish',type:'prep',name:'Полуфабрикат с прежним ID блюда',actualYield:300,note:'Новая сохранённая запись.',ingredients:[]}]};
      await preview(page,replacement,{mode:'replace'});await apply(page);
      const saved=await raw(page),savedDrafts=await drafts(page);
      await page.locator('[data-restore-draft="dish"][data-type="dish"]').click();
      assert.match(await page.locator('#message').innerText(),/Черновик не открыт.*другого типа/);
      assert.equal(await raw(page),saved);assert.equal(await drafts(page),savedDrafts);assert.equal((await stored(page)).recipes[0].type,'prep');assert.equal(await page.locator('#item-name').count(),0);

      await page.locator('#create').click();await page.locator('#item-name').fill('Новый черновик до переноса');
      await page.waitForFunction(()=>document.querySelector('#draft-status')?.textContent.includes('Черновик сохранён'));
      const draftRecord=await page.evaluate(()=>KitchenDrafts.load().items.find(item=>item.isNew && item.data.name==='Новый черновик до переноса'));
      assert(draftRecord);
      const sameType={version:1,products:[],recipes:[{id:draftRecord.id,type:'dish',name:'Явно сохранённая версия другого устройства',actualYield:null,note:'',ingredients:[]}]};
      await preview(page,sameType,{mode:'replace'});await apply(page);
      const sameSaved=await raw(page),sameDrafts=await drafts(page);let confirmation='';
      page.removeAllListeners('dialog');page.once('dialog',dialog=>{confirmation=dialog.message();dialog.dismiss();});
      await page.locator(`[data-restore-draft="${draftRecord.id}"][data-type="dish"]`).click();
      assert.match(confirmation,/новый рецепт.*тем же ID|заменит её содержимое/);
      assert.equal(await raw(page),sameSaved);assert.equal(await drafts(page),sameDrafts);assert.equal(await page.locator('#recipe-card h1').innerText(),sameType.recipes[0].name);
    });
    await test('an error after a successful commit reports saved data accurately and retains the automatic backup',async page=>{
      const before=await portable(page);await preview(page,additions());await chooseAll(page);
      await page.locator('#message').evaluate(el=>el.textContent='');await page.locator('#import-apply').click();
      await page.waitForFunction(()=>/Данные уже сохранены/.test(document.querySelector('#message')?.textContent || ''));
      const text=await page.locator('#message').innerText();assert.match(text,/Не удалось обновить экран.*fictional render failure/);assert.doesNotMatch(text,/Исходная база не перезаписана|Импорт отменён/);
      assert.equal((await stored(page)).recipes.length,5);await assertValid(page);assert.deepEqual((await backupJSON(page)).recipes,before.recipes);
      await page.reload();assert.equal((await stored(page)).recipes.length,5);assert(await page.locator('[data-open="remote-dish"]').count());
    },{beforeOpen:async page=>{
      await page.route('**/js/import-ui.js',async route=>{
        const response=await route.fetch(),source=await response.text();
        const injection='\n;(()=>{const original=KitchenImportUI.mount;KitchenImportUI.mount=function(options){return original({...options,onApplied(data){options.onApplied(data);throw Error("fictional render failure");}});};})();';
        await route.fulfill({response,body:source+injection});
      });
    }});
    await test('unknown portable photo metadata is rejected explicitly instead of being silently discarded',async page=>{
      const before=await raw(page),incoming=additions();incoming.recipes[1].photos=[{...await imageData(page),futureCameraMetadata:{orientation:1}},null];
      await preview(page,incoming,{invalid:true});assert.equal(await raw(page),before);
    });
    for(const width of [320,390,1366]) await test(`large connected import preview is usable without horizontal scrolling at ${width}px`,async page=>{
      assert.equal(await page.evaluate(()=>innerWidth),width,'The browser really uses the requested viewport');
      const incoming=additions();for(let index=0;index<200;index++)incoming.recipes.push({id:'bulk-'+index,type:'dish',name:'Тестовый импорт '+String(index).padStart(3,'0'),actualYield:200,portions:1,note:'',technology:'Подать.',folderId:'remote-folder',ingredients:[ingredient('bulk-row-'+index,'remote-prep')]});
      await preview(page,incoming);await chooseAll(page);assert.match(await page.locator('#import-summary').innerText(),/20[0-9]|добав/i);await guard(page);
      for(const id of ['import-mode','import-apply','import-cancel']) {const box=await page.locator('#'+id).boundingBox();assert(box.height>=44,id+' remains a 44px touch target');}
      if([390,1366].includes(width)) await page.locator('#import-panel').screenshot({path:path.join(output,width===390?'merge-preview-mobile.png':'merge-preview-desktop.png')});
      await apply(page);assert.equal((await stored(page)).recipes.length,205);await assertValid(page);
    },{width});
    await test('automatic backup and merged data survive an actual Chromium restart',async()=>{
      const profile=await fs.mkdtemp(path.join(os.tmpdir(),'kitchen-issue16-profile-'));let context;
      try {
        context=await chromium.launchPersistentContext(profile,{...launchOptions,acceptDownloads:true});await initialize(context);const errors=[];watch(context,errors);const page=await context.newPage();
        await page.goto(testURL);const before=await portable(page);await preview(page,additions());await chooseAll(page);await apply(page);const saved=await stored(page);
        const backupIds=await page.evaluate(async()=>{const service=KitchenImportTransaction.create();return (await service.listBackups()).map(item=>item.id);});assert(backupIds.length);
        await context.close();context=null;context=await chromium.launchPersistentContext(profile,{...launchOptions,acceptDownloads:true});await initialize(context);watch(context,errors);const reopened=await context.newPage();await reopened.goto(testURL);
        assert.deepEqual(await stored(reopened),saved);await reopened.waitForFunction(()=>!document.querySelector('#download-import-backup')?.disabled);assert.equal(await reopened.locator('#download-import-backup').isDisabled(),false);
        const backups=await reopened.evaluate(async()=>{const service=KitchenImportTransaction.create();return Promise.all((await service.listBackups()).map(item=>service.getBackup(item.id)));});
        assert(backups.some(item=>JSON.stringify(item).includes(before.recipes[0].name)),'A full pre-transfer backup is still readable after restart');await guard(reopened);assert.deepEqual(errors,[]);
      } finally {if(context)await context.close();await fs.rm(profile,{recursive:true,force:true});}
    });
  } catch(error) {failures.push({name:'runner',error:error.stack || error.message});}
  finally {if(browser)await browser.close();}
  for(const failure of failures) console.error(JSON.stringify(failure));
  console.log(`${passed} safe-JSON-merge browser scenarios passed; ${failures.length} failures.`);
  if(failures.length)process.exitCode=1;
})();
