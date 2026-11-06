/* Optional browser checks: npm install --prefix /tmp/kitchen-browser playwright
 * NODE_PATH=/tmp/kitchen-browser/node_modules node tests/browser.test.js
 * Serve the repository first: python3 -m http.server 8765 --bind 127.0.0.1
 * Override KITCHEN_TEST_URL / CHROMIUM_PATH if needed. No build is required. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { chromium } = require('playwright');
const URL = process.env.KITCHEN_TEST_URL || 'http://127.0.0.1:8765';
let browser, passed = 0, failed = 0;
const errors = [];
async function test(name, fn, options = {}) {
  const context = await browser.newContext({ viewport: {width:1366,height:900},acceptDownloads:true,...options });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const pageErrors = [];
  page.on('pageerror',e => pageErrors.push(e.message));
  page.on('dialog',async dialog => {
    if (dialog.type() === 'beforeunload') await dialog.accept();
    else await dialog.accept();
  });
  try {
    await page.goto(URL);
    if (!options.card) await editIfCard(page);
    await fn(page,context);
    assert.deepEqual(pageErrors,[], 'No application JS exceptions');
    console.log('PASS',name); passed++;
  } catch(e) {
    console.log('FAIL',name,e.message); errors.push({name,error:e.message});failed++;
  } finally {await context.close();}
}
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem(KitchenStorage.KEY)));
async function tab(page,key) { await page.locator(`[data-tab="${key}"]`).click(); }
async function editIfCard(page) {if(await page.locator('#edit-recipe').count()) await page.locator('#edit-recipe').click();}
async function open(page,id) {await page.locator(`[data-open="${id}"]`).click();await editIfCard(page);}
async function importJSON(page,data,accept = true) {
  page.removeAllListeners('dialog');
  page.once('dialog',dialog => accept ? dialog.accept() : dialog.dismiss());
  await page.locator('#import-file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(typeof data === 'string' ? data : JSON.stringify(data))});
  await page.waitForTimeout(120);
  page.removeAllListeners('dialog');page.on('dialog',dialog=>dialog.accept());
}
(async () => {
  browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  await test('Recipe card, prices, temporary portions, print and list navigation', async page => {
    assert.equal(await page.locator('#item-name').count(),0);
    assert.equal(await page.locator('#recipe-card tbody tr').count(),9);
    const before = await stored(page);
    await page.locator('#view-portions').fill('10');
    assert.match(await page.locator('#recipe-card').innerText(),/Количество порций: 10/);
    assert.deepEqual(await stored(page),before);
    await page.locator('#show-prices').selectOption('no');
    assert.doesNotMatch(await page.locator('#recipe-card').innerText(),/₽|стоимост/i);
    await page.emulateMedia({media:'print'});
    assert.equal(await page.locator('.library').isVisible(),false);
    assert.equal(await page.locator('.card-controls').isVisible(),false);
    assert.equal(await page.locator('#recipe-card').isVisible(),true);
    await page.pdf({path:'/tmp/kitchen-card-no-prices.pdf',format:'A4'});
    await page.emulateMedia({media:'screen'});
    await page.locator('#view-portions').fill('0');assert(await page.locator('#print-recipe').isDisabled());
    await page.locator('#view-portions').fill('2');assert.equal(await page.locator('#print-recipe').isDisabled(),false);
    await page.locator('#edit-recipe').click();
    await page.locator('#technology').fill('Запечь <до готовности>');
    await page.locator('#recipe-portions').fill('2');
    await page.locator('#dish-yield').fill('900');
    await page.locator('#save-item').click();await page.locator('#save-item').click();
    assert.equal((await stored(page)).recipes.length,before.recipes.length);
    assert.equal(await page.locator('#save-item').innerText(),'Сохранено ✓');
    await page.locator('#view-recipe').click();
    assert.match(await page.locator('#recipe-card').innerText(),/Запечь <до готовности>/);
    await page.locator('#view-portions').fill('10');
    assert.match(await page.locator('#recipe-card').innerText(),/Выход готового блюда: 4500 г/);
    await page.locator('#back-list').click();assert.equal(await page.locator('#recipe-card').count(),0);
    await page.locator('#library-search').fill('Гиро');assert.equal(await page.locator('[data-open]').count(),1);
  }, {card:true});
  await test('Unsaved edits can be kept when navigation is cancelled', async page => {
    await page.locator('#item-name').fill('Не терять');
    page.removeAllListeners('dialog');page.on('dialog',d=>d.dismiss());
    await page.locator('[data-tab="products"]').click();
    assert.equal(await page.locator('#item-name').inputValue(),'Не терять');
    await page.locator('#view-recipe').click();
    assert.equal(await page.locator('#item-name').inputValue(),'Не терять');
  });
  await test('Mobile cards and multi-page A4 print preserve all rows with and without prices',async page => {
    for(const width of [360,390,430]) {
      await page.setViewportSize({width,height:844});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    }
    await page.screenshot({path:'/tmp/kitchen-card-mobile.png',fullPage:true});
    await page.evaluate(()=>{
      const data=JSON.parse(localStorage.getItem(KitchenStorage.KEY));
      data.products.forEach(p=>p.price=100);
      const dish=data.recipes.find(r=>r.type==='dish');
      const original=dish.ingredients[2];
      dish.ingredients=Array.from({length:90},(_,i)=>({...original,id:'print-row-'+i,note:'Строка '+i}));
      dish.technology='Приготовление: '+('Длинный текст технологии. '.repeat(150));
      localStorage.setItem(KitchenStorage.KEY,JSON.stringify(data));
    });
    await page.reload();
    assert.equal(await page.locator('#recipe-card tbody tr').count(),90);
    await page.pdf({path:'/tmp/kitchen-long-with-prices.pdf',format:'A4'});
    await page.locator('#show-prices').selectOption('no');
    await page.pdf({path:'/tmp/kitchen-long-no-prices.pdf',format:'A4'});
    assert.equal(await page.locator('#recipe-card th').count(),3);
    await page.locator('#view-portions').fill('0');
    await page.locator('#show-prices').selectOption('yes');
    assert(await page.locator('#print-recipe').isDisabled());
  },{card:true});
  await test('Corrupt browser data is never replaced by seed or a new save',async page => {
    await page.evaluate(()=>localStorage.setItem(KitchenStorage.KEY,'{corrupt-original'));
    await page.reload();
    assert.equal(await page.locator('[data-open]').count(),0);
    await page.locator('#create').click();await page.locator('#item-name').fill('Попытка записи');
    await page.locator('#save-item').click();
    assert.match(await page.locator('#message').innerText(),/заблокировано/);
    assert.equal(await page.evaluate(()=>localStorage.getItem(KitchenStorage.KEY)),'{corrupt-original');
  },{card:true});
  await test('Initial editable gyro, missing prices and honest incomplete total', async page => {
    assert.equal(await page.locator('#item-name').inputValue(),'Гиро в булке большое');
    assert.equal(await page.locator('.ingredient-row').count(),9);
    assert.match(await page.locator('#summary').innerText(),/Расчёт неполный/);
    assert.match(await page.locator('#summary').innerText(),/Известная часть стоимости/);
    const data = await stored(page);assert(data.products.every(p=>p.price===null));
    assert.equal(data.recipes.find(r=>r.id==='dish-gyro').ingredients.length,9);
    assert.equal(data.recipes.find(r=>r.id==='prep-meat').actualYield,null);
    await page.screenshot({path:'/tmp/kitchen-desktop.png'});
  });
  await test('Synonym search from first letter, uppercase keyboard and mouse selection',async page=>{
    await tab(page,'prep');await open(page,'prep-fries');
    const input=page.locator('#search-fries-potato');await input.fill('К');
    assert(await page.locator('#options-fries-potato .suggestion').count()>0);
    await input.fill('КАРТОШКА');await input.press('ArrowDown');await input.press('Enter');
    assert.equal(await input.inputValue(),'Картофель');
    await input.fill('майонез');await page.locator('#options-fries-potato .suggestion').click();
    assert.equal(await input.inputValue(),'Майонез');
  });
  await test('Processing output/loss synchronized; commas, dot, invalid negatives and percentages',async page=>{
    await tab(page,'prep');await open(page,'prep-fries');
    await page.locator('[data-row="fries-potato"] summary').click();
    await page.locator('#loss-fries-potato').fill('37,5');
    assert.equal(await page.locator('#output-fries-potato').inputValue(),'100');
    await page.locator('#output-fries-potato').fill('120');
    assert.equal(await page.locator('#loss-fries-potato').inputValue(),'25');
    await page.locator('#qty-fries-potato').fill('200.5');
    assert.equal(await page.locator('#output-fries-potato').inputValue(),'150,375');
    await page.locator('#loss-fries-potato').fill('101');
    assert.equal(await page.locator('#loss-fries-potato').getAttribute('aria-invalid'),'true');
    await page.locator('#save-item').click();assert.match(await page.locator('#message').innerText(),/Исправьте/);
    assert.equal((await stored(page)).recipes.find(r=>r.id==='prep-fries').ingredients[0].quantity,160);
    await page.locator('#loss-fries-potato').fill('37.5');await page.locator('#qty-fries-potato').fill('-1');
    assert.equal(await page.locator('#qty-fries-potato').getAttribute('aria-invalid'),'true');
  });
  await test('Invalid numeric input survives adding a row and can be corrected',async page=>{
    await page.locator('#qty-gyro-mayonnaise').fill('-2');
    await page.locator('#add-row').click();
    assert.equal(await page.locator('#qty-gyro-mayonnaise').inputValue(),'-2');
    assert.equal(await page.locator('#qty-gyro-mayonnaise').getAttribute('aria-invalid'),'true');
    await page.locator('#save-item').click();assert.match(await page.locator('#message').innerText(),/Исправьте/);
    await page.locator('#qty-gyro-mayonnaise').fill('22,5');await page.locator('#save-item').click();
    assert.equal((await stored(page)).recipes.find(r=>r.id==='dish-gyro').ingredients.find(r=>r.id==='gyro-mayonnaise').quantity,22.5);
  });
  await test('Product edits persist on reload; used product cannot be deleted',async page=>{
    await tab(page,'products');await open(page,'product-potato');
    await page.locator('#price').fill('500,5');await page.locator('#save-item').click();
    assert.equal((await stored(page)).products.find(p=>p.id==='product-potato').price,500.5);
    await page.reload();await editIfCard(page);await tab(page,'products');await open(page,'product-potato');
    assert.equal(await page.locator('#price').inputValue(),'500,5');
    await page.locator('#delete-item').click();assert.match(await page.locator('#message').innerText(),/Удаление невозможно/);
    assert((await stored(page)).products.some(p=>p.id==='product-potato'));
  });
  await test('Create product, prep and dish through UI; 83.33 example and dependent price updates',async page=>{
    await tab(page,'products');await page.locator('#create').click();
    await page.locator('#item-name').fill('Тестовое сырьё');await page.locator('#price').fill('500');
    await page.locator('#packQuantity').fill('1');await page.locator('#product-unit').selectOption('kg');await page.locator('#save-item').click();
    const productId=(await stored(page)).products.find(p=>p.name==='Тестовое сырьё').id;
    await tab(page,'prep');await page.locator('#create').click();await page.locator('#item-name').fill('Тестовое готовое');
    await page.locator('#add-row').click();let row=page.locator('.ingredient-row').last();
    await row.locator('.ingredient-search').fill('Тестовое сырьё');await row.locator('.suggestion').click();
    await row.locator('input[id^="qty-"]').fill('1000');
    await row.locator('summary').click();await row.locator('input[id^="loss-"]').fill('40');
    assert.equal(await row.locator('input[id^="output-"]').inputValue(),'600');
    await page.locator('#actualYield').fill('600');await page.locator('#save-item').click();
    assert.match(await page.locator('#summary').innerText(),/500,00/);
    await tab(page,'dish');await page.locator('#create').click();await page.locator('#item-name').fill('Тестовая порция');
    await page.locator('#add-row').click();row=page.locator('.ingredient-row').last();
    await row.locator('.ingredient-search').fill('Тестовое готовое');await row.locator('.suggestion').click();
    await row.locator('input[id^="qty-"]').fill('100');await page.locator('#save-item').click();
    assert.match(await page.locator('#summary').innerText(),/83,33/);assert.match(await page.locator('#summary').innerText(),/Расчётный выход рецепта: 100 г/);
    assert.equal(await row.locator('input[id^="loss-"]').count(),0,'No second production loss for finished prep');
    const dishId=(await stored(page)).recipes.find(r=>r.name==='Тестовая порция').id;
    await tab(page,'products');await open(page,productId);await page.locator('#price').fill('600');await page.locator('#save-item').click();
    await tab(page,'dish');await open(page,dishId);assert.match(await page.locator('#summary').innerText(),/100,00/);
    await page.reload();await editIfCard(page);await open(page,dishId);assert.match(await page.locator('#summary').innerText(),/100,00/);
  });
  await test('At least 30 ingredient rows, remove and save/reload',async page=>{
    for(let i=0;i<22;i++) await page.locator('#add-row').click();
    assert.equal(await page.locator('.ingredient-row').count(),31);
    await page.locator('.remove-row').last().click();assert.equal(await page.locator('.ingredient-row').count(),30);
    await page.locator('#save-item').click();await page.reload();await editIfCard(page);assert.equal(await page.locator('.ingredient-row').count(),30);
  });
  await test('Export downloads validated JSON; import replacement requires confirmation; cancel and invalid preserve state',async page=>{
    const downloadPromise = page.waitForEvent('download');await page.locator('#export').click();
    const download = await downloadPromise;const raw=await fs.readFile(await download.path(),'utf8');
    const data=JSON.parse(raw);assert.equal(data.version,1);assert.equal(data.recipes.length,3);
    const before=await stored(page);const changed=structuredClone(data);changed.recipes.find(r=>r.id==='dish-gyro').name='Импортированный гиро';
    await importJSON(page,changed,false);assert.deepEqual(await stored(page),before);
    await importJSON(page,'{"version":1}');assert.deepEqual(await stored(page),before);assert.match(await page.locator('#message').innerText(),/Импорт отменён/);
    await importJSON(page,changed,true);await editIfCard(page);assert.equal(await page.locator('#item-name').inputValue(),'Импортированный гиро');
    await page.reload();await editIfCard(page);assert.equal(await page.locator('#item-name').inputValue(),'Импортированный гиро');
  });
  await test('Nested prep cycles are excluded from picker and rejected on import',async page=>{
    const data=await stored(page);const meat=data.recipes.find(r=>r.id==='prep-meat');const fries=data.recipes.find(r=>r.id==='prep-fries');
    meat.ingredients.push({id:'nested-fries',refId:fries.id,quantity:10,unit:'g',lossPercent:null,outputGrams:null,note:''});
    await importJSON(page,data);await tab(page,'prep');await open(page,'prep-fries');
    await page.locator('#search-fries-potato').fill('Готовое');assert.equal(await page.locator('#options-fries-potato .suggestion').count(),0);
    const before=await stored(page);fries.ingredients.push({id:'cyclic-meat',refId:meat.id,quantity:10,unit:'g',lossPercent:null,outputGrams:null,note:''});
    await importJSON(page,data);assert.match(await page.locator('#message').innerText(),/циклическ/);assert.deepEqual(await stored(page),before);
  });
  await test('Mobile touch selection and layouts 360/390/430: no page overflow, last field visible',async page=>{
    for(const width of [360,390,430]) {
      await page.setViewportSize({width,height:844});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),`No overflow at ${width}`);
      const last=page.locator('#note-gyro-bun');await last.focus();await last.scrollIntoViewIfNeeded();
      const rect=await last.boundingBox();assert(rect.y>=0 && rect.y+rect.height<=844,`Last field visible at ${width}`);
      assert.equal(await page.locator('.form-actions').evaluate(el=>getComputedStyle(el).position),'static','Actions do not cover focused fields');
    }
    await page.locator('#search-gyro-onion').fill('томаты');
    await page.locator('#options-gyro-onion .suggestion').tap();assert.equal(await page.locator('#search-gyro-onion').inputValue(),'Помидоры');
    await page.reload();await editIfCard(page);await page.evaluate(()=>{document.activeElement.blur();window.scrollTo(0,0);});
    assert.equal(await page.locator('.form-actions').evaluate(el=>getComputedStyle(el).position),'sticky');
    assert.match(await page.locator('#mobile-summary').innerText(),/Известная часть.*неполно/s);
    const bar=await page.locator('.form-actions').boundingBox();
    assert(bar.y>=0 && bar.y+bar.height<=844,'Compact total and add action stay inside mobile viewport');
    await page.screenshot({path:'/tmp/kitchen-mobile.png'});
  },{hasTouch:true,isMobile:true,viewport:{width:390,height:844}});
  await test('Initial quota failure reports in-memory status rather than saved',async(page,context)=>{
    await page.evaluate(()=>localStorage.clear());
    await context.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('Quota exceeded','QuotaExceededError');};});
    await page.reload();await editIfCard(page);assert.match(await page.locator('#message').innerText(),/не разрешил сохранение/i);
    assert.match(await page.locator('#save-state').innerText(),/В памяти/);
  });
  await test('Unavailable localStorage reports error and still permits export',async(page,context)=>{
    await context.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Blocked','SecurityError');}});});
    await page.reload();await editIfCard(page);assert.match(await page.locator('#message').innerText(),/Не удалось прочитать/);
    assert.equal(await page.locator('[data-open]').count(),0);
    const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadPromise;assert((await fs.stat(await download.path())).size>40);
  });
  await browser.close();
  console.log(`Browser checks: ${passed} passed, ${failed} failed.`);
  if(failed) process.exitCode=1;
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1;});
