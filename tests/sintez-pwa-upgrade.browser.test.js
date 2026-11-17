'use strict';
// Old installed PWA -> new shell at the SAME identity. All profiles are disposable.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process'),{chromium}=require('playwright');
const {start}=require('./helpers/pwa-server');
const {snapshot}=require('./helpers/persistence-lifecycle');
const design=require('./helpers/design-fixture');
const oldRoot=process.env.SINTEZ_PWA_OLD,newRoot=process.env.SINTEZ_PWA_NEW,previewRoot=process.env.SINTEZ_PWA_PREVIEW,badRoot=process.env.SINTEZ_PWA_BAD,priorPreview=process.env.SINTEZ_PWA_PRIOR_PREVIEW;
const output=process.env.SINTEZ_PWA_ARTIFACTS||path.join(os.tmpdir(),'sintez-pwa-upgrade');
const headful=process.env.KITCHEN_PWA_HEADFUL==='1';
const launch={executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:!headful,args:['--no-sandbox']};
const PWA={book:'kitchen-calculator-pwa-preview-v1',drafts:'kitchen-calculator-pwa-drafts-v1',photos:'kitchen-calculator-pwa-photos-v1',backups:'kitchen-calculator-pwa-import-backups-v1',appearance:'kitchen-calculator-pwa-appearance-v1'};
let server,browser,context,profile;const results=[];
async function until(probe,label){const end=Date.now()+45000;while(Date.now()<end){if(await probe())return;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out: '+label);}
async function status(page){return page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();if(!r?.active)return null;return new Promise(resolve=>{const c=new MessageChannel(),timer=setTimeout(()=>{c.port1.close();resolve(null);},5000);c.port1.onmessage=e=>{clearTimeout(timer);c.port1.close();resolve({...e.data,waiting:!!r.waiting});};r.active.postMessage({type:'PWA_STATUS'},[c.port2]);});});}
async function ready(page){await until(async()=>(await status(page))?.ready===true,'complete active offline shell');}
async function seed(context,url){
  const page=await context.newPage(),target=new URL('__fixture__',url).href;
  await page.route(target,r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Disposable synthetic fixture</title>'}));await page.goto(target);
  await page.evaluate(async keys=>{
    const data=keys.data;data.recipes.find(r=>r.id==='pie').photoIds=['one','two'];data.recipes.find(r=>r.id==='pie').includeEstablishmentExpenses=true;
    data.establishmentExpenses={method:'planned-portions',period:'2026-11',plannedPortions:1000,rent:40000,utilities:10000,payroll:24000,other:0};
    data.futureField={preserved:'yes'};localStorage.setItem(keys.book,JSON.stringify(data));localStorage.setItem(keys.appearance,'sage');
    localStorage.setItem('kitchen-calculator-v1','PROTECTED production sentinel');localStorage.setItem('kitchen-calculator-sintez-preview-v1','PROTECTED SINTEZ sentinel');
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(keys.photos,1);r.onupgradeneeded=()=>r.result.createObjectStore('photos',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    for(const id of ['one','two']){const canvas=document.createElement('canvas');canvas.width=100;canvas.height=80;canvas.getContext('2d').fillRect(0,0,100,80);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));await new Promise((resolve,reject)=>{const tx=db.transaction('photos','readwrite');tx.objectStore('photos').put({id,blob,width:100,height:80,mime:'image/png'});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}db.close();
  },{...PWA,data:design()});await page.close();
}
async function foreign(page){assert.equal(await page.evaluate(()=>localStorage.getItem('kitchen-calculator-v1')),'PROTECTED production sentinel');assert.equal(await page.evaluate(()=>localStorage.getItem('kitchen-calculator-sintez-preview-v1')),'PROTECTED SINTEZ sentinel');}
async function newest(page,revision){await until(()=>page.evaluate(async({revision,url})=>{const r=await navigator.serviceWorker.getRegistration(url);if(r?.waiting||r?.active?.state!=='activated')return false;return new Promise(resolve=>{const c=new MessageChannel();c.port1.onmessage=e=>resolve(e.data.revision===revision);r.active.postMessage({type:'PWA_STATUS'},[c.port2]);});},{revision,url:server.url}),'expected new worker activation');}
async function update(page){await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});await until(()=>page.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration())?.waiting),'new worker waiting while old pages stay open');}
async function appWindow(context,excluded){for(let n=0;n<150;n++){for(const p of context.pages())if(p!==excluded&&!p.isClosed()&&await p.evaluate(()=>matchMedia('(display-mode: standalone)').matches).catch(()=>false))return p;await new Promise(r=>setTimeout(r,100));}throw Error('A real installed standalone window did not open');}
async function screen(file){
  if(process.platform==='win32'){
    const target=file.replace(/'/g,"''");
    execFileSync('powershell',['-NoProfile','-NonInteractive','-Command',`Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $rect=[System.Windows.Forms.SystemInformation]::VirtualScreen; $shot=New-Object System.Drawing.Bitmap $rect.Width,$rect.Height; $draw=[System.Drawing.Graphics]::FromImage($shot); $draw.CopyFromScreen($rect.Left,$rect.Top,0,0,$shot.Size); $shot.Save('${target}'); $draw.Dispose(); $shot.Dispose()`]);
  }else execFileSync('scrot',[file]);
}
async function closeAll(){await context?.close();context=null;await browser?.close();browser=null;await server?.close();server=null;if(profile){await fs.rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:100});profile=null;}}
(async()=>{
  assert(oldRoot&&newRoot&&previewRoot&&badRoot);await fs.mkdir(output,{recursive:true});
  const oldVersion=JSON.parse(await fs.readFile(path.join(oldRoot,'pwa-version.json'),'utf8'));
  const version=JSON.parse(await fs.readFile(path.join(newRoot,'pwa-version.json'),'utf8'));
  const manifest=JSON.parse(await fs.readFile(path.join(newRoot,'manifest.webmanifest'),'utf8'));
  assert.deepEqual(version.storage_names,oldVersion.storage_names);assert.deepEqual(version.storage_names,PWA);
  const oldManifest=JSON.parse(await fs.readFile(path.join(oldRoot,'manifest.webmanifest'),'utf8'));
  for(const key of ['id','scope','start_url','display'])assert.equal(manifest[key],oldManifest[key]);
  results.push({name:'actual live-PWA manifest identity and all namespaces unchanged',passed:true});
  server=await start([oldRoot,newRoot,badRoot]);browser=await chromium.launch(launch);context=await browser.newContext({acceptDownloads:true,viewport:{width:1366,height:900}});
  await context.route('**/favicon.ico',r=>r.fulfill({status:204,body:''}));await seed(context,server.url);
  let page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(server.url);await ready(page);await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  const before=await snapshot(page),oldRevision=(await status(page)).revision;
  await page.locator('#edit-recipe').click();await page.locator('#technology').fill('Незавершённая работа в старой установленной PWA');await page.waitForFunction(()=>KitchenDrafts.load().items.some(x=>x.data.technology.includes('Незавершённая работа')));
  const expected=await snapshot(page),time=await page.evaluate(()=>performance.timeOrigin);
  const second=await context.newPage();await second.goto(server.url);await second.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await page.evaluate(async main=>{await(await caches.open('foreign-sintez-cache')).put(main,new Response('KEEP'));},server.mainURL);
  server.select(1);await update(page);assert.equal((await status(page)).revision,oldRevision);assert.equal(await page.evaluate(()=>performance.timeOrigin),time);
  assert.equal(await page.locator('#technology').inputValue(),'Незавершённая работа в старой установленной PWA');assert.equal((await snapshot(page)).raw,before.raw);
  await page.close();assert.equal((await status(second)).revision,oldRevision);await second.close();
  const outside=await context.newPage();await outside.goto(server.mainURL);await newest(outside,version.revision);
  page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(server.url);await ready(page);
  assert.equal(await page.locator('.sintez-grid button').count(),6);assert(await page.locator('#sintez-presentation').isHidden());
  assert.deepEqual(await snapshot(page),expected);await foreign(page);
  assert.equal(await page.evaluate(async main=>(await(await caches.open('foreign-sintez-cache')).match(main)).text(),server.mainURL),'KEEP');
  results.push({name:'old->new update waits for all old windows; prices, recipes, both photo bytes, folders, expenses, draft and other stores preserved',passed:true});
  await context.setOffline(true);await page.reload();assert.equal(await page.evaluate(()=>navigator.onLine),false);assert.deepEqual(await snapshot(page),expected);
  await page.locator('[data-sintez-route=recipes]').click();await page.locator('[data-open=pie]').click();await page.waitForFunction(()=>!document.querySelector('#print-recipe').disabled);assert.equal(await page.locator('#card-photos img').count(),2);
  await page.screenshot({path:path.join(output,'upgraded-offline-card.png'),fullPage:true});await page.pdf({path:path.join(output,'upgraded-a4.pdf'),format:'A4'});
  await page.locator('#edit-recipe').click();await page.locator('#technology').fill('Офлайн-черновик СИНТЕЗ МЕРЫ');await page.waitForFunction(()=>KitchenDrafts.load().items.some(x=>x.data.technology==='Офлайн-черновик СИНТЕЗ МЕРЫ'));
  const offline=await snapshot(page);await page.reload();await page.locator('[data-restore-draft=pie]').click();assert.equal(await page.locator('#technology').inputValue(),'Офлайн-черновик СИНТЕЗ МЕРЫ');assert.equal((await snapshot(page)).raw,expected.raw);
  const portable=await page.evaluate(()=>KitchenPhotos.exportData(KitchenStorage.load().data));assert.equal(portable.recipes.find(r=>r.id==='pie').photos.filter(Boolean).length,2);assert.equal(portable.establishmentExpenses.rent,40000);
  results.push({name:'new shell cold reload offline, photo gallery, saved calculation, draft recovery, portable JSON and A4',passed:true});
  await context.setOffline(false);server.select(2);
  await page.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Corrupt update did not fail')),20000);reg.addEventListener('updatefound',()=>{const w=reg.installing;w.addEventListener('statechange',()=>{if(w.state==='redundant'){clearTimeout(timer);resolve();}});},{once:true});reg.update().catch(reject);});});
  assert.equal((await status(page)).revision,version.revision);assert.equal((await snapshot(page)).raw,offline.raw);await foreign(page);assert.deepEqual(errors,[]);
  results.push({name:'corrupt update rejected atomically without changing active shell, draft or database',passed:true});
  await closeAll();
  assert(priorPreview,'A real previous SINTEZ worker is required for the public-entry regression');
  server=await start([priorPreview,previewRoot],{mount:'/kitchen-calculator-test/sintez-release/'});browser=await chromium.launch(launch);context=await browser.newContext();
  page=await context.newPage();const fixtureURL=new URL('__entry_fixture__',server.url).href;
  await page.route(fixtureURL,r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Synthetic previous SINTEZ</title>'}));await page.goto(fixtureURL);
  const book=JSON.stringify(design());await page.evaluate(book=>{localStorage.setItem('kitchen-calculator-sintez-preview-v1',book);localStorage.setItem('kitchen-calculator-sintez-appearance-v1','sage');},book);
  await page.goto(server.url);await ready(page);await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);const priorRevision=(await status(page)).revision,priorTime=await page.evaluate(()=>performance.timeOrigin);
  server.select(1);const publicPage=await context.newPage();await publicPage.goto(server.url+'presentation.html');
  assert(await publicPage.locator('#sintez-presentation').isVisible());assert.equal(await publicPage.locator('.sx-intro-slide.is-active h2').textContent(),'СИНТЕЗ МЕРЫ');
  assert.equal((await status(publicPage)).revision,priorRevision,'The old worker must still control both pages');assert.equal(await page.evaluate(()=>performance.timeOrigin),priorTime);
  await publicPage.keyboard.press('End');assert(await publicPage.locator('[data-intro-install]').isVisible());await publicPage.locator('[data-intro-next]').click();await publicPage.waitForFunction(()=>!history.state?.sintezPresentationV1);
  assert(await publicPage.locator('#sintez-home').isVisible());assert.equal(await publicPage.evaluate(()=>localStorage.getItem('kitchen-calculator-sintez-preview-v1')),book);assert.equal(await publicPage.evaluate(()=>localStorage.getItem('kitchen-calculator-sintez-appearance-v1')),'sage');
  await publicPage.goto(server.url+'presentation.html');assert(await publicPage.locator('#sintez-presentation').isVisible());assert.equal(await publicPage.locator('.sx-intro-slide.is-active h2').textContent(),'СИНТЕЗ МЕРЫ');
  results.push({name:'new public URL and entry assets bypass the real previous worker while an old window stays open; no forced activation, reload or data change',passed:true});
  await closeAll();
  if(headful){
    server=await start([oldRoot,newRoot]);profile=await fs.mkdtemp(path.join(os.tmpdir(),'sintez-installed-'));
    context=await chromium.launchPersistentContext(path.join(profile,'chrome'),{...launch,viewport:{width:1280,height:900},env:{...process.env,XDG_DATA_HOME:path.join(profile,'xdg-data'),XDG_CONFIG_HOME:path.join(profile,'xdg-config'),XDG_CACHE_HOME:path.join(profile,'xdg-cache')}});
    await seed(context,server.url);page=await context.newPage();await page.goto(server.url);await ready(page);await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    const stored=await snapshot(page),control=await context.newPage();await control.goto(server.mainURL);const cdp=await context.newCDPSession(control);
    const check=await context.newCDPSession(page);assert.deepEqual((await check.send('Page.getInstallabilityErrors')).installabilityErrors,[]);await check.detach();
    await cdp.send('PWA.install',{manifestId:server.url,installUrlOrBundleUrl:server.url});await cdp.send('PWA.changeAppUserSettings',{manifestId:server.url,displayMode:'standalone'});await cdp.send('PWA.launch',{manifestId:server.url});
    let app=await appWindow(context,control);await app.waitForLoadState();assert.deepEqual(await snapshot(app),stored);await page.close();
    const oldOsState=await cdp.send('PWA.getOsAppState',{manifestId:server.url});server.select(1);await update(app);assert.equal((await status(app)).revision,oldVersion.revision);await app.close();await newest(control,version.revision);
    await cdp.send('PWA.launch',{manifestId:server.url});app=await appWindow(context,control);await app.waitForLoadState();assert(await app.evaluate(()=>matchMedia('(display-mode: standalone)').matches));assert.deepEqual(await snapshot(app),stored);await foreign(app);
    const newOsState=await cdp.send('PWA.getOsAppState',{manifestId:server.url});assert.deepEqual(newOsState,oldOsState);
    assert.equal(await app.evaluate(async()=>{const m=await(await fetch('manifest.webmanifest')).json();return m.name;}),'СИНТЕЗ МЕРЫ');
    await app.bringToFront();await app.screenshot({path:path.join(output,'installed-upgraded-window.png'),fullPage:true});await screen(path.join(output,'installed-upgraded-desktop.png'));
    await context.setOffline(true);await app.reload();assert.deepEqual(await snapshot(app),stored);assert(await app.evaluate(()=>matchMedia('(display-mode: standalone)').matches));
    results.push({name:'real installed old PWA relaunched at same manifest identity in standalone, new branding served, data and offline access preserved',passed:true,platform:process.platform,oldOsState,newOsState});
    await closeAll();
    server=await start([previewRoot],{mount:'/kitchen-calculator-test/sintez-release/'});profile=await fs.mkdtemp(path.join(os.tmpdir(),'sintez-new-install-'));
    context=await chromium.launchPersistentContext(path.join(profile,'chrome'),{...launch,viewport:{width:1280,height:900},env:{...process.env,XDG_DATA_HOME:path.join(profile,'xdg-data'),XDG_CONFIG_HOME:path.join(profile,'xdg-config'),XDG_CACHE_HOME:path.join(profile,'xdg-cache')}});
    page=await context.newPage();await page.goto(server.url);await ready(page);await page.locator('[data-intro-skip]').click();await page.waitForFunction(()=>!history.state?.sintezPresentationV1);
    await page.evaluate(()=>localStorage.removeItem('kitchen-calculator-sintez-presentation-seen-v1')); // Synthetic profile only: prove a marker is not required for a shortcut.
    const c=await context.newCDPSession(page);assert.deepEqual((await c.send('Page.getInstallabilityErrors')).installabilityErrors,[]);await c.send('PWA.install',{manifestId:server.url,installUrlOrBundleUrl:server.url});await c.send('PWA.changeAppUserSettings',{manifestId:server.url,displayMode:'standalone'});await c.send('PWA.launch',{manifestId:server.url});
    const freshApp=await appWindow(context,page);await freshApp.waitForLoadState();assert(await freshApp.evaluate(()=>matchMedia('(display-mode: standalone)').matches));assert.equal(await freshApp.title(),'СИНТЕЗ МЕРЫ — кухонный калькулятор');assert(await freshApp.locator('#sintez-presentation').isHidden());assert(await freshApp.locator('#sintez-home').isVisible());assert.equal(await freshApp.evaluate(()=>localStorage.getItem('kitchen-calculator-sintez-presentation-seen-v1')),null);await freshApp.bringToFront();await screen(path.join(output,'new-branded-installed-desktop.png'));
    await page.goto('chrome://apps');await page.waitForTimeout(1500);await page.bringToFront();await screen(path.join(output,'chrome-apps-approved-icon.png'));await page.screenshot({path:path.join(output,'chrome-apps-approved-icon-content.png'),fullPage:true});
    results.push({name:'fresh real branded PWA installation and native Chrome apps icon screenshot',passed:true,platform:process.platform});
  }
  await fs.writeFile(path.join(output,'pwa-upgrade-proof.json'),JSON.stringify({passed:results.length,headfulNativeInstallationTested:headful,platform:process.platform,manifest,physicalAndroidTested:false,osIconRefreshMayBeDelayed:true,scenarios:results},null,2)+'\n');
  console.log(results.length+' SINTEZ PWA upgrade/install scenarios passed; zero failures.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(closeAll);
