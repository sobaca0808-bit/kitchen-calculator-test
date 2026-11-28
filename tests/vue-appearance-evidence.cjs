'use strict';
const {chromium}=require('playwright');
const {start}=require('./helpers/pwa-server');
const fs=require('node:fs/promises'), path=require('node:path'), assert=require('node:assert/strict');
async function run(){
  const [oldRoot,newRoot,output]=process.argv.slice(2);
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  try{
    for(const [label,root] of [['pr44',oldRoot],['vue',newRoot]]){
      const version=JSON.parse(await fs.readFile(path.join(root,'pwa-version.json'),'utf8'));
      const server=await start([root],{mount:version.manifest_id});
      try{
        for(const width of [390,1440]){
          const context=await browser.newContext({viewport:{width,height:900},hasTouch:width===390,isMobile:width===390});
          const page=await context.newPage(),errors=[];
          page.on('pageerror',e=>errors.push(e.message));
          await page.goto(server.url);
          const presentation=page.locator('#sintez-presentation');
          await presentation.locator('[data-intro-skip]').waitFor();
          for(let i=0;i<4;i++){
            assert.equal(await presentation.locator('[data-intro-count]').innerText(),(i+1)+' / 4');
            await presentation.locator('[data-intro-next]').click();
          }
          await presentation.waitFor({state:'hidden'});
          for(const theme of width===390?['graphite','sage','berry']:['graphite']){
            await page.evaluate(theme=>KitchenAppearance.select(theme),theme);
            await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
            assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
            await page.screenshot({path:path.join(output,label+'-'+width+'-'+theme+'.png')});
          }
          assert.deepEqual(errors,[]);
          await context.close();
          console.log('PASS',label,width,'first run, four slides, themes and layout');
        }
      }finally{await server.close();}
    }
  }finally{await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1});
