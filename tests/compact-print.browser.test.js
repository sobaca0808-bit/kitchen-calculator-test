/* Task #13: print-only compact A4 cards. Fictional fixtures, disposable loopback contexts. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const fsSync=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const Seed=require('../js/seed.js');
const testURL=process.env.KITCHEN_TEST_URL;
if(!testURL)throw Error('KITCHEN_TEST_URL must identify an isolated loopback server.');
const target=new URL(testURL);
if(!['http:','https:'].includes(target.protocol)||!['localhost','127.0.0.1','[::1]'].includes(target.hostname))throw Error('Print checks never run on a published calculator.');
const KEY='kitchen-calculator-pr2-browser-test-v1',DRAFT='kitchen-calculator-pr2-browser-drafts-v1',PRODUCTION='kitchen-calculator-v1';
const SENTINEL='{"fictional":"task13-protected-production-placeholder"}';
const root=path.resolve(__dirname,'..');
const output=process.env.KITCHEN_TEST_ARTIFACT_DIR||path.join(os.tmpdir(),'kitchen-task13-artifacts');
const baselineCSS=process.env.KITCHEN_PRINT_BASE_CSS?fsSync.readFileSync(process.env.KITCHEN_PRINT_BASE_CSS,'utf8'):execFileSync('git',['show','d4358aa886ae3be1569d1901f1721a9cf2459636:styles.css'],{cwd:root,encoding:'utf8'});
const NOTE='Расчёт основан на продуктовой себестоимости. Зарплата, аренда, коммунальные расходы, налоги и другие затраты не учитываются. Указанная прибыль не является чистой прибылью заведения';
const choices={none:[],first:[0],second:[1],both:[0,1]};
function fixture(){
 const data=Seed.create();
 for(const product of data.products){product.price=product.id==='product-raw-meat'?500:product.unit==='pcs'?20:100;if(product.unit==='l')product.gramsPerMl=.9;}
 const meat=data.recipes.find(recipe=>recipe.id==='prep-meat');meat.ingredients[0].quantity=1000;meat.actualYield=600;
 const fries=data.recipes.find(recipe=>recipe.id==='prep-fries');for(const ingredient of fries.ingredients)if(ingredient.quantity==null)ingredient.quantity=ingredient.unit==='ml'?10:1;
 const dish=data.recipes.find(recipe=>recipe.id==='dish-gyro');dish.name='Гиро в булке куриное большое';dish.portions=1;dish.sellingPrice=350;
 dish.technology='1. Подготовить готовые компоненты.\n2. Собрать гиро в булке.\n3. Упаковать и подать. КОНЕЦ_ТЕХНОЛОГИИ';dish.note='Вымышленный рецепт. КОНЕЦ_ПРИМЕЧАНИЯ';
 data.packaging=[{id:'pack-box',name:'Бокс',price:10,packQuantity:1,unit:'pcs',note:''},{id:'pack-foil',name:'Фольга',price:500,packQuantity:100,unit:'m',note:''},{id:'pack-napkin',name:'Салфетка',price:1,packQuantity:1,unit:'pcs',note:''},{id:'pack-ketchup',name:'Кетчуп к заказу',price:200,packQuantity:1,unit:'kg',note:''}];
 dish.packaging=data.packaging.map((material,i)=>({id:'packing-'+i,refId:material.id,quantity:[1,60,2,30][i],unit:['pcs','cm','pcs','g'][i],freeForGuest:i===3,costMode:'additional'}));
 return data;
}
const normalize=text=>text.replace(/\s+/g,' ').trim();
function details(file){
 const info=execFileSync('pdfinfo',[file],{encoding:'utf8'}),text=execFileSync('pdftotext',['-layout',file,'-'],{encoding:'utf8'}),images=execFileSync('pdfimages',['-list',file],{encoding:'utf8'});
 const imageRows=images.split('\n').filter(line=>/^\s*\d+\s+\d+\s+image\s/.test(line)).map(line=>{const cells=line.trim().split(/\s+/);return {width:Number(cells[3]),height:Number(cells[4]),xppi:Number(cells[12]),yppi:Number(cells[13])};});
 return {text,info,pages:Number(info.match(/^Pages:\s+(\d+)/m)?.[1]),images:imageRows};
}
function assertAllPagesHaveText(proof){assert.equal(proof.text.split('\f').filter(page=>page.trim()).length,proof.pages,'Every PDF page contains actual card text');}
function assertBounds(file){
 const xml=execFileSync('pdftotext',['-bbox-layout',file,'-'],{encoding:'utf8'});let words=0;
 for(const match of xml.matchAll(/<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g)){
  const width=Number(match[1]),height=Number(match[2]);
  for(const word of match[3].matchAll(/<word xMin="([\d.\-]+)" yMin="([\d.\-]+)" xMax="([\d.\-]+)" yMax="([\d.\-]+)">/g)){
   words++;const [x1,y1,x2,y2]=word.slice(1).map(Number);
   assert(x1>=40&&y1>=40&&x2<=width-40&&y2<=height-40,`Text remains inside A4 margins: ${[x1,y1,x2,y2]} on ${width}×${height}`);
  }
 }
 assert(words>50,'PDF bounding-box proof contains substantial text');
}
let browser,passed=0;const failures=[],proof=[];
async function createPage({data=fixture(),before=false,width=1366,photos=2}={}){
 const context=await browser.newContext({viewport:{width,height:900},acceptDownloads:true,isMobile:width<768,hasTouch:width<768});const errors=[];
 await context.addInitScript(({key,draftKey,production,sentinel,data})=>{
  if(!['http:','https:'].includes(location.protocol))return;
  const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
  if(get.call(localStorage,key)===null)set.call(localStorage,key,JSON.stringify(data));
  set.call(localStorage,production,sentinel);window.__compactOps=[];window.__compactRead=k=>get.call(localStorage,k);
  for(const method of ['getItem','setItem','removeItem','clear']){const original=Storage.prototype[method];Storage.prototype[method]=function(...args){window.__compactOps.push({method,key:args[0]});return original.apply(this,args);};}
 },{key:KEY,draftKey:DRAFT,production:PRODUCTION,sentinel:SENTINEL,data});
 context.on('page',page=>{page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());});
 const page=await context.newPage();if(before)await page.route('**/styles.css',route=>route.fulfill({contentType:'text/css',body:baselineCSS}));await page.goto(testURL);
 if(photos){await page.locator('#edit-recipe').click();for(let index=0;index<photos;index++){
   const url=await page.evaluate(index=>{const canvas=document.createElement('canvas');canvas.width=1400;canvas.height=950;const ctx=canvas.getContext('2d');ctx.fillStyle=index?'#624532':'#3d5437';ctx.fillRect(0,0,1400,950);ctx.fillStyle='#eedcb7';ctx.beginPath();ctx.ellipse(700,475,510,330,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#a63824';for(let n=0;n<54;n++)ctx.fillRect(420+n%9*60,300+Math.floor(n/9)*62,17,12);return canvas.toDataURL('image/jpeg',.9);},index);
   const selector=index?'#photo-file-2':'#photo-file';await page.locator(selector).setInputFiles({name:'fictional-gyro.jpg',mimeType:'image/jpeg',buffer:Buffer.from(url.split(',')[1],'base64')});await page.waitForFunction(index=>{const el=document.querySelector(`.photo-editor [data-photo-slot="${index}"] img`);return el?.naturalWidth>0&&!document.querySelector(index?'#photo-file-2':'#photo-file')?.disabled;},index);
  }await page.locator('#save-item').click();await page.locator('#view-recipe').click();}
 await ready(page);await page.mouse.move(0,0);return {page,context,errors};
}
async function ready(page){await page.waitForFunction(()=>document.querySelector('#print-recipe')?.disabled===false);await page.evaluate(()=>document.fonts.ready);}
async function guard(page){const saved=await page.evaluate(key=>({production:window.__compactRead(key),ops:window.__compactOps}),PRODUCTION);assert.equal(saved.production,SENTINEL);assert(saved.ops.length&&saved.ops.every(op=>op.method!=='clear'&&[KEY,DRAFT].includes(op.key)));}
async function snapshot(page){return page.evaluate(async({key,draftKey})=>{const raw=localStorage.getItem(key),data=JSON.parse(raw),ids=KitchenPhotos.ids(data.recipes.find(r=>r.id==='dish-gyro')),hashes=[];for(const id of ids)if(id){const photo=await KitchenPhotos.get(id),digest=await crypto.subtle.digest('SHA-256',await photo.blob.arrayBuffer());hashes.push([...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join(''));}return {raw,drafts:localStorage.getItem(draftKey),ids,hashes,backup:JSON.stringify(await KitchenPhotos.exportData(data))};},{key:KEY,draftKey:DRAFT});}
async function print(page,{form='calculation',selection='both',name}={}){await page.emulateMedia({media:'screen'});await page.locator('#card-mode').selectOption(form);await page.locator('#print-photos').selectOption(selection);await ready(page);await page.emulateMedia({media:'print'});const file=path.join(output,name+'.pdf');await page.pdf({path:file,format:'A4',preferCSSPageSize:true});return {file,...details(file)};}
async function photosGeometry(page){return page.locator('#card-photos .photo-open').evaluateAll(nodes=>nodes.filter(el=>el.getBoundingClientRect().width>0&&el.getBoundingClientRect().height>0).map(el=>{const rect=el.getBoundingClientRect(),image=el.querySelector('img'),style=getComputedStyle(image);return {width:rect.width,height:rect.height,maxHeight:style.maxHeight,fit:style.objectFit};}));}
async function screenProof(page){await page.emulateMedia({media:'screen'});await page.mouse.move(0,0);return {styles:await page.locator('#recipe-card').evaluate(el=>[el,...el.querySelectorAll('*')].map(node=>{const s=getComputedStyle(node);return ['display','position','width','height','fontSize','lineHeight','marginTop','marginBottom','paddingTop','paddingBottom','borderTopWidth','color','backgroundColor','transform'].map(key=>s[key]);})),png:await page.locator('#recipe-card').screenshot({animations:'disabled'})};}
async function test(name,fn){try{await fn();passed++;console.log('PASS compact print:',name);}catch(error){failures.push({name,error:error.stack||error.message});console.error('FAIL compact print:',name,error.message);}}
(async()=>{
 try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});await fs.mkdir(output,{recursive:true});
  await test('representative chicken gyro fits one A4 page with any photograph selection without shrinking photos',async()=>{
   const before=await createPage({before:true}),after=await createPage();try{const state=await snapshot(after.page),pageCounts=[];
    for(const [selection,indexes]of Object.entries(choices)){
     const old=await print(before.page,{selection,name:'gyro-before-'+selection}),oldGeometry=await photosGeometry(before.page);
     const current=await print(after.page,{selection,name:'gyro-after-'+selection}),geometry=await photosGeometry(after.page);
     pageCounts.push({selection,pages:current.pages});assert(old.pages>=current.pages);assert.equal(current.images.length,indexes.length);assert.deepEqual(current.images,old.images,'Physical image size and pixel dimensions remain unchanged');assert.deepEqual(geometry,oldGeometry,'The 50mm image frames are unchanged');
     assert.match(current.info,/A4/);assertAllPagesHaveText(current);assertBounds(current.file);
     const text=normalize(current.text);for(const name of ['Гиро в булке куриное большое','Готовое мясо','Жареный картофель','Майонез','Кетчуп','Мустарда','Дзадзики','Синий лук','Помидоры','Булочка','Бокс','Фольга','Салфетка','Кетчуп к заказу','КОНЕЦ_ТЕХНОЛОГИИ','КОНЕЦ_ПРИМЕЧАНИЯ','Валовая прибыль с порции','Наценка','Валовая маржа','Фудкост'])assert(text.includes(name),'PDF retains '+name);assert(text.includes(normalize(NOTE)));
     const numeric=await after.page.evaluate(()=>{const d=KitchenStorage.load().data,c=KitchenCalc.calcRecipe(d,'dish-gyro'),r=d.recipes.find(r=>r.id==='dish-gyro');return {food:c.knownCost,pack:KitchenPackaging.calculate(d,r,1).knownCost,profit:KitchenProfitability.calculate(d,r.id)};});assert.equal(numeric.profit.foodCostPerPortion,numeric.food);assert.equal(numeric.profit.grossProfitPerPortion,350-numeric.food);
     proof.push({fixture:'test copy of seed gyro',foodRows:9,packagingRows:4,selection,beforePages:old.pages,afterPages:current.pages,photoGeometry:geometry,images:current.images.length});
    }
    assert.deepEqual(await snapshot(after.page),state,'All local data and image bytes remain unchanged');await guard(before.page);await guard(after.page);assert.deepEqual(before.errors,[]);assert.deepEqual(after.errors,[]);
    for(const version of ['before','after'])execFileSync('pdftoppm',['-f','1','-singlefile','-scale-to','1600','-png',path.join(output,'gyro-'+version+'-both.pdf'),path.join(output,'gyro-'+version)]);
    console.log('GYRO_PAGE_COUNTS',JSON.stringify(pageCounts));for(const count of pageCounts)assert.equal(count.pages,1,'Nine food ingredients, four materials and profitability fit one A4 page: '+count.selection);
   }finally{await before.context.close();await after.context.close();}
  });
  for(const width of [320,390,1366])await test(`screen layout is pixel-identical before and after at ${width}px`,async()=>{
   const before=await createPage({before:true,width}),after=await createPage({width});try{const old=await screenProof(before.page),current=await screenProof(after.page);assert.deepEqual(current.styles,old.styles);assert(current.png.equals(old.png),'Screen card pixels do not change');assert(await after.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await guard(before.page);await guard(after.page);assert.deepEqual(before.errors,[]);assert.deepEqual(after.errors,[]);}finally{await before.context.close();await after.context.close();}
  });
  await test('chef printing and all four photo choices are unchanged',async()=>{
   const before=await createPage({before:true}),after=await createPage();try{for(const [selection,indexes]of Object.entries(choices)){
     const old=await print(before.page,{form:'chef',selection,name:'chef-before-'+selection}),current=await print(after.page,{form:'chef',selection,name:'chef-after-'+selection});assert.equal(current.pages,old.pages);assert.equal(current.text,old.text);assert.deepEqual(current.images,old.images);assert.equal(current.images.length,indexes.length);assertAllPagesHaveText(current);assertBounds(current.file);assert.doesNotMatch(current.text,/₽|себестоимост|Валовая прибыль|Наценка|Фудкост/);
     for(const version of ['before','after'])execFileSync('pdftoppm',['-f','1','-singlefile','-scale-to','1000','-png',path.join(output,'chef-'+version+'-'+selection+'.pdf'),path.join(output,'chef-'+version+'-'+selection)]);
     assert((await fs.readFile(path.join(output,'chef-before-'+selection+'.png'))).equals(await fs.readFile(path.join(output,'chef-after-'+selection+'.png'))),'Chef A4 pixels do not change');
    }await guard(before.page);await guard(after.page);assert.deepEqual(before.errors,[]);assert.deepEqual(after.errors,[]);}finally{await before.context.close();await after.context.close();}
  });
  await test('a single saved photograph keeps its physical size and no empty second frame is printed',async()=>{
   const before=await createPage({before:true,photos:1}),after=await createPage({photos:1});try{const pageCounts=[];for(const selection of ['first','both','second']){const old=await print(before.page,{selection,name:'single-before-'+selection}),current=await print(after.page,{selection,name:'single-after-'+selection});pageCounts.push(current.pages);assert.deepEqual(current.images,old.images);assert.equal(current.images.length,selection==='second'?0:1);assertBounds(current.file);}for(const count of pageCounts)assert.equal(count,1);assert.deepEqual(before.errors,[]);assert.deepEqual(after.errors,[]);}finally{await before.context.close();await after.context.close();}
  });
  const long=fixture(),dish=long.recipes.find(r=>r.id==='dish-gyro');dish.ingredients=Array.from({length:90},(_,i)=>({id:'long-food-'+i,refId:i%2?'product-ketchup':'prep-meat',quantity:5,unit:'g',lossPercent:null,outputGrams:null,note:'ИНГРЕДИЕНТ_'+String(i).padStart(3,'0')}));long.packaging=Array.from({length:40},(_,i)=>({id:'long-material-'+i,name:'Упаковка_'+String(i).padStart(3,'0'),price:1,packQuantity:1,unit:'pcs',note:''}));dish.packaging=long.packaging.map((material,i)=>({id:'long-packing-'+i,refId:material.id,quantity:1,unit:'pcs',freeForGuest:i%3===0,costMode:'additional'}));dish.technology=('Аккуратно подготовить компоненты и собрать блюдо.\n'.repeat(130))+'КОНЕЦ_ДЛИННОЙ_ТЕХНОЛОГИИ';dish.note=('Уточняющая заметка для проверки переноса. '.repeat(100))+'КОНЕЦ_ДЛИННОГО_ПРИМЕЧАНИЯ';
  await test('long tables and lengthy recipe text continue on occupied A4 pages without lost rows or clipping',async()=>{
   const active=await createPage({data:long,photos:2});try{const source=await snapshot(active.page);for(const form of ['calculation','chef'])for(const selection of ['none','both']){const printed=await print(active.page,{form,selection,name:form+'-long-'+selection});assert(printed.pages>1&&printed.pages<20);assertAllPagesHaveText(printed);assertBounds(printed.file);for(let i=0;i<90;i++)assert(printed.text.includes('ИНГРЕДИЕНТ_'+String(i).padStart(3,'0')));for(let i=0;i<40;i++)assert(printed.text.includes('Упаковка_'+String(i).padStart(3,'0')));assert.match(printed.text,/КОНЕЦ_ДЛИННОЙ_ТЕХНОЛОГИИ/);assert.match(printed.text,/КОНЕЦ_ДЛИННОГО_ПРИМЕЧАНИЯ/);assert.equal(await active.page.locator('.food-ingredients thead').evaluate(el=>getComputedStyle(el).display),'table-header-group');}assert.deepEqual(await snapshot(active.page),source);await guard(active.page);assert.deepEqual(active.errors,[]);}finally{await active.context.close();}
  });
  const tall=fixture(),tallDish=tall.recipes.find(r=>r.id==='dish-gyro');tallDish.ingredients[0].note=Array.from({length:400},(_,i)=>'ПОМЕТКА_'+String(i).padStart(3,'0')).join(' ');tallDish.ingredients[1].note='ПОСЛЕ_ВЫСОКОЙ_СТРОКИ';
  await test('one ingredient note taller than a page is allowed to continue instead of being cut off',async()=>{
   const active=await createPage({data:tall,photos:0});try{const printed=await print(active.page,{selection:'none',name:'calculation-tall-row'});assert(printed.pages>1);assertAllPagesHaveText(printed);assertBounds(printed.file);for(let i=0;i<400;i++)assert(printed.text.includes('ПОМЕТКА_'+String(i).padStart(3,'0')));assert.match(printed.text,/ПОСЛЕ_ВЫСОКОЙ_СТРОКИ/);assert.match(printed.text,/КОНЕЦ_ПРИМЕЧАНИЯ/);await guard(active.page);assert.deepEqual(active.errors,[]);}finally{await active.context.close();}
  });
  await fs.writeFile(path.join(output,'print-proof.json'),JSON.stringify(proof,null,2)+'\n');
 }catch(error){failures.push({name:'runner',error:error.stack||error.message});}
 finally{if(browser)await browser.close();}
 for(const failure of failures)console.error(JSON.stringify(failure));console.log(`${passed} compact-print browser scenarios passed; ${failures.length} failures.`);if(failures.length)process.exitCode=1;
})();
