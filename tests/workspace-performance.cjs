'use strict';
const {chromium}=require('playwright');
const {start}=require('./helpers/runtime-server');
const fixture=require('./helpers/unified-fixture');
const fs=require('node:fs/promises');

async function run(){
  const server=await start(process.argv[2],{home:true});
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  const result=[];
  try {
    for(const width of [1440,390]){
      const context=await browser.newContext({viewport:{width,height:900},isMobile:width===390,hasTouch:width===390});
      const data=fixture();
      for(let i=0;i<600;i++){
        data.recipes.push({id:'large'+i,type:i<300?'prep':'dish',name:'Запись '+i+' · Длинное название рецепта для проверки прокрутки',portions:1,actualYield:1000,
          ingredients:Array.from({length:10},(_,k)=>({id:'row'+i+'-'+k,refId:k%2?'rice':'onion',quantity:100,unit:'g',lossPercent:null,outputGrams:null,note:''}))});
      }
      await context.addInitScript(data=>{
        if(localStorage.getItem('kitchen-calculator-expenses-preview-v1')===null)localStorage.setItem('kitchen-calculator-expenses-preview-v1',JSON.stringify(data));
        localStorage.setItem('kitchen-calculator-expenses-presentation-seen-v1','seen');
      },data);
      const page=await context.newPage();
      await page.goto(server.url+'?mode=business&tool=recipes');
      await page.waitForFunction(()=>window.KitchenUnifiedUI);
      const cdp=await context.newCDPSession(page);
      await cdp.send('Performance.enable');
      if(width===390)await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
      const report=await page.evaluate(async()=>{
        const out={};const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
        const durations=[];
        const observer=new PerformanceObserver(list=>durations.push(...list.getEntries().map(x=>x.duration)));
        observer.observe({type:'longtask'});
        async function measure(name,fn,n=7){
          const results=[];
          for(let i=0;i<n;i++){
            await frame();const begin=performance.now();fn(i);const sync=performance.now()-begin;
            await frame();await frame();results.push({sync,paint:performance.now()-begin});
          }
          const median=k=>results.map(x=>x[k]).sort((a,b)=>a-b)[Math.floor(n/2)];
          out[name]={syncMs:+median('sync').toFixed(1),settledMs:+median('paint').toFixed(1)};
        }
        await measure('openPreparations',()=>{KitchenUnifiedUI.open('recipes',{focus:false});KitchenUnifiedUI.open('prep',{focus:false});});
        KitchenUnifiedUI.open('recipes',{focus:false});
        await measure('filterRecipes',i=>{const input=document.querySelector('#library-search');input.value=i%2?'запись 5':'';input.dispatchEvent(new Event('input',{bubbles:true}));});
        await measure('openRecipe',()=>document.querySelector('#library-list [data-open]').click());
        const initial=performance.now();let last=initial;const gaps=[];
        const list=document.querySelector('#library-list');
        for(let i=0;i<40;i++){const now=await frame();gaps.push(now-last);last=now;list.scrollTop+=32;}
        out.scroll={maxFrameMs:+Math.max(...gaps).toFixed(1),framesOver32ms:gaps.filter(t=>t>32).length};
        observer.disconnect();out.longTasks=durations.length;out.maxLongTaskMs=Math.max(0,...durations);
        return out;
      });
      const metrics=(await cdp.send('Performance.getMetrics')).metrics;
      result.push({width,cpu:width===390?4:1,...report,nodes:metrics.find(x=>x.name==='Nodes')?.value});
      await context.close();
    }
    console.log(JSON.stringify(result,null,2));
    if(process.env.PERF_REPORT)await fs.writeFile(process.env.PERF_REPORT,JSON.stringify(result,null,2)+'\n');
  }finally{await browser.close();await server.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
