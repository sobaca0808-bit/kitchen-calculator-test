'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process'),{chromium}=require('playwright');
const {start}=require('./helpers/runtime-server'),fixture=require('./helpers/design-fixture'),{snapshot}=require('./helpers/persistence-lifecycle'),{guard}=require('./helpers/release-storage-guard');
const keys={book:'kitchen-calculator-sintez-preview-v1',drafts:'kitchen-calculator-sintez-drafts-v1',photos:'kitchen-calculator-sintez-photos-v1',backups:'kitchen-calculator-sintez-import-backups-v1',appearance:'kitchen-calculator-sintez-appearance-v1'},seen='kitchen-calculator-sintez-presentation-seen-v1';
const contrastMeasurements=[];
const output=process.env.SINTEZ_CARD_ARTIFACTS||path.join(os.tmpdir(),'sintez-card-proof'),results=[],printComparisons=[];
let browser,server,baselineServer,url,baselineURL;
async function seed(context,{theme='graphite',photos=2,legacy=false,enabled=false,incomplete=false,missingExpenses=false}={}){
  const page=await context.newPage(),target=new URL('__card_fixture__',url).href;
  await page.route(target,r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Synthetic isolated card fixture</title>'}));await page.goto(target);
  const photo=(await fs.readFile(path.join(__dirname,'fixtures/berry-galette.webp'))).toString('base64');
  await page.evaluate(async({keys,seen,data,theme,photos,legacy,enabled,incomplete,missingExpenses,photo})=>{
    localStorage.setItem('kitchen-calculator-v1','protected production sentinel');localStorage.setItem(seen,'1');localStorage.setItem(keys.appearance,theme);
    const recipe=data.recipes.find(r=>r.id==='pie');if(photos)recipe[legacy?'photoId':'photoIds']=legacy?'one':photos==='second'?[null,'two']:photos===1?['one',null]:['one','two'];recipe.includeEstablishmentExpenses=enabled;
    data.futureField={untouched:'yes'};if(!missingExpenses)data.establishmentExpenses={method:'planned-portions',period:'2026-11',plannedPortions:1000,rent:40000,utilities:10000,payroll:24000,other:0};
    if(incomplete)data.products.find(p=>p.id==='apple').price=null;localStorage.setItem(keys.book,JSON.stringify(data));
    const bin=atob(photo),blob=new Blob([Uint8Array.from(bin,c=>c.charCodeAt(0))],{type:'image/webp'}),bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext('2d').drawImage(bitmap,0,0);canvas.getContext('2d').fillStyle='#547b52';canvas.getContext('2d').fillRect(0,0,6,6);const second=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.82));bitmap.close();
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(keys.photos,1);r.onupgradeneeded=()=>r.result.createObjectStore('photos',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    for(const [id,image]of [['one',blob],['two',second]])await new Promise((resolve,reject)=>{const tx=db.transaction('photos','readwrite');tx.objectStore('photos').put({id,blob:image,width:canvas.width,height:canvas.height,mime:image.type});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
  },{keys,seen,data:fixture(),theme,photos,legacy,enabled,incomplete,missingExpenses,photo});await page.close();
}
async function ready(page){await page.waitForFunction(()=>window.KitchenNavigation&&document.querySelector('#print-recipe')?.disabled===false);await page.evaluate(()=>document.fonts.ready);}
async function open(page,target=url){await page.goto(target+'?section=dish');await ready(page);}
async function test(name,fn,{width=1366,...data}={}){
  if(process.env.SINTEZ_CARD_FILTER&&!name.includes(process.env.SINTEZ_CARD_FILTER)){console.log('SKIP CARD (local filter):',name);return;}
  const context=await browser.newContext({viewport:{width,height:900},isMobile:width<768,hasTouch:width<768,acceptDownloads:true}),errors=[],violations=[];let page;
  try{
    await seed(context,data);await guard(context,{...keys,extraLocal:[seen],readOnly:['kitchen-calculator-v1','kitchen-calculator-drafts-v1','kitchen-calculator-preview-v1','kitchen-calculator-pr2-browser-test-v1']},violations);
    context.on('page',p=>{p.setDefaultTimeout(18000);p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});});page=await context.newPage();await open(page);await fn(page,context);
    assert.deepEqual(errors,[]);assert.deepEqual(violations,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));results.push({name,passed:true});console.log('PASS CARD:',name);
  }catch(e){if(page)await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});throw e;}finally{await context.close();}
}
async function save(page){await page.locator('#save-item').click();await page.waitForFunction(()=>document.querySelector('#save-item')?.textContent.includes('Сохранено ✓'));}
async function view(page){await page.locator('#view-recipe').click();await ready(page);}
async function checkMetrics(page){
  const actual=await page.evaluate(()=>{
    const state=KitchenStorage.load().data,model=KitchenRecipeCardModel.create(state,'pie',Number(document.querySelector('#view-portions').value),'calculation'),packaging=KitchenPackaging.calculate(state,model.view.recipe,model.view.recipe.portions),r=KitchenExpenses.calculate(state,'pie',model.view.recipe.portions),fmt=v=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',minimumFractionDigits:2,maximumFractionDigits:2}).format(v),value=k=>document.querySelector('[data-showcase-metric='+k+']>dd')?.textContent;
    return {food:value('food'),expectedFood:fmt(model.view.result.knownCost),packaging:value('packaging'),expectedPackaging:fmt(packaging.knownCost),base:value('base'),expectedBase:fmt(model.view.result.knownCost+packaging.knownCost),expenses:value('expenses'),expectedExpenses:r.expenseTotal==null?null:fmt(r.expenseTotal),full:value('full'),expectedFull:r.totalCost==null?null:fmt(r.totalCost)};
  });
  assert.equal(actual.food,actual.expectedFood);assert.equal(actual.packaging,actual.expectedPackaging);assert.equal(actual.base,actual.expectedBase);if(actual.full){assert.equal(actual.expenses,actual.expectedExpenses);assert.equal(actual.full,actual.expectedFull);}
}
async function screenshot(page,name){await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});await page.locator(await page.locator('#recipe-card').count()?'#recipe-card':'#editor').screenshot({path:path.join(output,name+'-card.png')});}
function raster(file){const prefix=file.replace(/\.pdf$/,'');execFileSync('pdftoppm',['-r','72','-png',file,prefix]);return prefix;}
(async()=>{
  await fs.mkdir(output,{recursive:true});
  if(process.env.SINTEZ_CARD_URL){url=process.env.SINTEZ_CARD_URL;assert(['https://sobaca0808-bit.github.io/kitchen-calculator-test/sintez-card/','https://sobaca0808-bit.github.io/kitchen-calculator-test/sintez-home-work/'].includes(url));baselineURL='https://sobaca0808-bit.github.io/kitchen-calculator-test/sintez-glass/';}
  else{server=await start(process.env.KITCHEN_SINTEZ_RUNTIME_ROOT||path.resolve(__dirname,'..'),{home:true});url=server.url;assert(process.env.SINTEZ_CARD_BASE_ROOT,'An exact PR35 baseline is required for print comparison');baselineServer=await start(process.env.SINTEZ_CARD_BASE_ROOT,{home:true});baselineURL=baselineServer.url;}
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  for(const theme of ['graphite','berry','sage'])for(const width of [1366,390])await test(theme+' photo, green cost and distinct totals at '+width,async page=>{
    const before=await snapshot(page);await checkMetrics(page);await checkContrast(page,theme+'-'+width);
    const a=await page.locator('.showcase-visual').boundingBox(),b=await page.locator('.showcase-summary').boundingBox();if(width>600)assert(a.x+a.width<=b.x&&Math.abs(a.y-b.y)<2,'Photo is on the left');else assert(a.y+a.height<=b.y,'Phone keeps the whole photo before metrics');
    const main=await page.locator('#card-photos [data-photo-slot="0"]').boundingBox(),extra=await page.locator('#card-photos [data-photo-slot="1"]').boundingBox();assert(main.width>extra.width&&extra.width>=70);assert(await page.locator('[data-showcase-edit]').isVisible());
    assert.equal(await page.locator('#card-photos img').first().evaluate(el=>getComputedStyle(el).objectFit),'contain');await screenshot(page,theme+'-'+width);
    await page.locator('#card-photos .photo-open').nth(1).click();await page.locator('#photo-zoom-in').click();assert(Number(await page.locator('.photo-viewer-stage').getAttribute('data-scale'))>1);await page.keyboard.press('Escape');assert.deepEqual(await snapshot(page),before);
  },{theme,width,enabled:true});
  for(const photos of [0,1,'second'])await test('zero/one/second-only photo keeps old data '+photos,async page=>{const before=await snapshot(page);assert.equal(await page.locator('#card-photos .photo-slot:visible').count(),1);if(photos!==0)assert((await page.locator('#card-photos .photo-slot:visible').boundingBox()).width>150);await page.reload();await ready(page);assert.deepEqual(await snapshot(page),before);},{photos,width:390});
  await test('legacy photoId remains intact when simply viewed, scaled or exported',async page=>{const before=await snapshot(page);await page.locator('#view-portions').fill('16');await ready(page);await checkMetrics(page);const portable=await page.evaluate(()=>KitchenPhotos.exportData(KitchenStorage.load().data));assert(portable.recipes.find(r=>r.id==='pie').photo);assert.deepEqual(await snapshot(page),before);},{legacy:true,photos:1});
  await test('expense switch changes the showcase immediately and saves only the existing preference',async page=>{
    const before=await snapshot(page);assert.equal(await page.locator('[data-showcase-metric=full]').count(),0);await page.locator('#include-establishment-expenses').check();await ready(page);await checkMetrics(page);assert(await page.locator('[data-showcase-metric=full]').isVisible());await page.locator('.showcase-expense-details summary').click();assert.match(await page.locator('.showcase-expense-details').innerText(),/Аренда|Коммунальные|Зарплаты/);
    await page.locator('#include-establishment-expenses').uncheck();await ready(page);const after=await snapshot(page),a=structuredClone(after.data),b=structuredClone(before.data);delete a.recipes.find(r=>r.id==='pie').includeEstablishmentExpenses;delete b.recipes.find(r=>r.id==='pie').includeEstablishmentExpenses;assert.deepEqual(a,b);assert.deepEqual(after.photos,before.photos);assert.equal(await page.locator('[data-showcase-metric=full]').count(),0);
  });
  await test('no configured expenses and partial procurement never look like a full calculation',async page=>{assert.match(await page.locator('[data-showcase-metric=expenses]').innerText(),/Не рассчитано/);assert.match(await page.locator('[data-showcase-metric=full]').innerText(),/Не рассчитано/);assert.match(await page.locator('[data-showcase-metric=food]').innerText(),/Известная часть/);assert.doesNotMatch(await page.locator('.showcase-summary').innerText(),/NaN|Infinity/);},{enabled:true,incomplete:true,missingExpenses:true});
  await test('chef card reveals no financial values in the showcase or detailed card',async page=>{const before=await snapshot(page);await page.locator('#card-mode').selectOption('chef');await ready(page);assert.equal(await page.locator('.showcase-metric').count(),1);assert.doesNotMatch(await page.locator('#recipe-card').innerText(),/₽|себестоимост|маржа|зарплат/i);assert.deepEqual(await snapshot(page),before);},{enabled:true});
  await test('primary selection is draft-only, survives reload, and saves without changing photo bytes',async page=>{
    const before=await snapshot(page);await page.locator('[data-showcase-edit]').click();await page.locator('#make-primary-photo').click();await page.waitForFunction(()=>KitchenDrafts.load().items.some(r=>r.data.photoIds?.[0]==='two'));assert.deepEqual((await snapshot(page)).data,before.data);
    await page.reload();await ready(page);await page.locator('[data-restore-draft]').first().click();await page.waitForFunction(()=>!!document.querySelector('#make-primary-photo'));await save(page);await view(page);
    const after=await snapshot(page);assert.deepEqual(after.data.recipes.find(r=>r.id==='pie').photoIds,['two','one']);assert.deepEqual([...after.photos].sort((a,b)=>a.id.localeCompare(b.id)),[...before.photos].sort((a,b)=>a.id.localeCompare(b.id)));assert.equal(after.drafts.length,0);
    const download=page.waitForEvent('download');await page.locator('#export').click();const file=await download,portable=JSON.parse(await fs.readFile(await file.path(),'utf8'));assert.equal(portable.recipes.find(r=>r.id==='pie').photos.length,2);await page.reload();await ready(page);assert.deepEqual(await snapshot(page),after);
    const other=await browser.newContext();try{const p=await other.newPage();await p.goto(url);await p.waitForFunction(()=>!!window.KitchenStorage);const restored=await p.evaluate(async portable=>{const stage=await KitchenPhotos.prepareImport(KitchenStorage.validate(portable));const saved=KitchenStorage.save(stage.data);if(!saved.ok)throw Error(saved.error);return KitchenPhotos.exportData(stage.data);},portable);assert.deepEqual(restored,portable);}finally{await other.close();}
  },{width:390});
  for(const width of [320,768,1024])await test('showcase controls and details fit '+width,async page=>{await page.locator('[data-showcase-edit]').click();await page.locator('#technology').scrollIntoViewIfNeeded();const bar=await page.locator('.form-actions').boundingBox();assert(bar.x>=0&&bar.x+bar.width<=width+1);await screenshot(page,'editor-'+width);},{width});
  await test('primary selection cannot overwrite the old recipe when saving runs out of space',async page=>{const before=await snapshot(page);await page.locator('[data-showcase-edit]').click();await page.locator('#make-primary-photo').click();await page.waitForFunction(()=>KitchenDrafts.load().items.length>0);await page.evaluate(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key===KitchenStorage.KEY)throw new DOMException('Synthetic full storage','QuotaExceededError');return set.call(this,key,value);};});await page.locator('#save-item').click();assert.match(await page.locator('#message').innerText(),/Не удалось сохранить/);assert.deepEqual((await snapshot(page)).data,before.data);assert(await page.locator('#make-primary-photo').isVisible());});
  if(!process.env.SINTEZ_CARD_FILTER||'restart'.includes(process.env.SINTEZ_CARD_FILTER)){
    const profile=await fs.mkdtemp(path.join(os.tmpdir(),'sintez-card-restart-'));let saved;
    try{for(let cycle=0;cycle<2;cycle++){
      const context=await chromium.launchPersistentContext(profile,{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox'],viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true});
      try{if(cycle===0)await seed(context);const p=await context.newPage();await open(p);
        if(cycle===0){await p.locator('[data-showcase-edit]').click();await p.locator('#make-primary-photo').click();await save(p);await view(p);saved=await snapshot(p);}
        else{assert.deepEqual(await snapshot(p),saved,'Recipe, both photo bytes, prices, folders and expenses survive a full browser shutdown without re-seeding');assert.deepEqual(saved.data.recipes.find(r=>r.id==='pie').photoIds,['two','one']);assert.equal(await p.locator('#card-photos img').count(),2);}
      }finally{await context.close();}
    }results.push({name:'true Chrome restart retains chosen primary photo and the complete database',passed:true});console.log('PASS CARD: true Chrome restart retains chosen primary photo and the complete database');}
    finally{await fs.rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:100});}
  }
  for(const theme of ['graphite','berry','sage'])await test(theme+' A4 pixels match PR35 in both forms and four photo options',async(page,context)=>{
    const before=await snapshot(page),base=await context.newPage();await seedBaseline(base);await open(base,baselineURL);
    for(const mode of ['calculation','chef'])for(const photos of ['none','first','second','both']){
      for(const p of [page,base]){await p.emulateMedia({media:'screen'});await p.locator('#card-mode').selectOption(mode);await p.locator('#print-photos').selectOption(photos);await ready(p);await p.emulateMedia({media:'print'});}
      assert(await page.locator('.showcase-summary').isHidden());const stem=theme+'-'+mode+'-'+photos,file=path.join(output,stem+'.pdf'),old=path.join(output,stem+'-baseline.pdf');await base.pdf({path:old,format:'A4',preferCSSPageSize:true});await page.pdf({path:file,format:'A4',preferCSSPageSize:true});
      const a=execFileSync('pdftotext',['-bbox-layout',old,'-']).toString().split('<body>')[1],b=execFileSync('pdftotext',['-bbox-layout',file,'-']).toString().split('<body>')[1];assert.equal(b,a,'Printed words and their A4 coordinates match PR35 exactly: '+stem);
      const ap=raster(old),bp=raster(file),oldPages=(await fs.readdir(output)).filter(f=>f.startsWith(path.basename(ap)+'-')&&f.endsWith('.png')).sort();assert(oldPages.length>0);
      for(const name of oldPages){const current=name.replace(path.basename(ap)+'-',path.basename(bp)+'-');assert.deepEqual(await fs.readFile(path.join(output,current)),await fs.readFile(path.join(output,name)),'A4 rendered pixels match PR35: '+stem);await fs.rm(path.join(output,name));await fs.rm(path.join(output,current));}
      printComparisons.push({theme,mode,photos,exactWordsCoordinatesAndPixels:true});await fs.rm(old);if(!(theme==='graphite'&&['none','both'].includes(photos)))await fs.rm(file);
    }
    await page.emulateMedia({media:'screen'});assert.deepEqual(await snapshot(page),before);
  },{theme,enabled:true});
  await fs.writeFile(path.join(output,'card-proof.json'),JSON.stringify({url,baselineURL,passed:results.length,physicalAndroidTested:false,contrast:contrastMeasurements,printComparisons,scenarios:results},null,2)+'\n');console.log(results.length+' CARD scenarios passed; 0 failures.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();await server?.close();await baselineServer?.close();});
async function seedBaseline(page){
  // Separate loopback origins need the same synthetic snapshot for comparison.
  // On the real Pages host both routes already share this disposable profile.
  if(new URL(baselineURL).origin===new URL(url).origin)return;
  const synthetic=await page.context().pages()[0].evaluate(async()=>({book:localStorage.getItem(KitchenStorage.KEY),appearance:localStorage.getItem(KitchenAppearance.KEY),portable:await KitchenPhotos.exportData(KitchenStorage.load().data)}));
  const target=new URL('__baseline_fixture__',baselineURL).href;await page.route(target,r=>r.fulfill({contentType:'text/html',body:'<!doctype html>'}));await page.goto(target);await page.evaluate(({synthetic,keys,seen})=>{localStorage.setItem(seen,'1');localStorage.setItem(keys.appearance,synthetic.appearance);}, {synthetic,keys,seen});
  await page.goto(baselineURL);await page.waitForFunction(()=>!!window.KitchenPhotos);await page.evaluate(async data=>{const p=await KitchenPhotos.prepareImport(KitchenStorage.validate(data));const r=KitchenStorage.save(p.data);if(!r.ok)throw Error(r.error);},synthetic.portable);
}

async function checkContrast(page,label){
  for(const selector of ['.showcase-metric-food>dd','.showcase-metric>dt','.showcase-metric>p']){
    const pairs=await page.locator(selector).first().evaluate(el=>{
      const rgba=v=>{const a=v.match(/[\d.]+/g)?.map(Number)||[0,0,0,0];return[a[0],a[1],a[2],a[3]??1];},over=(a,b)=>a.slice(0,3).map((c,i)=>c*a[3]+b[i]*(1-a[3])).concat(1),layers=[];
      for(let n=el;n&&n!==document.documentElement;n=n.parentElement){layers.push(rgba(getComputedStyle(n).backgroundColor));if(n.classList.contains('editor'))layers.push(rgba(getComputedStyle(n,'::before').backgroundColor));}
      const wash=rgba(getComputedStyle(document.documentElement).getPropertyValue('--g-wash'));
      return[0,255].map(v=>{let bg=over(wash,[v,v,v,1]);for(const layer of [...layers].reverse())bg=over(layer,bg);return{fg:rgba(getComputedStyle(el).color),bg};});
    });
    const lum=c=>c.slice(0,3).map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((s,n,i)=>s+n*[.2126,.7152,.0722][i],0),ratios=pairs.map(({fg,bg})=>(Math.max(lum(fg),lum(bg))+.05)/(Math.min(lum(fg),lum(bg))+.05)),min=Math.min(...ratios);
    assert(min>=4.5,label+' '+selector+' contrast '+min);if(selector.includes('food'))assert(pairs[0].fg[1]>pairs[0].fg[0]&&pairs[0].fg[1]>pairs[0].fg[2],'The ingredient cost is green in every palette');contrastMeasurements.push({label,selector,minimum:Number(min.toFixed(2)),required:4.5});
  }
}
