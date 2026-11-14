/* Issue #7: packaging materials are tested only with fictional data in fresh,
 * disposable browser contexts against the runner's local HTTP server. */
'use strict';
const {replaceJSONFromFile}=require('./helpers/import-preview.js');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {chromium}=require('playwright');
const TEST_KEY='kitchen-calculator-pr2-browser-test-v1';
const DRAFT_KEY='kitchen-calculator-pr2-browser-drafts-v1';
const PRODUCTION_KEY='kitchen-calculator-v1';
const SENTINEL='{"fictional":"issue-7-protected-production-placeholder"}';
const testURL=process.env.KITCHEN_TEST_URL;
if(!testURL)throw Error('KITCHEN_TEST_URL must point to a disposable loopback server.');
const target=new URL(testURL);
if(!['http:','https:'].includes(target.protocol)||!['localhost','127.0.0.1','[::1]'].includes(target.hostname)){
  throw Error('Packaging checks may run only against a loopback server.');
}
const product=(id,name,price=100)=>({id,name,aliases:'',price,packQuantity:1,unit:'kg',massPerPiece:null,gramsPerMl:null,note:''});
const ingredient=(id,refId,quantity=100)=>({id,refId,quantity,unit:'g',lossPercent:null,outputGrams:null,note:''});
const material=(id,name,price,packQuantity,unit)=>({id,name,price,packQuantity,unit,note:''});
const packagingRow=(id,refId,quantity,unit,extra={})=>({id,refId,quantity,unit,freeForGuest:false,costMode:'auto',...extra});
function fixture(withRows=false){
  return {version:1,products:[product('food-rice','Вымышленный рис')],packaging:[
    material('pack-foil','Фольга',500,100,'m'),
    material('pack-box','Фри-бокс',500,50,'pcs'),
    material('pack-napkin','Салфетка',.5,1,'pcs'),
    material('pack-ketchup','Кетчуп',200,1,'kg')
  ],recipes:[{id:'packaging-dish',type:'dish',name:'Вымышленный рис с упаковкой',note:'',technology:'1. Подготовить.\n2. Подать.',portions:1,actualYield:null,
    ingredients:[ingredient('food-rice-row','food-rice')],packaging:withRows?[
      packagingRow('packing-foil','pack-foil',60,'cm'),packagingRow('packing-box','pack-box',1,'pcs'),
      packagingRow('packing-napkin','pack-napkin',2,'pcs'),packagingRow('packing-ketchup','pack-ketchup',30,'g',{freeForGuest:true})
    ]:[]} ]};
}
function legacyFixture(){const data=fixture(false);delete data.packaging;delete data.recipes[0].packaging;return data;}
const stored=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),TEST_KEY);
function hasMoney(text,amount){
  const expected=amount.toFixed(2).replace('.',',');
  assert(new RegExp('(?:^|[^\\d,])'+expected.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*₽').test(text),`Expected ${expected} ₽ in: ${text}`);
}
async function guard(page){
  assert.equal(await page.evaluate(()=>KitchenStorage.KEY),TEST_KEY);
  assert.match(await page.locator('.test-notice').innerText(),/ТЕСТ/);
}
async function isolation(page,expectSentinel=true){
  const proof=await page.evaluate(key=>({ops:window.__packagingStorageOps.slice(),sentinel:window.__readPackagingSentinel(key)}),PRODUCTION_KEY);
  if(expectSentinel)assert.equal(proof.sentinel,SENTINEL,'The production placeholder remains unchanged');
  assert(proof.ops.length>0&&proof.ops.every(op=>op.method!=='clear'&&[TEST_KEY,DRAFT_KEY].includes(op.key)),'Application storage operations stay in the preview namespace');
}
async function noOverflow(page){
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal page overflow');
  const panel=page.locator('.packaging-panel');
  if(await panel.count())assert(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'No horizontal packaging editor overflow');
}
async function installData(page,data){
  await page.evaluate(({key,productionKey,sentinel,data})=>{
    localStorage.setItem(productionKey,sentinel);
    localStorage.setItem(key,JSON.stringify(KitchenStorage.validate(data)));
  },{key:TEST_KEY,productionKey:PRODUCTION_KEY,sentinel:SENTINEL,data});
  await page.reload();await guard(page);
}
async function importJSON(page,data,accept=true){return replaceJSONFromFile(page,data,{name:'fictional-packaging.json',accept,waitForCompletion:true});}

async function editDish(page){
  if(await page.locator('#edit-recipe').count())await page.locator('#edit-recipe').click();
}
async function addRow(page,refId,quantity,unit,free=false){
  await page.locator('#add-packaging-row').click();
  const row=page.locator('[data-packaging-row]').last();const id=await row.getAttribute('data-packaging-row');
  await page.locator('#pack-ref-'+id).selectOption(refId);
  await page.locator('#pack-unit-'+id).selectOption(unit);
  await page.locator('#pack-qty-'+id).fill(String(quantity));
  if(free)await page.locator('#pack-free-'+id).check();
  return {row:page.locator(`[data-packaging-row="${id}"]`),id};
}
let browser,passed=0;
const failures=[];
async function test(name,fn,{width=1366,data=fixture(false)}={}){
  const context=await browser.newContext({viewport:{width,height:900},acceptDownloads:true});
  await context.addInitScript(()=>{
    window.__packagingStorageOps=[];
    const nativeGetItem=Storage.prototype.getItem;
    window.__readPackagingSentinel=key=>nativeGetItem.call(localStorage,key);
    for(const method of ['getItem','setItem','removeItem','clear']){
      const original=Storage.prototype[method];
      Storage.prototype[method]=function(...args){window.__packagingStorageOps.push({method,key:args[0]});return original.apply(this,args);};
    }
  });
  const page=await context.newPage();page.setDefaultTimeout(7000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  try{
    await page.goto(testURL);await guard(page);await isolation(page,false);await installData(page,data);
    await fn(page,context);await isolation(page);await noOverflow(page);assert.deepEqual(errors,[],'No application JavaScript errors');
    console.log('PASS packaging:',name);passed++;
  }catch(error){failures.push({name,error:error.stack||error.message});console.error('FAIL packaging:',name,error.message);}
  finally{await context.close();}
}
(async()=>{
  try{
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
    for(const width of [1366,360,390,430])await test(`per-portion materials, temporary scaling, JSON and print at ${width}px`,async page=>{
      const initial=await stored(page);await editDish(page);
      assert.equal(await page.locator('.ingredient-row').count(),1,'Packaging is not a food ingredient');
      assert(await page.evaluate(()=>Boolean(document.querySelector('#ingredients').compareDocumentPosition(document.querySelector('.packaging-panel'))&Node.DOCUMENT_POSITION_FOLLOWING)),'Packaging editor follows food ingredients');
      const rows=[];
      rows.push(await addRow(page,'pack-foil',60,'cm'));
      rows.push(await addRow(page,'pack-box',1,'pcs'));
      rows.push(await addRow(page,'pack-napkin',2,'pcs'));
      rows.push(await addRow(page,'pack-ketchup',30,'g',true));
      for(let i=0;i<rows.length;i++)hasMoney(await rows[i].row.locator('.packaging-row-cost').innerText(),[3,10,1,6][i]);
      hasMoney(await page.locator('.packaging-panel .packaging-subtotal').innerText(),20);
      hasMoney(await page.locator('#summary .summary-value').innerText(),30);
      assert.match(await page.locator('#summary').innerText(),/100\s*г/,'Packing must not enter the food yield');
      await noOverflow(page);
      await page.locator('#save-item').click();await page.locator('#save-item').click();
      const saved=await stored(page);assert.equal(saved.recipes.length,1);assert.equal(saved.recipes[0].packaging.length,4);
      assert.deepEqual(saved.products,initial.products);assert.deepEqual(saved.recipes[0].ingredients,initial.recipes[0].ingredients);
      await page.locator('#view-recipe').click();
      assert.equal(await page.locator('.packaging-card').count(),1);hasMoney(await page.locator('.packaging-card .packaging-subtotal').innerText(),20);
      assert.match(await page.locator('.packaging-card').innerText(),/Бесплатно для гостя/);
      const beforeScale=await stored(page);await page.locator('#view-portions').fill('10');
      hasMoney(await page.locator('.packaging-card .packaging-subtotal').innerText(),200);hasMoney(await page.locator('#recipe-card').innerText(),300);
      const texts=await page.locator('.packaging-card tbody tr').allInnerTexts();
      assert.match(texts[0],/600\s*см/);assert.match(texts[1],/10\s*шт/);assert.match(texts[2],/20\s*шт/);assert.match(texts[3],/300\s*г/);
      assert.match(await page.locator('#recipe-card').innerText(),/Выход готового блюда:\s*1000\s*г/);
      assert.deepEqual(await stored(page),beforeScale,'Scaling is a temporary view only');
      await isolation(page);await page.reload();await guard(page);hasMoney(await page.locator('.packaging-card .packaging-subtotal').innerText(),20);
      const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadPromise;
      assert.match(download.suggestedFilename(),/^kitchen-calculator-PR2-TEST-/);
      const raw=await fs.readFile(await download.path(),'utf8');assert(!raw.includes('issue-7-protected-production-placeholder'));
      const backup=JSON.parse(raw);assert.deepEqual(backup.packaging,saved.packaging);assert.deepEqual(backup.recipes[0].packaging,saved.recipes[0].packaging);
      await importJSON(page,backup);assert.deepEqual(await stored(page),backup);
      await page.locator('#card-mode').selectOption('chef');
      assert.equal(await page.locator('.packaging-card').count(),1);
      assert.equal(await page.locator('.packaging-card .packaging-finance').count(),0);
      assert.doesNotMatch(await page.locator('.packaging-card').innerText(),/₽|себестоимост|закупочн|сумма|стоимость/i);
      assert.doesNotMatch(await page.locator('#recipe-card').innerText(),/₽|себестоимост/i);
      const background=await page.evaluate(async()=>{
        const body=getComputedStyle(document.body),url=body.backgroundImage.match(/url\(["']?([^"')]+)["']?\)/);
        const response=url?await fetch(url[1]):null;
        return {image:body.backgroundImage,status:response?.status,type:response?.headers.get('content-type'),bytes:response?(await response.arrayBuffer()).byteLength:0,
          editor:getComputedStyle(document.querySelector('.editor')).backgroundColor,input:getComputedStyle(document.querySelector('#view-portions')).backgroundColor};
      });
      assert.match(background.image,/url\(/);assert.equal(background.status,200);assert.match(background.type,/image\/webp/);
      assert(background.bytes>0&&background.bytes<350*1024,'Decorative background remains a small local WebP');
      assert.equal(background.editor,'rgb(255, 255, 255)');assert.equal(background.input,'rgb(255, 255, 255)');
      await page.emulateMedia({media:'print'});
      assert.equal(await page.locator('.library').isVisible(),false);assert.equal(await page.locator('.card-controls').isVisible(),false);
      assert.equal(await page.locator('.packaging-card').isVisible(),true);
      assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundImage),'none','The decorative pattern is not printed');
      if(width===1366)await page.pdf({path:'/tmp/kitchen-packaging-chef.pdf',format:'A4'});
      await page.emulateMedia({media:'screen'});await page.locator('#card-mode').selectOption('calculation');
      assert(await page.locator('.packaging-card .packaging-finance').count()>0);hasMoney(await page.locator('#recipe-card').innerText(),30);
      if(width===1366){await page.emulateMedia({media:'print'});await page.pdf({path:'/tmp/kitchen-packaging-manager.pdf',format:'A4'});await page.emulateMedia({media:'screen'});}
      await noOverflow(page);
    },{width});

    await test('arbitrary catalog names, units, search, edits and guarded deletion',async page=>{
      const initial=await stored(page);await page.locator('[data-tab="packaging"]').click();
      assert.equal(await page.locator('[data-open]').count(),4);assert.equal(await page.locator('[data-open="food-rice"]').count(),0);
      await page.locator('#create').click();const name='Мой материал №1 <проверка>';
      await page.locator('#item-name').fill(name);await page.locator('#price').fill('500');await page.locator('#packQuantity').fill('100');
      await page.locator('#packaging-unit').selectOption('m');
      const options=await page.locator('#packaging-unit option').evaluateAll(nodes=>nodes.map(node=>node.value).sort());
      assert.deepEqual(options,['cm','g','kg','l','m','ml','pcs'].sort());
      await page.locator('#save-item').click();await page.locator('#save-item').click();
      let data=await stored(page);assert.equal(data.packaging.length,5);assert.deepEqual(data.products,initial.products);assert.deepEqual(data.recipes,initial.recipes);
      const id=data.packaging.find(item=>item.name===name).id;await page.locator('#price').fill('1000');await page.locator('#save-item').click();
      await page.locator('#library-search').fill('мой материал');assert.equal(await page.locator('[data-open]').count(),1);
      assert.equal(await page.locator('[data-open] strong').innerText(),name);assert.equal(await page.locator('проверка').count(),0,'User names remain text, never markup');
      await page.reload();await page.locator('[data-tab="packaging"]').click();await page.locator(`[data-open="${id}"]`).click();
      assert.equal(await page.locator('#price').inputValue(),'1000');assert.equal(await page.locator('#packaging-unit').inputValue(),'m');
      await page.locator('#delete-item').click();assert.equal((await stored(page)).packaging.length,4);
      await importJSON(page,fixture(true));await page.locator('[data-tab="packaging"]').click();await page.locator('[data-open="pack-foil"]').click();
      await page.locator('#delete-item').click();assert.match(await page.locator('#message').innerText(),/использ|невозмож/i);
      assert.equal((await stored(page)).packaging.length,4,'Used catalog materials cannot be deleted');
      await page.locator('#library-search').fill('рис');assert.equal(await page.locator('[data-open]').count(),0,'Materials are searched separately from food');
      await page.locator('[data-tab="products"]').click();assert.equal(await page.locator('[data-open="food-rice"]').count(),1);
    });

    await test('invalid quantities retain input and missing prices are visibly incomplete',async page=>{
      const data=fixture(false);data.packaging.push(material('pack-unknown','Пакет без цены',null,1,'pcs'));
      await importJSON(page,data);await editDish(page);const foil=await addRow(page,'pack-foil',60,'cm');
      await page.locator('#pack-qty-'+foil.id).fill('-1');assert.equal(await page.locator('#pack-qty-'+foil.id).getAttribute('aria-invalid'),'true');
      await page.locator('#add-packaging-row').click();
      const blankId=await page.locator('[data-packaging-row]').last().getAttribute('data-packaging-row');
      const blank=page.locator(`[data-packaging-row="${blankId}"]`);
      assert.equal(await page.locator('#pack-qty-'+foil.id).inputValue(),'-1','An added row does not destroy invalid raw input');
      const beforeSave=await stored(page);await page.locator('#save-item').click();assert.deepEqual(await stored(page),beforeSave,'Invalid quantities block persistence');
      await blank.locator('.remove-packaging-row').click();
      assert.equal(await page.locator(`[data-packaging-row="${foil.id}"]`).count(),1,'Removing the blank row preserves the existing material row');
      await page.locator('#pack-qty-'+foil.id).fill('0');
      assert.equal(await page.locator('#pack-qty-'+foil.id).getAttribute('aria-invalid'),'true');
      await page.locator('#pack-qty-'+foil.id).fill('60');assert.equal(await page.locator('#pack-qty-'+foil.id).getAttribute('aria-invalid'),null);
      await addRow(page,'pack-unknown',1,'pcs');assert.match(await page.locator('.packaging-panel').innerText(),/непол|нет цены|цен[аы].*не/i);
      hasMoney(await page.locator('.packaging-panel .packaging-subtotal').innerText(),3);assert.match(await page.locator('#summary').innerText(),/непол/i);
      await page.locator('#save-item').click();const saved=await stored(page);
      assert.equal(saved.recipes[0].packaging.length,2);assert.equal(saved.recipes[0].packaging[0].quantity,60);
      const calculation=await page.evaluate(()=>{const data=JSON.parse(localStorage.getItem(KitchenStorage.KEY));return KitchenPackaging.calculate(data,data.recipes[0],1);});
      assert.equal(calculation.complete,false);assert.equal(calculation.knownCost,3);
    });

    await test('duplicate food and nested ingredients are not charged twice unless explicitly additional',async page=>{
      for(const nested of [false,true]){
        const data=fixture(false);data.products=[product('food-ketchup','Кетчуп',200)];data.packaging=[material('pack-ketchup','Кетчуп',200,1,'kg')];
        const dish=data.recipes[0];dish.ingredients=[ingredient('dish-ketchup-row',nested?'prep-ketchup':'food-ketchup',30)];
        dish.packaging=[packagingRow('packing-ketchup','pack-ketchup',30,'g',{freeForGuest:true})];
        if(nested)data.recipes.push({id:'prep-ketchup',type:'prep',name:'Кетчуп из заготовки',note:'',actualYield:1000,ingredients:[ingredient('prep-ketchup-row','food-ketchup',1000)]});
        await importJSON(page,data);await editDish(page);
        assert.match(await page.locator('.packaging-panel').innerText(),/уже.*состав|повторно.*не/i,'An automatic duplicate warning is visible');
        hasMoney(await page.locator('.packaging-panel .packaging-subtotal').innerText(),0);hasMoney(await page.locator('#summary .summary-value').innerText(),6);
        await page.locator('#pack-mode-packing-ketchup').selectOption('additional');
        hasMoney(await page.locator('.packaging-panel .packaging-subtotal').innerText(),6);hasMoney(await page.locator('#summary .summary-value').innerText(),12);
        assert(await page.locator('#pack-free-packing-ketchup').isChecked(),'Free for a guest still has procurement cost');
        await page.locator('#pack-mode-packing-ketchup').selectOption('included');
        hasMoney(await page.locator('.packaging-panel .packaging-subtotal').innerText(),0);hasMoney(await page.locator('#summary .summary-value').innerText(),6);
        await page.locator('#save-item').click();assert.equal((await stored(page)).recipes.find(item=>item.type==='dish').packaging[0].costMode,'included');
        await isolation(page);
      }
    });

    await test('saved ingredient identity prevents double charging after food and material renames',async page=>{
      const data=fixture(false);
      data.products=[product('food-ketchup','Кетчуп',200)];
      data.packaging=[material('pack-ketchup','Кетчуп',200,1,'kg')];
      data.recipes[0].ingredients=[ingredient('dish-linked-ketchup-row','food-ketchup',30)];
      data.recipes[0].packaging=[packagingRow('packing-linked-ketchup','pack-ketchup',30,'g',{freeForGuest:true})];
      await importJSON(page,data);
      let saved=await stored(page);
      assert.equal(saved.recipes[0].packaging[0].ingredientRefId,'food-ketchup','The automatically resolved food identity is stored');
      hasMoney(await page.locator('.packaging-card .packaging-subtotal').innerText(),0);
      hasMoney(await page.locator('#recipe-card .card-cost').innerText(),6);
      await page.locator('[data-tab="products"]').click();
      await page.locator('[data-open="food-ketchup"]').click();
      await page.locator('#item-name').fill('Кетчуп томатный');await page.locator('#save-item').click();
      await page.locator('[data-tab="packaging"]').click();
      await page.locator('[data-open="pack-ketchup"]').click();
      await page.locator('#item-name').fill('Выдаваемый томатный соус');await page.locator('#save-item').click();
      saved=await stored(page);
      assert.equal(saved.recipes[0].packaging[0].ingredientRefId,'food-ketchup','Renaming preserves the saved identity link');
      assert.equal(saved.products[0].name,'Кетчуп томатный');assert.equal(saved.packaging[0].name,'Выдаваемый томатный соус');
      await page.locator('[data-tab="dish"]').click();await page.locator('[data-open="packaging-dish"]').click();
      hasMoney(await page.locator('.packaging-card .packaging-subtotal').innerText(),0);
      hasMoney(await page.locator('#recipe-card .card-cost').innerText(),6,'A rename does not silently double the dish cost');
      await page.locator('#edit-recipe').click();await page.locator('.ingredient-row .remove-row').click();
      hasMoney(await page.locator('.packaging-panel .packaging-subtotal').innerText(),6,'Removing the food consumption makes the separate serving chargeable again');
      hasMoney(await page.locator('#summary .summary-value').innerText(),6);
      const inactiveLink=await page.evaluate(()=>{
        const state=JSON.parse(localStorage.getItem(KitchenStorage.KEY));
        const draft={...state.recipes[0],ingredients:[]};
        return KitchenPackaging.calculate(state,draft,1);
      });
      assert.equal(inactiveLink.knownCost,6);assert.equal(inactiveLink.rows[0].included,false,'A historical link cannot exclude a now absent food ingredient');
    });

    await test('nonempty prep packaging is rejected without replacing current or legacy data',async page=>{
      const bad=fixture(true);
      bad.recipes.push({id:'invalid-packaging-prep',type:'prep',name:'Вымышленный полуфабрикат с запрещённой упаковкой',note:'',actualYield:800,
        ingredients:[ingredient('invalid-prep-food-row','food-rice',1000)],
        packaging:[packagingRow('invalid-prep-pack-row','pack-foil',60,'cm')]});
      const before=await stored(page);await importJSON(page,bad);
      assert.deepEqual(await stored(page),before,'Rejected prep packaging cannot replace the current preview data');
      const message=await page.locator('#message').innerText();
      assert.match(message,/импорт отменён/i);assert.match(message,/упаков|фасов/i);assert.match(message,/полуфабрикат|блюд/i,'Import explains which recipe type may have packaging');
      const legacy=legacyFixture();await importJSON(page,legacy);assert.deepEqual(await stored(page),legacy);
      await importJSON(page,bad);assert.deepEqual(await stored(page),legacy,'An old backup is also preserved after the rejection');
      await page.reload();await guard(page);assert.deepEqual(await stored(page),legacy);assert.equal(await page.locator('.packaging-card').count(),0);
    });

    await test('old JSON remains unchanged and bad packaging imports preserve existing data',async page=>{
      const legacy=legacyFixture();await importJSON(page,legacy);assert.deepEqual(await stored(page),legacy);
      assert.equal(await page.locator('.packaging-card').count(),0);const before=await stored(page);
      await page.locator('#view-portions').fill('10');assert.deepEqual(await stored(page),before);
      const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadPromise;
      assert.deepEqual(JSON.parse(await fs.readFile(await download.path(),'utf8')),legacy);
      const bad=fixture(true);bad.recipes[0].packaging[0].refId='missing-material';
      await importJSON(page,bad);assert.deepEqual(await stored(page),legacy);assert.match(await page.locator('#message').innerText(),/Импорт отменён/);
      await importJSON(page,fixture(true),false);assert.deepEqual(await stored(page),legacy,'Cancelled import preserves an old backup exactly');
      await page.reload();await guard(page);assert.deepEqual(await stored(page),legacy);assert.equal(await page.locator('.packaging-card').count(),0);
    },{width:390,data:legacyFixture()});
  }catch(error){failures.push({name:'runner',error:error.stack||error.message});}
  finally{if(browser)await browser.close();}
  for(const failure of failures)console.error(JSON.stringify(failure));
  console.log(`${passed}/10 packaging browser scenarios passed; ${failures.length} failures.`);
  if(failures.length)process.exitCode=1;
})();
