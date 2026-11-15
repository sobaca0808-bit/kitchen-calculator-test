/* UI controls: isolated fictional fixtures, loopback only, no real kitchen data. */
'use strict';
const APPEARANCE_KEY=require('./helpers/theme-context.js').KEY;
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {chromium}=require('playwright');
const testURL=process.env.KITCHEN_TEST_URL;
if(!testURL)throw Error('KITCHEN_TEST_URL must point to an isolated loopback server.');
const target=new URL(testURL);
if(!['http:','https:'].includes(target.protocol)||!['localhost','127.0.0.1','[::1]'].includes(target.hostname))throw Error('Interface checks never run on a published calculator.');
const KEY='kitchen-calculator-pr2-browser-test-v1',DRAFT='kitchen-calculator-pr2-browser-drafts-v1',PRODUCTION='kitchen-calculator-v1';
const SENTINEL='{"fictional":"interface-controls-protected-production-placeholder"}';
const output=process.env.KITCHEN_TEST_ARTIFACT_DIR||path.join(os.tmpdir(),'kitchen-interface-controls-artifacts');
const launchOptions={executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']};
let browser,passed=0;const failures=[];
function product(id,name,price){return {id,name,aliases:'',price,packQuantity:1,unit:'kg',massPerPiece:null,gramsPerMl:null,note:'Только вымышленные данные.'};}
function row(id,refId,quantity=20){return {id,refId,quantity,unit:'g',lossPercent:null,outputGrams:null,note:'Учебный ингредиент.'};}
function fixture(){return {version:1,products:[product('raw','Учебный картофель',100)],packaging:[{id:'box',name:'Учебный контейнер',price:5,packQuantity:1,unit:'pcs',note:'Только учебная упаковка.'}],recipes:[
  {id:'dish',type:'dish',name:'Картофель жареный · тест',portions:1,actualYield:940,sellingPrice:300,technology:'Подготовить, собрать и подать.',note:'Только вымышленные данные.',ingredients:[...Array.from({length:42},(_,i)=>row('dish-row-'+i,'raw')),row('dish-ready','prep',100)],packaging:[{id:'dish-box',refId:'box',quantity:1,unit:'pcs',freeForGuest:false,costMode:'auto'}]},
  {id:'prep',type:'prep',name:'Учебная заготовка',actualYield:4200,note:'Только вымышленные данные.',technology:'Подготовить всю партию.',ingredients:Array.from({length:42},(_,i)=>row('prep-row-'+i,'raw',100))}
]};}
function incoming(id='pickles',name='Солёные огурцы · тест'){return {version:1,products:[product('raw','Учебный картофель',100)],recipes:[{id,type:'dish',name,portions:1,actualYield:100,sellingPrice:150,note:'Вымышленное блюдо для проверки объединения.',technology:'Подготовить и подать.',ingredients:[row(id+'-row','raw',100)]}]};}
const stored=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
const rawStored=page=>page.evaluate(key=>localStorage.getItem(key),KEY);
async function initialize(context,data){
  await context.addInitScript(({key,production,sentinel,data})=>{
    if(!['http:','https:'].includes(location.protocol))return;
    const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
    if(get.call(localStorage,key)===null)set.call(localStorage,key,JSON.stringify(data));
    set.call(localStorage,production,sentinel);window.__controlRead=id=>get.call(localStorage,id);window.__controlOps=[];window.__controlIDBWrites=[];
    for(const method of ['getItem','setItem','removeItem','clear']){const original=Storage.prototype[method];Storage.prototype[method]=function(...args){window.__controlOps.push({method,key:args[0]});return original.apply(this,args);};}
    for(const method of ['add','put','delete','clear']){const original=IDBObjectStore.prototype[method];IDBObjectStore.prototype[method]=function(...args){window.__controlIDBWrites.push({method,db:this.transaction.db.name,store:this.name});return original.apply(this,args);};}
  },{key:KEY,production:PRODUCTION,sentinel:SENTINEL,data});
}
async function guard(page){
  const proof=await page.evaluate(production=>({sentinel:window.__controlRead(production),ops:window.__controlOps,writes:window.__controlIDBWrites}),PRODUCTION);
  assert.equal(proof.sentinel,SENTINEL);assert(proof.ops.length>0&&proof.ops.every(op=>op.method!=='clear'&&[KEY,DRAFT,APPEARANCE_KEY].includes(op.key)),'Only isolated main/draft localStorage is used');
  assert(proof.writes.every(op=>['kitchen-calculator-test-photos-v1','kitchen-calculator-test-import-backups-v1'].includes(op.db)),'Only isolated image/backup databases are written');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal page overflow');
}
async function test(name,fn,{width=1366,height=900,data=fixture()}={}){
  if(process.env.KITCHEN_INTERFACE_TEST_FILTER&&!name.includes(process.env.KITCHEN_INTERFACE_TEST_FILTER))return;
  const context=await browser.newContext({viewport:{width,height},hasTouch:width<=768,isMobile:width<768,acceptDownloads:true});
  await initialize(context,data);await context.route('**/favicon.ico',route=>route.fulfill({status:204,body:''}));
  const errors=[];context.on('page',page=>{page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});page.on('dialog',dialog=>dialog.accept());});
  const page=await context.newPage();
  try{await page.goto(testURL);assert.equal(await page.evaluate(()=>innerWidth),width);await fn(page,context);await guard(page);assert.deepEqual(errors,[],'No console or application errors');passed++;console.log('PASS interface controls:',name);}
  catch(error){failures.push({name,error:error.stack||error.message});console.error('FAIL interface controls:',name,error.message);}
  finally{await context.close();}
}
async function editor(page,section){
  await page.locator(`[data-tab="${section}"]`).click();
  if(section==='dish')await page.locator('#edit-recipe').click();
  if(section==='products'){
    if(!(await page.locator('#product-note').isVisible()))await page.locator('details').filter({has:page.locator('#product-note')}).locator('summary').click();
    await page.locator('#product-note').evaluate(el=>{el.style.height='900px';});
  }
  if(section==='packaging')await page.locator('#packaging-note').evaluate(el=>{el.style.height='900px';});
  await page.evaluate(()=>{const r=document.querySelector('#editor').getBoundingClientRect();scrollTo(0,scrollY+r.top-12);});
  await barAvailable(page);
}
async function barAvailable(page){
  await page.waitForFunction(()=>{
    const el=document.querySelector('#editor .form-actions');if(!el)return false;
    const r=el.getBoundingClientRect(),s=getComputedStyle(el),v=visualViewport;
    return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.y>=(v?.offsetTop||0)-1&&r.bottom<=(v?.offsetTop||0)+(v?.height||innerHeight)+1;
  });
  const rect=await page.locator('.form-actions').boundingBox();assert(rect.height>=44);
  for(const button of await page.locator('.form-actions button').all())assert((await button.boundingBox()).height>=44,'Actions retain touch target height');
}
async function focusClear(page,selector){
  const field=page.locator(selector);await field.focus();await field.scrollIntoViewIfNeeded();
  await page.waitForFunction(selector=>{
    const field=document.querySelector(selector),bar=document.querySelector('.form-actions');if(!field||!bar)return false;
    const a=field.getBoundingClientRect(),b=bar.getBoundingClientRect(),view=visualViewport;
    const top=view?.offsetTop||0,bottom=top+(view?.height||innerHeight);
    return a.y>=top-1&&a.bottom<=bottom+1&&(a.bottom<=b.top+1||a.top>=b.bottom-1||getComputedStyle(bar).position==='static');
  },selector);
}
async function readyPreview(page){await page.waitForFunction(()=>{const p=document.querySelector('#import-panel');return p&&!p.hidden&&p.getAttribute('aria-busy')==='false';});}
async function merge(page,data){
  await page.locator('#message').evaluate(el=>el.textContent='');
  await page.locator('#import-file').setInputFiles({name:'fictional-controls-merge.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
  await readyPreview(page);assert.equal(await page.locator('#import-mode').inputValue(),'merge');assert.equal(await page.locator('select[data-conflict-choice]').count(),0);
  await page.locator('#import-apply').click();await page.waitForFunction(()=>/Объединение выполнено/.test(document.querySelector('#message')?.textContent||''));
  await page.waitForFunction(()=>!document.querySelector('#import-backups').hidden&&!document.querySelector('#download-import-backup').disabled);
}
async function backups(page){return page.evaluate(async()=>{const service=KitchenImportTransaction.create(),list=await service.listBackups();return Promise.all(list.map(item=>service.getBackup(item.id)));});}
async function assertFolded(page){assert.equal(await page.locator('#toggle-import-backups').getAttribute('aria-expanded'),'false');assert.equal(await page.locator('#import-backups-content').isVisible(),false);assert.equal(await page.locator('#toggle-import-backups').getAttribute('aria-controls'),'import-backups-content');}
async function downloadBackup(page){
  if(await page.locator('#toggle-import-backups').getAttribute('aria-expanded')!=='true')await page.locator('#toggle-import-backups').click();
  const pending=page.waitForEvent('download');await page.locator('#download-import-backup').click();const download=await pending;return JSON.parse(await fs.readFile(await download.path(),'utf8'));
}
async function addPhoto(page){
  await page.locator('#edit-recipe').click();
  await page.locator('#photo-editor').scrollIntoViewIfNeeded();await barAvailable(page);
  const photo=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=160;canvas.height=120;const ctx=canvas.getContext('2d');ctx.fillStyle='#537c42';ctx.fillRect(0,0,160,120);ctx.fillStyle='#e5d8a8';ctx.fillRect(25,20,110,80);return canvas.toDataURL('image/png');});
  await page.locator('#photo-file').setInputFiles({name:'fictional-plate.png',mimeType:'image/png',buffer:Buffer.from(photo.split(',')[1],'base64')});
  await page.waitForFunction(()=>document.querySelector('.photo-editor [data-photo-slot="0"] img')?.naturalWidth>0&&!document.querySelector('#photo-file')?.disabled);
  await page.locator('#save-item').click();await page.waitForFunction(()=>document.querySelector('#save-item')?.textContent.includes('Сохранено'));await page.locator('#view-recipe').click();
}
(async()=>{
  try{
    browser=await chromium.launch(launchOptions);await fs.mkdir(output,{recursive:true});
    for(const width of [1366,1024,768,390,320])await test(`long editors keep their own actions available without page overflow at ${width}px`,async page=>{
      for(const section of ['products','packaging','prep','dish']){
        await editor(page,section);
        assert.equal(await page.locator('.form-actions #save-item').count(),1);assert.equal(await page.locator('.form-actions #add-row').count(),['prep','dish'].includes(section)?1:0);
        assert.equal(await page.locator('.form-actions #view-recipe').count(),section==='dish'?1:0);
        await page.evaluate(()=>{const editor=document.querySelector('#editor'),r=editor.getBoundingClientRect();scrollTo(0,scrollY+r.top+editor.clientHeight/2-innerHeight/2);});await barAvailable(page);
        const field=section==='products'?'#gramsPerMl':section==='packaging'?'#packQuantity':section==='dish'?'#qty-dish-row-20':'#qty-prep-row-20';
        await focusClear(page,field);await barAvailable(page);
        await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));await barAvailable(page);
        const last=section==='products'?'#product-note':section==='packaging'?'#packaging-note':section==='dish'?'#selling-price':'#technology';
        if(['products','packaging'].includes(section))await page.locator(last).evaluate(el=>{el.style.height='100px';});
        await focusClear(page,last);await barAvailable(page);
        const prior=await stored(page),id=section==='products'?'raw':section==='packaging'?'box':section;
        const name=(section==='products'?prior.products:section==='packaging'?prior.packaging:prior.recipes).find(item=>item.id===id).name+' · '+width;
        await page.locator('#item-name').fill(name);await barAvailable(page);await page.locator('#save-item').click();
        await page.waitForFunction(()=>document.querySelector('#save-item')?.textContent.includes('Сохранено'));
        const saved=await stored(page),group=section==='products'?'products':section==='packaging'?'packaging':'recipes';
        assert.equal(saved[group].find(item=>item.id===id).name,name);assert.equal(saved[group].length,prior[group].length,'Save updates only the opened record');
        for(const record of prior[group].filter(item=>item.id!==id))assert.deepEqual(saved[group].find(item=>item.id===record.id),record);
        if(section==='dish'&&[390,1366].includes(width)){
          await focusClear(page,'#qty-dish-row-20');await page.screenshot({path:path.join(output,width===390?'editor-actions-mobile.png':'editor-actions-desktop.png')});
        }
        await guard(page);
      }
    },{width,height:900});
    await test('ingredient actions follow the current prep and dish instead of a stale editor',async page=>{
      for(const section of ['prep','dish']){
        await editor(page,section);const before=await stored(page);await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight/2));await barAvailable(page);
        const old=await page.locator('.ingredient-row').count();await page.locator('#add-row').click();assert.equal(await page.locator('.ingredient-row').count(),old+1);
        await page.locator('#save-item').click();const after=await stored(page);assert.equal(after.recipes.find(item=>item.id===section).ingredients.length,old+1);
        assert.deepEqual(after.recipes.find(item=>item.id!==section),before.recipes.find(item=>item.id!==section));
      }
    });
    await test('actions adapt to viewport changes and focused fields remain reachable',async page=>{
      await editor(page,'dish');
      for(const viewport of [{width:1024,height:760},{width:390,height:844},{width:390,height:460},{width:768,height:640},{width:1366,height:900}]){
        await page.setViewportSize(viewport);await focusClear(page,'#qty-dish-row-35');await guard(page);
        await page.locator('#qty-dish-row-35').evaluate(el=>el.blur());await barAvailable(page);
      }
      await focusClear(page,'#selling-price');await page.locator('#view-recipe').click();assert.equal(await page.locator('.form-actions').count(),0,'Read mode has no editor action bar');
      await page.emulateMedia({media:'print'});assert.equal(await page.locator('.card-controls').isVisible(),false);
    });
    await test('import preview disables the editor bar and cancellation restores the same draft',async page=>{
      await editor(page,'dish');await page.locator('#item-name').fill('Несохранённый картофель · тест');await barAvailable(page);const main=await rawStored(page);
      await page.locator('#import-file').setInputFiles({name:'fictional-preview.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(incoming()))});await readyPreview(page);
      assert.equal(await page.locator('.workspace').evaluate(el=>el.inert),true);
      assert(await page.locator('.form-actions').evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return s.visibility==='hidden'||s.display==='none'||r.bottom<=0||r.top>=innerHeight;}),'Disabled editor actions do not overlay the preview');
      assert.equal(await rawStored(page),main);await page.locator('#import-cancel').click();
      assert.equal(await page.locator('#item-name').inputValue(),'Несохранённый картофель · тест');await page.evaluate(()=>document.querySelector('#editor').scrollIntoView({block:'start'}));await barAvailable(page);
    });
    await test('backup disclosure folds after merge and retains data and photos through toggles and reload',async page=>{
      assert.equal(await page.locator('#import-backups').isVisible(),false);await addPhoto(page);const before=await stored(page),portable=await page.evaluate(()=>KitchenPhotos.exportData(KitchenStorage.load().data));
      const ids=before.recipes.find(recipe=>recipe.id==='dish').photoIds;
      await merge(page,incoming());await assertFolded(page);
      let data=await stored(page);assert(data.recipes.some(recipe=>recipe.name==='Картофель жареный · тест'));assert(data.recipes.some(recipe=>recipe.name==='Солёные огурцы · тест'));assert.deepEqual(data.recipes.find(recipe=>recipe.id==='dish').photoIds,ids);
      const first=await backups(page);assert.equal(first.length,1);assert.deepEqual(first[0].data,portable);
      const main=await rawStored(page),writes=await page.evaluate(()=>window.__controlIDBWrites.length);
      for(let i=0;i<3;i++){await page.locator('#toggle-import-backups').click();assert.equal(await page.locator('#toggle-import-backups').getAttribute('aria-expanded'),'true');assert.equal(await page.locator('#import-backups-content').isVisible(),true);await page.locator('#toggle-import-backups').click();await assertFolded(page);}
      assert.deepEqual(await backups(page),first);assert.equal(await rawStored(page),main);assert.equal(await page.evaluate(()=>window.__controlIDBWrites.length),writes,'Folding only changes the DOM');
      assert.deepEqual(await downloadBackup(page),portable);assert.equal(await page.locator('#toggle-import-backups').getAttribute('aria-expanded'),'true');
      await merge(page,incoming('second-dish','Ещё одно учебное блюдо'));await assertFolded(page);const second=await backups(page);assert.equal(second.length,2);assert(second.some(record=>record.id===first[0].id));
      const after=await rawStored(page);await page.reload();await page.waitForFunction(()=>!document.querySelector('#import-backups').hidden&&!document.querySelector('#download-import-backup').disabled);await assertFolded(page);
      assert.equal(await rawStored(page),after);assert.deepEqual(await backups(page),second);
      await page.locator('#toggle-import-backups').click();await page.locator('#import-backup-select').selectOption(first[0].id);assert.deepEqual(await downloadBackup(page),portable);
      await page.locator('#toggle-import-backups').click();await assertFolded(page);await page.locator('#import-backups').screenshot({path:path.join(output,'backups-collapsed-mobile.png')});
      assert((await page.locator('#toggle-import-backups').boundingBox()).height>=44);await guard(page);
    },{width:390,height:844});
  }catch(error){failures.push({name:'runner',error:error.stack||error.message});}
  finally{if(browser)await browser.close();}
  for(const failure of failures)console.error(JSON.stringify(failure));console.log(`${passed} interface-control browser scenarios passed; ${failures.length} failures.`);if(failures.length)process.exitCode=1;
})();
