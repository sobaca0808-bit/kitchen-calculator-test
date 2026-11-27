'use strict';

// Benchmark an unmodified, packaged calculator. Each cell owns a fresh profile;
// setup, CDP heap collections and IPC are outside action/frame timing.
const {chromium}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {start}=require('./helpers/pwa-server');
const fixture=require('./helpers/unified-fixture');

function dataset(count){
  const data=fixture();
  for(let index=data.recipes.length;index<count;index++){
    data.recipes.push({id:'recipe'+index,name:'Рецепт '+String(index).padStart(5,'0'),
      type:index%4?'dish':'prep',actualYield:250,ingredients:[
        {id:'component'+index,refId:index%3?'rice':'stock',quantity:100,unit:'g'}]});
  }
  return data;
}

async function measurePage(){
  const $=selector=>document.querySelector(selector);
  const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  const time=()=>performance.now();
  const round=value=>Number(value.toFixed(1));
  const results={actions:{}};
  async function measure(name,fn,check=()=>true,n=3){
    const samples=[];
    for(let i=0;i<n;i++){
      await frame();
      const start=time(); await fn(i);
      const syncMs=time()-start;
      // Two rAFs bracket a paint opportunity even for microtask-batched Vue writes.
      await frame();await frame();
      if(!check(i))throw Error('Benchmark action did not apply: '+name);
      samples.push({handlerMs:round(syncMs),settledMs:round(time()-start)});
    }
    const median=k=>samples.map(x=>x[k]).sort((a,b)=>a-b)[Math.floor(samples.length/2)];
    results.actions[name]={handlerMs:median('handlerMs'),settledMs:median('settledMs'),samples};
  }
  function query(value){
    const input=$('#library-search');input.value=value;
    input.dispatchEvent(new Event('input',{bubbles:true}));
  }
  const open=tool=>window.KitchenUnifiedUI.open(tool,{focus:false});
  const button=id=>document.querySelector('[data-open="'+id+'"]');
  await measure('search',i=>query(i%2?'Рецепт 00':'Рецепт 0001'),()=>!!$('#library-list [data-open]'));
  query('');await frame();await frame();
  await measure('filterFolder',i=>{
    const select=$('#folder-filter');
    if(!select)throw Error('Folder filter control missing');
    select.value=i%2?'all':'folder:italy';select.dispatchEvent(new Event('change',{bubbles:true}));
  },i=>!!button('risotto')&&(i%2||!button('bowl')));
  if($('#folder-filter').value!=='all'){
    const filter=$('#folder-filter');filter.value='all';filter.dispatchEvent(new Event('change',{bubbles:true}));
    await frame();await frame();
  }
  await measure('openCard',i=>button(i%2?'bowl':'risotto').click(),()=>!!$('#recipe-card'));
  await measure('switchPrep',()=>{open('recipes');open('prep');},()=>$('.workspace').dataset.section==='prep');
  open('recipes');await frame();await frame();button('risotto').click();
  await frame();await frame();
  $('#edit-recipe').click();
  await measure('editIngredient',i=>{
    const field=$('#qty-r-rice');field.value=String(325+i);field.dispatchEvent(new Event('input',{bubbles:true}));
  },()=>!!$('#summary')&&!$('#qty-r-rice').hasAttribute('aria-invalid'));
  await measure('save',()=>$('#save-item').click(),()=>$('#save-item').classList.contains('saved'),1);
  $('#view-recipe').click();await frame();await frame();
  if($('#back-list'))$('#back-list').click();
  open('recipes');await frame();await frame();
  const list=$('#library-list');const max=list.scrollHeight-list.clientHeight;
  if(max<=0)throw Error('No scrollable results');
  const gaps=[];let previous=await frame();
  for(let step=1;step<=90;step++){
    list.scrollTop=Math.min(max,step*64);
    const now=await frame();gaps.push(now-previous);previous=now;
  }
  if(!list.scrollTop)throw Error('Scroll did not advance');
  list.scrollTop=0;await frame();await frame();
  const sorted=gaps.toSorted((a,b)=>a-b),p95=sorted[Math.ceil(sorted.length*.95)-1];
  results.scroll={frames:gaps.length,gapsMs:gaps.map(round),p95Ms:round(p95),maxMs:round(sorted.at(-1)),
    framesOver32:gaps.filter(n=>n>32).length,fps:round(1000*gaps.length/gaps.reduce((a,b)=>a+b)),distancePx:Math.min(max,90*64)};
  results.liveRows=list.querySelectorAll('[data-open]').length;
  return results;
}

