'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process'),{chromium}=require('playwright');
const url='https://sobaca0808-bit.github.io/kitchen-calculator-test/sintez-release/';
let context,profile;
(async()=>{
  const output=process.env.SINTEZ_NATIVE_ARTIFACTS;await fs.mkdir(output,{recursive:true});profile=await fs.mkdtemp(path.join(os.tmpdir(),'sintez-public-installed-'));
  context=await chromium.launchPersistentContext(path.join(profile,'chrome'),{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/google-chrome',headless:false,args:['--no-sandbox'],viewport:{width:1280,height:900},env:{...process.env,XDG_DATA_HOME:path.join(profile,'data'),XDG_CONFIG_HOME:path.join(profile,'config'),XDG_CACHE_HOME:path.join(profile,'cache')}});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
  await page.waitForFunction(()=>document.querySelector('#pwa-status').textContent.includes('Готово к запуску без интернета.'));
  if(await page.locator('#sintez-presentation').isVisible()){await page.locator('[data-intro-skip]').click();await page.waitForFunction(()=>!history.state?.sintezPresentationV1);}
  await page.locator('[data-sintez-route=products]').click();await page.locator('#create').click();await page.locator('#item-name').fill('Проверка отдельной установки СИНТЕЗ');await page.locator('#price').fill('123');await page.locator('#packQuantity').fill('1');await page.locator('#save-item').click();await page.waitForFunction(()=>document.querySelector('#save-item').textContent.includes('Сохранено ✓'));
  assert.equal(await page.evaluate(()=>KitchenStorage.KEY),'kitchen-calculator-sintez-preview-v1');
  const expected=await page.evaluate(()=>localStorage.getItem(KitchenStorage.KEY));const cdp=await context.newCDPSession(page);assert.deepEqual((await cdp.send('Page.getInstallabilityErrors')).installabilityErrors,[]);
  await cdp.send('PWA.install',{manifestId:url,installUrlOrBundleUrl:url});await cdp.send('PWA.changeAppUserSettings',{manifestId:url,displayMode:'standalone'});await cdp.send('PWA.launch',{manifestId:url});
  async function find(){for(let n=0;n<150;n++){for(const p of context.pages())if(p!==page&&!p.isClosed()&&await p.evaluate(()=>matchMedia('(display-mode: standalone)').matches).catch(()=>false))return p;await new Promise(r=>setTimeout(r,100));}throw Error('Real standalone window missing');}
  let app=await find();await app.waitForLoadState();assert.equal(await app.evaluate(()=>localStorage.getItem(KitchenStorage.KEY)),expected);await app.bringToFront();execFileSync('scrot',[path.join(output,'public-installed-desktop.png')]);
  await context.setOffline(true);await app.reload();assert.equal(await app.evaluate(()=>navigator.onLine),false);assert.equal(await app.evaluate(()=>localStorage.getItem(KitchenStorage.KEY)),expected);assert(await app.evaluate(()=>matchMedia('(display-mode: standalone)').matches));await app.screenshot({path:path.join(output,'public-installed-offline.png'),fullPage:true});
  await app.close();await cdp.send('PWA.launch',{manifestId:url});app=await find();await app.waitForLoadState();assert.equal(await app.evaluate(()=>localStorage.getItem(KitchenStorage.KEY)),expected);assert(await app.evaluate(()=>matchMedia('(display-mode: standalone)').matches));assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(output,'native-live-proof.json'),JSON.stringify({url,passed:true,installedViaRealChromeBackend:true,standalone:true,offlineRelaunchPreservesData:true,manifestId:url,livePwaNotTouched:true,physicalAndroidTested:false},null,2)+'\n');
  console.log('PASS public native PWA: actual HTTPS installation, branded standalone window, offline launch and relaunch');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await context?.close();if(profile)await fs.rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});});
