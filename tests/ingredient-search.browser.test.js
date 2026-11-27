'use strict';
// Synthetic data in disposable profiles only. --benchmark also runs on the old
// runtime, so before/after use exactly the same events, fixtures and timing.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {chromium}=require('playwright');
const {start}=require('./helpers/runtime-server');
const fixture=require('./helpers/unified-fixture');
const Storage=require('../js/storage');
const root=process.env.INGREDIENT_SEARCH_RUNTIME_ROOT;
if(!root)throw Error('Set INGREDIENT_SEARCH_RUNTIME_ROOT to an isolated packaged runtime.');
const identity=require(require('node:path').resolve(root,'pwa-version.json'));
const keys={book:identity.storage_names.book,seen:identity.presentation_key};
const benchmark=process.argv.includes('--benchmark');
const row=(id,refId)=>({id,refId,quantity:100,unit:'g',lossPercent:null,outputGrams:null,note:''});
const prep=(id,name,refId)=>({id,name,type:'prep',actualYield:100,technology:'',note:'',ingredients:[row(id+'-row',refId)]});
function searchFixture(){
  const data=fixture();
  data.products[0].aliases='Арборио крупа';
  data.recipes.push(prep('base','Основа','rice'),prep('parent','Родитель','base'),prep('grandparent','Предок','parent'),prep('safe','Безопасная заготовка','onion'));
  return data;
}
function largeFixture(count){
  const data=fixture();
  data.products=Array.from({length:count/2},(_,i)=>({id:'p'+i,name:'Продукт '+String(i).padStart(5,'0'),aliases:'',price:100+i%10,packQuantity:1,unit:'kg',massPerPiece:null,gramsPerMl:null,note:''}));
  data.recipes=Array.from({length:count},(_,i)=>({id:'r'+i,type:i<count/2?'prep':'dish',name:(i<count/2?'Заготовка ':'Блюдо ')+String(i).padStart(5,'0'),portions:1,actualYield:1000,...(i>=count/2?{sellingPrice:300,includeEstablishmentExpenses:true}:{}),note:'',ingredients:Array.from({length:10},(_,k)=>row('row'+i+'-'+k,i&&k===0?'r0':'p'+((i+k)%data.products.length)))}));
  return data;
}
async function seed(context,url,data){
  Storage.validate(data);
  const page=await context.newPage();
  await page.route('**/__search_fixture__',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Synthetic search fixture</title>'}));
  await page.goto(new URL('__search_fixture__',url).href);
  await page.evaluate(({data,keys})=>{
    localStorage.setItem(keys.book,JSON.stringify(data));localStorage.setItem(keys.seen,'1');
    localStorage.setItem('kitchen-calculator-v1','PROTECTED production marker');
  },{data,keys});
  await page.close();
}
async function ready(page){await page.waitForFunction(()=>!!window.KitchenUnifiedUI);await page.evaluate(()=>document.fonts.ready);}
async function edit(page,id,type='recipes'){
  await page.evaluate(({id,type})=>{KitchenUnifiedUI.open(type,{focus:false});document.querySelector('[data-open="'+id+'"]').click();if(type==='recipes')document.querySelector('#edit-recipe').click();},{id,type});
}
async function choices(page,term){
  await page.locator('.ingredient-search').first().fill(term);
  return page.locator('.suggestions').first().locator('.suggestion').allTextContents();
}
async function functional(browser,url){
  let passed=0;
  for(const width of [1440,390])for(const mode of ['home','chef','business']){
    const context=await browser.newContext({viewport:{width,height:900},isMobile:width<768,hasTouch:width<768});
    const errors=[];context.on('page',p=>{p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());});
    try{
      const data=searchFixture();await seed(context,url,data);
      const page=await context.newPage();await page.goto(url+'?mode='+mode+'&tool=recipes');await ready(page);
      await edit(page,'bowl');
      assert.deepEqual(await choices(page,'  аРбОрИо  '),['Рис арбориоПродукт']);
      assert.deepEqual(await choices(page,'грибная'),['Грибная основаПолуфабрикат · готовая масса']);
      assert.deepEqual(await choices(page,'такого нет'),[]);
      const all=await choices(page,'');
      assert.deepEqual(all,[...data.products.map(p=>p.name+'Продукт'),...data.recipes.filter(r=>r.type==='prep').map(r=>r.name+'Полуфабрикат · готовая масса')]);
      await page.evaluate(()=>{const original=KitchenCalc.wouldCreateCycle;KitchenCalc.wouldCreateCycle=function(...args){window.__searchCycleCalls++;return original.apply(this,args);};});
      for(const [term,calls] of [['нет совпадений',0],['арборио',0],['грибная',1]]){
        await page.evaluate(term=>{window.__searchCycleCalls=0;const el=document.querySelector('.ingredient-search');el.value=term;el.dispatchEvent(new Event('input',{bubbles:true}));},term);
        assert.equal(await page.evaluate(()=>window.__searchCycleCalls),calls);
      }
      await choices(page,'арборио');
      await page.locator('.ingredient-search').first().press('ArrowDown');
      await page.locator('.ingredient-search').first().press('Enter');
      assert.equal(await page.locator('.ingredient-search').first().inputValue(),'Рис арборио');
      assert.equal(await page.locator('[id^="qty-"]').first().evaluate(el=>el===document.activeElement),true);
      await page.locator('#save-item').click();
      await page.waitForFunction(()=>document.querySelector('#save-item').textContent.includes('Сохранено ✓'));
      const cost=await page.evaluate(()=>KitchenCalc.calcRecipe(KitchenStorage.load().data,'bowl'));
      assert.equal(cost.complete,true);
      assert(Math.abs(cost.knownCost-65.2)<1e-8);
      await edit(page,'base','prep');
      const safe=await choices(page,'');
      assert(!safe.some(x=>/Основа|Родитель|Предок/.test(x)));
      assert(safe.some(x=>x.startsWith('Безопасная заготовка')));
      assert.deepEqual(await choices(page,'предок'),[]);
      // Choosing a valid product and editing another preparation must retain
      // indirect-cycle exclusion, including while the editor is unsaved.
      await choices(page,'арборио');
      await page.locator('.suggestions').first().locator('.suggestion').click();
      await page.locator('#save-item').click();
      await page.waitForFunction(()=>document.querySelector('#save-item').textContent.includes('Сохранено ✓'));
      await edit(page,'parent','prep');
      assert.deepEqual(await choices(page,'предок'),[]);
      await choices(page,'арборио');
      await page.locator('.suggestions').first().locator('.suggestion').click();
      assert((await choices(page,'основа')).some(x=>x.startsWith('Основа')));
      assert.deepEqual(await choices(page,'предок'),[]);
      const saved=await page.evaluate(()=>KitchenStorage.load().data);
      assert.equal(saved.recipes.find(r=>r.id==='parent').ingredients[0].refId,'base');
      assert.deepEqual(saved.products,Storage.validate(data).products);
      assert.deepEqual(saved.establishmentExpenses,data.establishmentExpenses);
      assert.equal(saved.recipes.find(r=>r.id==='risotto').sellingPrice,420);
      assert.equal(saved.recipes.find(r=>r.id==='bowl').sellingPrice,300);
      assert.deepEqual(saved.recipes.find(r=>r.id==='risotto').packaging,data.recipes.find(r=>r.id==='risotto').packaging);
      assert.equal(await page.evaluate(()=>localStorage.getItem('kitchen-calculator-v1')),'PROTECTED production marker');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
      assert.deepEqual(errors,[]);passed++;
      console.log('PASS ingredient search: aliases, keyboard, empty query, cycles, live draft, save and cost at '+width+' '+mode);
    }finally{await context.close();}
  }
  return {passed,physicalDevicesTested:false};
}
async function measurements(browser,url){
  const rows=[];
  for(const cpu of [1,4])for(const count of [100,500,2000]){
    const context=await browser.newContext({viewport:{width:cpu===1?1440:390,height:1000},isMobile:cpu===4,hasTouch:cpu===4});
    try{
      await seed(context,url,largeFixture(count));const page=await context.newPage();
      page.on('dialog',d=>d.accept());const cdp=await context.newCDPSession(page);
      if(cpu!==1)await cdp.send('Emulation.setCPUThrottlingRate',{rate:cpu});
      await page.goto(url+'?mode=business&tool=recipes');await ready(page);await edit(page,'r'+count/2);
      await page.evaluate(()=>{const original=KitchenCalc.wouldCreateCycle;KitchenCalc.wouldCreateCycle=function(...args){window.__searchCycleCalls++;return original.apply(this,args);};});
      for(const term of ['НетСовпадения','Продукт 00000','Заготовка 00000']){
        const samples=[];
        for(let i=0;i<6;i++){
          const result=await page.evaluate(async term=>{
            const input=document.querySelector('.ingredient-search');window.__searchCycleCalls=0;
            const begin=performance.now();input.value=term;input.dispatchEvent(new Event('input',{bubbles:true}));
            await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
            return {ms:performance.now()-begin,cycleCalls:window.__searchCycleCalls,matches:document.querySelector('.suggestions').querySelectorAll('.suggestion').length};
          },term);
          if(i)samples.push(result);
          // Let the existing 400ms draft debounce finish outside measured input.
          await page.waitForTimeout(500);
        }
        const sorted=samples.map(s=>s.ms).sort((a,b)=>a-b);
        const result={recipes:count,cpuSlowdown:cpu,viewport:cpu===1?1440:390,term,medianMs:+sorted[2].toFixed(1),samples};
        rows.push(result);console.log(JSON.stringify({...result,samples:undefined,cycleCalls:samples.map(s=>s.cycleCalls),matches:samples.map(s=>s.matches)}));
      }
    }finally{await context.close();}
  }
  return {browser:await browser.version(),environment:'loopback; desktop Chromium; CPU4x is emulation, not physical Android',repetitions:5,rows};
}
(async()=>{
  const server=await start(root,{home:true});let browser;
  try{
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
    const result=await (benchmark?measurements:functional)(browser,server.url);
    if(process.env.INGREDIENT_SEARCH_REPORT)await fs.writeFile(process.env.INGREDIENT_SEARCH_REPORT,JSON.stringify(result,null,2)+'\n');
    console.log(benchmark?'Ingredient search measurements completed.':result.passed+' ingredient search scenarios passed.');
  }finally{await browser?.close();await server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
