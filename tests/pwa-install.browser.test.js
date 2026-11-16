'use strict';
// Real Chromium web-app installation, in a disposable graphical profile only.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{chromium}=require('playwright');
const {start}=require('./helpers/pwa-server');
const LIVE='https://sobaca0808-bit.github.io/kitchen-calculator-test/pwa/';
let context,server,profile;
async function appWindow(excluded){
 for(let tries=0;tries<150;tries++){
  for(const page of context.pages())if(page!==excluded&&!page.isClosed()){
   try{if(await page.evaluate(()=>matchMedia('(display-mode: standalone)').matches))return page;}catch(_){}
  }
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 throw Error('An installed standalone application window did not open');
}
(async()=>{
 assert(process.env.KITCHEN_PWA_HEADFUL==='1','Run the installation test in graphical Chrome under Xvfb');
 const output=process.env.KITCHEN_PWA_ARTIFACTS||path.join(os.tmpdir(),'pwa-native-proof');await fs.mkdir(output,{recursive:true});
 let url=process.env.KITCHEN_PWA_URL;
 if(url)assert([LIVE,'https://sobaca0808-bit.github.io/kitchen-calculator-test/'].includes(url));else{assert(process.env.KITCHEN_PWA_V1);server=await start([process.env.KITCHEN_PWA_V1]);url=server.url;}
 profile=await fs.mkdtemp(path.join(os.tmpdir(),'pwa-installed-profile-'));
 context=await chromium.launchPersistentContext(path.join(profile,'chrome'),{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:false,args:['--no-sandbox'],viewport:{width:1280,height:900},env:{...process.env,XDG_DATA_HOME:path.join(profile,'xdg-data'),XDG_CONFIG_HOME:path.join(profile,'xdg-config'),XDG_CACHE_HOME:path.join(profile,'xdg-cache')}});
 await context.route('**/favicon.ico',r=>r.fulfill({status:204,body:''}));
 const page=await context.newPage();await page.goto(url);await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 await page.locator('[data-tab=products]').click();await page.locator('#create').click();await page.locator('#item-name').fill('Установка PWA · тестовый продукт');await page.locator('#price').fill('123');await page.locator('#packQuantity').fill('1');await page.locator('#save-item').click();await page.waitForFunction(()=>document.querySelector('#save-item').textContent.includes('Сохранено ✓'));
 const expected=await page.evaluate(()=>localStorage.getItem(KitchenStorage.KEY)),session=await context.newCDPSession(page);
 const eligibility=await session.send('Page.getInstallabilityErrors');assert.deepEqual(eligibility.installabilityErrors,[]);
 await session.send('PWA.install',{manifestId:url,installUrlOrBundleUrl:url});const osState=await session.send('PWA.getOsAppState',{manifestId:url});
 await session.send('PWA.launch',{manifestId:url});let app=await appWindow(page);await app.waitForLoadState();assert.equal(await app.evaluate(()=>localStorage.getItem(KitchenStorage.KEY)),expected);
 await session.detach();await context.setOffline(true);await app.reload();await app.waitForFunction(()=>!!navigator.serviceWorker.controller);assert.equal(await app.evaluate(()=>navigator.onLine),false);assert.equal(await app.evaluate(()=>matchMedia('(display-mode: standalone)').matches),true);
 assert.equal(await app.evaluate(()=>KitchenStorage.load().data.products[0].price),123);await app.screenshot({path:path.join(output,'installed-standalone-offline.png'),fullPage:true});
 await app.close();const again=await context.newCDPSession(page);await again.send('PWA.launch',{manifestId:url});app=await appWindow(page);await again.detach();await context.setOffline(false);await context.setOffline(true);await app.reload();await app.waitForFunction(()=>!!navigator.serviceWorker.controller);assert.equal(await app.evaluate(()=>KitchenStorage.load().data.products[0].price),123);assert(await app.evaluate(()=>matchMedia('(display-mode: standalone)').matches));
 const shortcuts=[];try{for(const entry of await fs.readdir(path.join(profile,'xdg-data/applications')))if(entry.endsWith('.desktop'))shortcuts.push(entry);}catch(_){}
 await fs.writeFile(path.join(output,'installation-proof.json'),JSON.stringify({url,passed:true,installabilityErrors:eligibility.installabilityErrors,installedViaChromeWebAppBackend:true,standalone:true,offline:true,relaunchPreservedData:true,osState,desktopShortcuts:shortcuts,physicalAndroidTested:false},null,2)+'\n');
 console.log('PASS PWA INSTALL: actual Chrome installation, standalone launch, offline reload and relaunch with saved data');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await context?.close();await server?.close();if(profile)await fs.rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});});
