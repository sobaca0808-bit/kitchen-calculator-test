'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const fixture=require('./helpers/unified-fixture');
const {start}=require('./helpers/pwa-server');

async function main() {
  const [root,out]=process.argv.slice(2);
  const version=JSON.parse(await fs.readFile(path.join(root,'pwa-version.json')));
  const server=await start([root],{mount:version.manifest_id});
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  const result={source:version.source_commit,checks:[]};
  try{
    for(const width of [1440,390]){
      const context=await browser.newContext({viewport:{width,height:900},hasTouch:width===390,isMobile:width===390,serviceWorkers:'block'});
      const page=await context.newPage(), errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.goto(server.mainURL);
      await page.evaluate(({data,version})=>{
        const example=data.recipes.find(r=>r.id==='risotto');
        for(let i=data.recipes.length;i<10000;i++)data.recipes.push({id:'row'+i,type:'dish',name:example.name+' '+i,ingredients:[],portions:1});
        localStorage.setItem(version.storage_names.book,JSON.stringify(data));
        localStorage.setItem(version.presentation_key,'seen');
      },{data:fixture(),version});
      await page.goto(server.url+'?mode=business&tool=recipes');
      await page.locator('#library-list').focus();
      await page.keyboard.press('End');
      await page.waitForFunction(()=>document.activeElement?.dataset?.open==='row9999');
      await page.keyboard.press('Enter');
      await page.waitForFunction(()=>document.querySelector('#recipe-card h1')?.textContent?.endsWith('9999'));
      await page.keyboard.press('Home');
      await page.waitForFunction(()=>document.activeElement?.dataset?.open==='risotto');
      const cdp=await context.newCDPSession(page);
      const heap=[], durations=[];
      const begin=Date.now();
      for(let block=0;block<=10;block++){
        if(block){
          durations.push(await page.evaluate(async()=>{
            const start=performance.now();
            for(let i=0;i<100;i++){
              const button=document.querySelector('[data-open="'+(i%2?'risotto':'bowl')+'"]');
              button.click();
              await new Promise(r=>requestAnimationFrame(r));
              const title=document.querySelector('#recipe-card h1')?.textContent;
              if(!title || !button.textContent.includes(title))throw Error('Selected recipe did not open');
            }
            return Math.round(performance.now()-start);
          }));
        }
        await cdp.send('HeapProfiler.collectGarbage');
        const memory=await cdp.send('Runtime.getHeapUsage'), dom=await cdp.send('Memory.getDOMCounters');
        heap.push({opens:block*100,jsMiB:+(memory.usedSize/1048576).toFixed(2),nodes:dom.nodes,listeners:dom.jsEventListeners});
      }
      result.checks.push({width,seconds:(Date.now()-begin)/1000,heap,durations,errors});
      assert.deepEqual(errors,[]);
      await context.close();
      console.log(width,'PASS keyboard End/open last/Home; 1000 opens',heap[0],heap.at(-1));
    }
    await fs.writeFile(out,JSON.stringify(result,null,2)+'\n');
  }finally{await browser.close();await server.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