async function repeatedOpens(amount){
  const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));const elapsed=[];
  for(let i=0;i<amount;i++){
    const button=document.querySelector('[data-open="'+(i%2?'bowl':'risotto')+'"]');
    if(!button)throw Error('Expected first two records on screen');
    const start=performance.now();button.click();await frame();await frame();
    elapsed.push(Number((performance.now()-start).toFixed(1)));
  }
  return elapsed;
}

async function cell(browser,server,version,width,size){
  const cold=await browser.newContext({viewport:{width,height:900},hasTouch:width===390,isMobile:width===390,serviceWorkers:'block'});
  const page=await cold.newPage();
  try{
    const cdp=await cold.newCDPSession(page);const cpu=width===390?4:1;
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:cpu});
    await cdp.send('Performance.enable');
    page.on('dialog',d=>d.accept());
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(server.mainURL);
    await page.evaluate(({data,version})=>{
      localStorage.setItem(version.storage_names.book,JSON.stringify(data));localStorage.setItem(version.presentation_key,'seen');
    },{data:dataset(size),version});
    await page.addInitScript(()=>{
      const tasks=[];globalThis.measuredLongTasks=tasks;
      new PerformanceObserver(list=>tasks.push(...list.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:true});
    });
    await page.goto(server.url+'?mode=business&tool=recipes',{timeout:180000,waitUntil:'domcontentloaded'});
    await page.waitForSelector('[data-open="risotto"]',{state:'visible',timeout:120000});
    const load=await page.evaluate(async()=>{
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      return Number(performance.now().toFixed(1));
    });
    const result=await page.evaluate(measurePage);
    async function sampleHeap(){
      await cdp.send('HeapProfiler.collectGarbage');
      const metrics=await cdp.send('Runtime.getHeapUsage');
      const dom=await cdp.send('Memory.getDOMCounters');
      return {heapMiB:Number((metrics.usedSize/1048576).toFixed(2)),nodes:dom.nodes,listeners:dom.jsEventListeners};
    }
    const heap=[];
    const settled=[];
    await page.evaluate(repeatedOpens,2); // align card & observer state before taking first sample
    for(let block=0;block<=3;block++){
      if(block)settled.push(...await page.evaluate(repeatedOpens,10));
      heap.push({opens:block*10,...await sampleHeap()});
    }
    const tasks=await page.evaluate(()=>globalThis.measuredLongTasks.slice());
    await page.reload({waitUntil:'domcontentloaded',timeout:180000});
    await page.waitForFunction(()=>!!window.KitchenStorage);
    const saved=await page.evaluate(()=>{const data=KitchenStorage.snapshot().data;return {count:data.recipes.length,quantity:data.recipes.find(r=>r.id==='risotto').ingredients[0].quantity};});
    assert.deepEqual(saved,{count:size,quantity:327});assert.deepEqual(errors,[]);
    return {width,cpu,size,loadMs:load,...result,heap,repeatOpenMs:settled,longTaskCount:tasks.length,maxLongTaskMs:Math.max(0,...tasks),reloadVerified:true};
  }finally{await cold.close();}
}

async function main(){
  const [root,output]=process.argv.slice(2);
  if(!output)throw Error('node tests/vue-performance.cjs PATH_TO_SITE OUTPUT_JSON');
  const version=JSON.parse(await fs.readFile(path.join(root,'pwa-version.json'),'utf8'));
  const server=await start([root],{mount:version.manifest_id});
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  try{
    const results={commit:version.source_commit,revision:version.revision,chromium:browser.version(),cells:[]};
    for(const width of (process.env.PERF_WIDTHS||'1440,390').split(',').map(Number)){
      for(const size of (process.env.PERF_SIZES||'100,600,1000,5000,10000').split(',').map(Number)){
        const result=await cell(browser,server,version,width,size);results.cells.push(result);
        await fs.writeFile(output,JSON.stringify(results,null,2)+'\n');
        console.log(width,size,'load',result.loadMs,'rows',result.liveRows,'scroll FPS',result.scroll.fps,'heap',result.heap[0].heapMiB);
      }
    }
  }finally{await browser.close();await server.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
