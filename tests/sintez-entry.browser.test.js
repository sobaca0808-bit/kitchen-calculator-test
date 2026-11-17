'use strict';
// Public entry vs the existing installed start. Disposable profiles/data only.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {chromium}=require('playwright'),{start}=require('./helpers/runtime-server'),{guard}=require('./helpers/release-storage-guard'),fixture=require('./helpers/design-fixture');
const keys=JSON.parse(process.env.KITCHEN_SINTEZ_KEYS||'{}');
const seen=process.env.KITCHEN_INTRO_SEEN_KEY||'kitchen-calculator-sintez-presentation-seen-v1';
const output=process.env.KITCHEN_ENTRY_ARTIFACTS||path.join(os.tmpdir(),'sintez-entry-proof');
let browser,server,url;const results=[];
const intro=p=>p.locator('#sintez-presentation'),title=p=>p.locator('.sx-intro-slide.is-active h2');
async function hidden(p){await p.waitForFunction(()=>!document.querySelector('#sintez-presentation').open&&!history.state?.sintezPresentationV1);}
async function test(name,action,{width=1366,records={},query='presentation.html',init,readOnly=[]}={}){
  const context=await browser.newContext({viewport:{width,height:width<768?844:900},isMobile:width<768,hasTouch:width<768});
  try{
    const seed=await context.newPage(),target=new URL('__entry_fixture__',url).href;
    await seed.route(target,r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Synthetic entry fixture</title>'}));await seed.goto(target);
    await seed.evaluate(records=>{for(const [key,value] of Object.entries(records))localStorage.setItem(key,value);},records);await seed.close();
    const violations=[];await guard(context,{...keys,extraLocal:[seen],readOnly},violations);
    if(init)await context.addInitScript(init);
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url+query);await page.waitForFunction(()=>!!window.KitchenNavigation);
    await action(page,context);
    assert.deepEqual(errors,[]);assert.deepEqual(violations,[],'foreign database access');
    for(const [key,value] of Object.entries(records))assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),value,'original data kept: '+key);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page horizontal overflow');
    results.push({name,passed:true});console.log('PASS ENTRY:',name);
  }finally{await context.close();}
}
(async()=>{
  await fs.mkdir(output,{recursive:true});
  if(process.env.KITCHEN_ENTRY_URL){url=process.env.KITCHEN_ENTRY_URL;assert.equal(url,'https://sobaca0808-bit.github.io/kitchen-calculator-test/sintez-release/');}
  else {server=await start(process.env.KITCHEN_SINTEZ_RUNTIME_ROOT||path.resolve(__dirname,'..'),{home:true});url=server.url;}
  assert(keys.book&&keys.drafts&&keys.photos,'Pass the exact packaged namespaces');
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  for(const width of [1366,390,320])for(const populated of [false,true])await test('public first slide, program, repeated visit and reload at '+width+(populated?' with saved data':' without data'),async page=>{
    assert(await intro(page).isVisible());assert.equal(await title(page).textContent(),'СИНТЕЗ МЕРЫ');
    assert(await page.locator('[data-intro-install]').isHidden());
    if(populated&&width!==320)await page.screenshot({path:path.join(output,'public-first-'+width+'.png')});
    await page.keyboard.press('End');assert.equal(await title(page).textContent(),'Для бизнеса');
    assert.equal(await page.locator('[data-intro-install]').textContent(),'Установить приложение');assert.match(await page.locator('[data-intro-next]').textContent(),/Открыть программу/);
    for(const button of await page.locator('#sintez-presentation button:visible').all()){const b=await button.boundingBox();assert(b.width>=44&&b.height>=44);}
    if(populated&&width!==320)await page.screenshot({path:path.join(output,'public-final-'+width+'.png')});
    await page.locator('[data-intro-next]').click();await hidden(page);assert(await page.locator('#sintez-home').isVisible());assert.equal(await page.locator('.sintez-grid button').count(),6);
    await page.goto(url+'presentation.html');assert(await intro(page).isVisible());assert.equal(await title(page).textContent(),'СИНТЕЗ МЕРЫ');
    await page.keyboard.press('End');await page.reload();assert.equal(await title(page).textContent(),'СИНТЕЗ МЕРЫ');
    await page.locator('[data-intro-skip]').click();await hidden(page);
  },{width,records:populated?{[keys.book]:JSON.stringify(fixture()),[keys.appearance]:'sage',[keys.drafts]:'{"version":1,"items":[]}'}:{}});
  for(const section of ['dish','prep','products','packaging','expenses','settings'])await test('explicit work link wins over public presentation: '+section,async page=>{
    assert(await intro(page).isHidden());
    if(section==='settings')assert(await page.locator('#sintez-settings').isVisible());else assert.equal(await page.locator('.workspace').getAttribute('data-section'),section);
  },{query:'?presentation=1&section='+section});
  await test('diagnostics still bypass public entry',async page=>{assert(await intro(page).isHidden());assert.equal(await page.evaluate(()=>location.hash),'#storage-diagnostics');},{query:'?presentation=1#storage-diagnostics',readOnly:['kitchen-calculator-preview-v1','kitchen-calculator-preview-drafts-v1','kitchen-calculator-pr2-browser-test-v1','kitchen-calculator-pr2-browser-drafts-v1','kitchen-calculator-v1','kitchen-calculator-drafts-v1']});
  await test('installed start URL needs neither saved data nor seen flag; explicit public link is separate',async page=>{
    assert(await intro(page).isHidden());assert(await page.locator('#sintez-home').isVisible());assert.equal(await page.evaluate(k=>localStorage.getItem(k),seen),null);
    await page.goto(url+'presentation.html');assert(await intro(page).isVisible());assert.equal(await title(page).textContent(),'СИНТЕЗ МЕРЫ');
  },{query:'?source=pwa'});
  await test('explicit public entry works with unreadable storage',async page=>{
    assert(await intro(page).isVisible());assert.equal(await title(page).textContent(),'СИНТЕЗ МЕРЫ');await page.locator('[data-intro-skip]').click();await hidden(page);assert(await page.locator('#sintez-home').isVisible());
  },{init:()=>{Storage.prototype.getItem=function(){throw new DOMException('Read denied','SecurityError');};}});
  await test('unsupported install has Android/Windows/iOS instructions, no success and safe Escape',async page=>{
    await page.keyboard.press('End');await page.locator('[data-intro-install]').click();
    assert(await page.locator('[data-intro-install-help]').isVisible());assert.match(await page.locator('[data-intro-install-status]').textContent(),/установка не подтверждена/);
    for(const text of ['Android','Chrome или Microsoft Edge','iPhone или iPad'])assert(await page.locator('[data-intro-install-help] summary').filter({hasText:text}).count());
    if(!await page.locator('link[rel=manifest]').count()){
      assert(await page.locator('[data-intro-existing-pwa]').isVisible());assert(await page.locator('[data-intro-device-help]').isHidden());
      assert.equal(await page.locator('[data-intro-existing-pwa] a').getAttribute('href'),'pwa/');
    }
    await page.screenshot({path:path.join(output,'install-instructions-mobile.png')});
    await page.keyboard.press('Escape');assert(await intro(page).isVisible());assert(await page.locator('[data-intro-install-help]').isHidden());assert.equal(await title(page).textContent(),'Для бизнеса');
    await page.keyboard.press('Escape');await hidden(page);assert(await page.locator('#sintez-home').isVisible());
  },{width:390,init:()=>window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();e.stopImmediatePropagation();})});
  await test('public Back closes and Forward reopens slide one without changing data',async page=>{
    await page.keyboard.press('End');await page.locator('[data-intro-install]').click();await page.goBack();await hidden(page);assert(await page.locator('#sintez-home').isVisible());
    await page.goForward();assert(await intro(page).isVisible());assert.equal(await title(page).textContent(),'СИНТЕЗ МЕРЫ');assert(await page.locator('[data-intro-install-help]').isHidden());
  },{records:{[keys.book]:JSON.stringify(fixture())}});
  await test('public replay returns to Settings; default launch with data remains a work entry',async page=>{
    assert(await intro(page).isHidden());await page.locator('[data-sintez-route=settings]').click();await page.locator('#sintez-presentation-replay').click();assert(await intro(page).isVisible());
    await page.locator('[data-intro-skip]').click();await hidden(page);assert(await page.locator('#sintez-settings').isVisible());
  },{query:'',records:{[keys.book]:JSON.stringify(fixture())}});
  if(await fs.stat(path.join(process.env.KITCHEN_SINTEZ_RUNTIME_ROOT||'.','manifest.webmanifest')).then(()=>true).catch(()=>!!process.env.KITCHEN_ENTRY_URL)){
    await test('prompt bridge invokes the existing client once; dismissed prompt is never reported as installed (synthetic prompt contract)',async page=>{
      await page.evaluate(()=>{window.promptCalls=0;const event=new Event('beforeinstallprompt',{cancelable:true});event.prompt=async()=>{window.promptCalls++;};event.userChoice=Promise.resolve({outcome:'dismissed',platform:'web'});window.dispatchEvent(event);});
      await page.keyboard.press('End');await page.locator('[data-intro-install]').click();assert.equal(await page.evaluate(()=>window.promptCalls),1);
      assert.match(await page.locator('[data-intro-install-status]').textContent(),/Запрошено системное окно/);assert.doesNotMatch(await page.locator('[data-intro-install-status]').textContent(),/Браузер подтвердил/);
      await page.locator('[data-intro-install-close]').click();await page.locator('[data-intro-install]').click();assert.equal(await page.evaluate(()=>window.promptCalls),1);
      assert.match(await page.locator('[data-intro-install-status]').textContent(),/установка не подтверждена/);
    });
  }
  await fs.writeFile(path.join(output,'entry-proof.json'),JSON.stringify({url,publicURL:url+'presentation.html',passed:results.length,physicalAndroidTested:false,syntheticPromptIsNotNativeInstallationProof:true,scenarios:results},null,2)+'\n');
  console.log(results.length+' ENTRY scenarios passed; 0 failures.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();await server?.close();});
