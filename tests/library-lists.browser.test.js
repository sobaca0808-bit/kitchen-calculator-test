/* Issue #6: isolated, local checks for the shared prep/dish library component.
 * Fixtures are fictional and every scenario uses a fresh browser context. */
'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const TEST_KEY = 'kitchen-calculator-pr2-browser-test-v1';
const PRODUCTION_KEY = 'kitchen-calculator-v1';
const SENTINEL = '{"fictional":"issue-6-production-placeholder"}';
const testURL = process.env.KITCHEN_TEST_URL;
if (!testURL) throw Error('KITCHEN_TEST_URL must point to a disposable loopback server.');
const target = new URL(testURL);
if (!['http:', 'https:'].includes(target.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) {
  throw Error('Shared-library checks may run only against a loopback server.');
}
const LONG_NAME = 'Вымышленная позиция с полным длинным названием для кухонного справочника ' + 'ДлинноеНазваниеБезПробелов'.repeat(2);
const id = (type, number) => `issue6-${type}-${String(number).padStart(3, '0')}`;
function recipe(type, number) {
  return {
    id: id(type, number), type,
    name: number === 2 ? LONG_NAME : (type === 'prep' ? 'Полуфабрикат ' : 'Блюдо ') + String(number).padStart(3, '0'),
    note: '', technology: 'Вымышленный шаг приготовления.',
    actualYield: type === 'prep' ? 800 : null,
    ingredients: [{id: id(type, number) + '-row', refId: 'issue6-raw', quantity: type === 'prep' ? 1000 : 150,
      unit:'g', lossPercent:null, outputGrams:null, note:''}]
  };
}
function fixture(type, count) {
  const other = type === 'prep' ? 'dish' : 'prep';
  return {version:1,products:[{id:'issue6-raw',name:'Вымышленное сырьё',aliases:'',price:500,packQuantity:1,unit:'kg',massPerPiece:null,gramsPerMl:null,note:''}],
    recipes:[...Array.from({length:count},(_,i)=>recipe(type,i+1)),recipe(other,1)]};
}
const stored = page => page.evaluate(key=>JSON.parse(localStorage.getItem(key)),TEST_KEY);
const row = (page,type,number)=>page.locator(`[data-open="${id(type,number)}"]`);
async function guard(page) {
  assert.equal(await page.evaluate(()=>KitchenStorage.KEY),TEST_KEY);
  assert.match(await page.locator('.test-notice').innerText(),/ТЕСТ/);
}
async function isolation(page, expectSentinel = true) {
  const proof = await page.evaluate(key=>({ops:window.__issue6StorageOps.slice(),sentinel:localStorage.getItem(key)}),PRODUCTION_KEY);
  if(expectSentinel)assert.equal(proof.sentinel,SENTINEL,'Production-key placeholder is unchanged');
  assert(proof.ops.length>0 && proof.ops.every(op=>op.method!=='clear' && op.key===TEST_KEY),'Only the preview namespace is used');
}
async function expectedView(page,type,name) {
  if(type==='dish') {
    assert.equal(await page.locator('#item-name').count(),0,'A saved dish opens in read mode');
    assert.equal(await page.locator('#recipe-card h1').innerText(),name);
  } else {
    assert.equal(await page.locator('#item-name').inputValue(),name,'A prep keeps its existing editor behavior');
    assert.equal(await page.locator('#recipe-card').count(),0);
  }
}
async function noOverflow(page) {
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal page overflow');
  assert(await page.locator('#library-list').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'No horizontal list overflow');
}
const dimensions = new Map();
let browser, passed=0;
const failures=[];
async function scenario(type,count,width) {
  const context=await browser.newContext({viewport:{width,height:900}});
  await context.addInitScript(()=>{
    window.__issue6StorageOps=[];
    for(const method of ['getItem','setItem','removeItem','clear']) {
      const original=Storage.prototype[method];
      Storage.prototype[method]=function(...args){window.__issue6StorageOps.push({method,key:args[0]});return original.apply(this,args);};
    }
  });
  const page=await context.newPage();page.setDefaultTimeout(7000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  try {
    await page.goto(testURL);await guard(page);await isolation(page,false);
    await page.evaluate(({key,productionKey,sentinel,data})=>{
      localStorage.setItem(productionKey,sentinel);localStorage.setItem(key,JSON.stringify(KitchenStorage.validate(data)));
    },{key:TEST_KEY,productionKey:PRODUCTION_KEY,sentinel:SENTINEL,data:fixture(type,count)});
    await page.reload();await guard(page);
    if(type==='prep')await page.locator('[data-tab="prep"]').click();
    const baseline=await stored(page);
    assert.equal(await page.locator('.workspace').getAttribute('data-section'),type);
    assert(await page.locator('.workspace').evaluate(el=>el.classList.contains('compact-library')));
    assert(await page.locator('#library-list').evaluate(el=>el.classList.contains('compact-list')));
    assert.equal(await page.locator('#library-list').getAttribute('role'),'region');
    assert.equal(await page.locator('#library-list').getAttribute('aria-labelledby'),'section-title');
    assert.equal(await page.locator('#library-list').getAttribute('tabindex'),'0');
    assert.equal(await page.locator('.library-row').count(),count);
    assert.equal(await page.locator('.product-row').count(),0);
    await expectedView(page,type,recipe(type,1).name);

    const size=await page.locator('#library-list').evaluate(el=>({height:el.getBoundingClientRect().height,clientHeight:el.clientHeight,scrollHeight:el.scrollHeight,
      overflow:getComputedStyle(el).overflowY,pageHeight:document.documentElement.scrollHeight,viewport:innerHeight}));
    assert(size.height>0 && size.height<=size.viewport*.65,'Shared list height is bounded');
    assert(['auto','scroll'].includes(size.overflow),'List owns vertical scrolling');
    if(count>=100)assert(size.scrollHeight>size.clientHeight,'Long lists scroll internally');
    dimensions.set(`${type}/${width}/${count}`,size);
    await noOverflow(page);
    const normal=await row(page,type,1).evaluate(el=>({height:el.getBoundingClientRect().height,font:parseFloat(getComputedStyle(el.querySelector('strong')).fontSize),
      left:el.querySelector('strong').getBoundingClientRect().right,right:el.querySelector('small').getBoundingClientRect().left,
      caption:el.querySelector('small').textContent}));
    assert(normal.height>=44 && normal.font>=14,'Compact rows retain readable text and touch targets');
    assert(normal.left<=normal.right,'Name and caption share horizontal columns');
    if(type==='prep')assert.match(normal.caption,/₽.*партия/,'Prep batch cost is retained');
    else assert.match(normal.caption,/Техкарта/,'Dish action caption stays compact');
    const long=await row(page,type,2).locator('strong').evaluate(el=>({text:el.textContent,height:el.clientHeight,scrollHeight:el.scrollHeight,
      overflow:getComputedStyle(el).textOverflow,whiteSpace:getComputedStyle(el).whiteSpace}));
    assert.equal(long.text,LONG_NAME);assert.notEqual(long.overflow,'ellipsis');assert.notEqual(long.whiteSpace,'nowrap');
    assert(long.scrollHeight<=long.height+1,'The complete long name stays visible');

    const contours=await page.evaluate(()=>({
      list:parseFloat(getComputedStyle(document.querySelector('#library-list')).borderTopWidth),
      editor:parseFloat(getComputedStyle(document.querySelector('.editor')).borderTopWidth),
      input:parseFloat(getComputedStyle(document.querySelector('#library-search')).borderTopWidth),
      inputColor:getComputedStyle(document.querySelector('#library-search')).borderTopColor
    }));
    assert(contours.list>=2 && contours.editor>=2 && contours.input>=2,'Field, card and list outlines are visibly thicker');
    assert(!['rgb(0, 0, 0)','rgb(255, 255, 255)','rgba(0, 0, 0, 0)'].includes(contours.inputColor),'Contours retain a gentle colored palette');
    await page.locator('#library-list').focus();await page.keyboard.press('ArrowDown');
    const focus=await page.locator('#library-list').evaluate(el=>({width:parseFloat(getComputedStyle(el).outlineWidth),style:getComputedStyle(el).outlineStyle}));
    assert(focus.width>=2 && focus.style!=='none','Keyboard focus remains visible');

    const controls=()=>page.locator('.search-label').evaluate(el=>({search:el.getBoundingClientRect().top,create:document.querySelector('#create').getBoundingClientRect().top}));
    const before=await controls();
    await page.locator('#library-list').evaluate(el=>{el.scrollTop=el.scrollHeight;});
    const end=await row(page,type,count).evaluate(el=>({scrollTop:el.parentElement.scrollTop,top:el.getBoundingClientRect().top,bottom:el.getBoundingClientRect().bottom,
      listTop:el.parentElement.getBoundingClientRect().top,listBottom:el.parentElement.getBoundingClientRect().bottom}));
    assert(end.scrollTop>0 && end.top>=end.listTop-1 && end.bottom<=end.listBottom+1,'Last row is reached through the list');
    assert.deepEqual(await controls(),before,'Internal scroll does not move search/create');
    await row(page,type,count).focus();await row(page,type,count).press('Enter');
    assert.equal(await row(page,type,count).getAttribute('aria-current'),'true');
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.open),id(type,count));
    assert(Math.abs(await page.locator('#library-list').evaluate(el=>el.scrollTop)-end.scrollTop)<=2,'Selection retains internal scroll');
    await expectedView(page,type,recipe(type,count).name);
    assert.equal(await page.locator('.library-row.active').count(),1);
    const colors=await page.evaluate(()=>({active:getComputedStyle(document.querySelector('.library-row.active')).backgroundColor,other:getComputedStyle(document.querySelector('.library-row:not(.active)')).backgroundColor}));
    assert.notEqual(colors.active,colors.other,'The active row is distinguishable');
    await row(page,type,3).focus();await row(page,type,3).press('Space');
    assert.equal(await row(page,type,3).getAttribute('aria-current'),'true');
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.open),id(type,3));

    await page.locator('#library-search').fill(recipe(type,count).name);
    assert.equal(await page.locator('.library-row').count(),1,'Search filters the existing saved titles');
    await row(page,type,count).click();await expectedView(page,type,recipe(type,count).name);
    await page.locator('#library-search').fill('');
    assert.equal(await page.locator('.library-row').count(),count);
    if(type==='dish')await page.locator('#edit-recipe').click();
    const changedName='Проверенный '+(type==='prep'?'полуфабрикат ':'рецепт ')+count;
    await page.locator('#item-name').fill(changedName);
    await page.locator('#technology').fill('Вымышленный проверенный шаг.');
    await page.locator('#save-item').click();await page.locator('#save-item').click();
    assert.equal(await page.locator('#save-item').innerText(),'Сохранено ✓');
    const saved=await stored(page);
    assert.equal(saved.recipes.length,baseline.recipes.length,'Repeat save does not duplicate a recipe');
    const changed=saved.recipes.find(item=>item.id===id(type,count));
    assert.equal(changed.name,changedName);assert.equal(changed.technology,'Вымышленный проверенный шаг.');
    assert.deepEqual(changed.ingredients,baseline.recipes.find(item=>item.id===changed.id).ingredients,'List UI does not alter recipe composition');
    assert.deepEqual(saved.products,baseline.products,'Products are unchanged');
    assert.deepEqual(saved.recipes.filter(item=>item.id!==changed.id),baseline.recipes.filter(item=>item.id!==changed.id),'Other recipes are unchanged');
    await isolation(page);
    await page.reload();await guard(page);if(type==='prep')await page.locator('[data-tab="prep"]').click();
    await row(page,type,count).click();await expectedView(page,type,changedName);
    await noOverflow(page);await isolation(page);
    if(type==='dish' && count===12 && width===1366) {
      await page.emulateMedia({media:'print'});
      assert.equal(await page.locator('.editor').evaluate(el=>getComputedStyle(el).borderTopWidth),'0px','Screen contour changes do not add a print frame');
      assert.equal(await page.locator('#recipe-card th').first().evaluate(el=>getComputedStyle(el).borderTopWidth),'1px','Printed table keeps its existing border width');
      assert.equal(await page.locator('.library').isVisible(),false);
      await page.emulateMedia({media:'screen'});
    }
    assert.deepEqual(errors,[],'No JavaScript errors');
    passed++;console.log(`PASS shared library: ${type}, ${count} records, ${width}px`);
  } catch(error) {
    failures.push({type,count,width,error:error.stack||error.message});
    console.error(`FAIL shared library: ${type}, ${count} records, ${width}px: ${error.message}`);
  } finally {await context.close();}
}
(async()=>{
  try {
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
    for(const type of ['prep','dish'])for(const width of [360,390,430,1366]) {
      for(const count of [12,100,500])await scenario(type,count,width);
      const samples=[12,100,500].map(count=>dimensions.get(`${type}/${width}/${count}`));
      if(samples.every(Boolean)) {
        assert(Math.max(...samples.map(s=>s.height))-Math.min(...samples.map(s=>s.height))<=2,'Shared list stays the same height across counts');
        assert(Math.abs(samples[1].pageHeight-samples[2].pageHeight)<=2,'Growing 100 to 500 recipes does not grow the page');
      }
    }
  }catch(error){failures.push({error:error.stack||error.message});}
  finally{if(browser)await browser.close();}
  for(const failure of failures)console.error(JSON.stringify(failure));
  console.log(`${passed}/24 shared-library browser scenarios passed; ${failures.length} failures.`);
  if(failures.length)process.exitCode=1;
})();
