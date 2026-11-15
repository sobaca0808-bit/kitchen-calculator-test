'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {chromium}=require('playwright');
const fixture=require('./helpers/design-fixture.js');
const {KEY:PREF,specs}=require('./helpers/theme-context.js');
const url=process.env.KITCHEN_TEST_URL;
if(!url||!['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname))throw Error('Appearance tests require an isolated loopback server.');
const KEY='kitchen-calculator-pr2-browser-test-v1',DRAFT='kitchen-calculator-pr2-browser-drafts-v1',LIVE='kitchen-calculator-v1';
const output=process.env.KITCHEN_TEST_ARTIFACT_DIR||path.join(os.tmpdir(),'kitchen-appearance-artifacts');
const launch={executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']};
const photo=path.join(__dirname,'fixtures/berry-galette.webp');
let browser,passed=0;const failures=[],proof=[];
async function setup(context,{theme,reference=false,denyRead=false,denyWrite=false,deniedGetter=false}={}){
 await context.route('**/favicon.ico',route=>route.fulfill({status:204,body:''}));
 if(reference){const body=await fs.readFile(path.join(__dirname,'fixtures/approved-berry.html'),'utf8');await context.route(url,route=>route.fulfill({contentType:'text/html',body}));}
 await context.addInitScript(({key,draft,pref,live,theme,denyRead,denyWrite,deniedGetter,data})=>{
  if(!['http:','https:'].includes(location.protocol))return;
  const storage=localStorage,get=Storage.prototype.getItem,set=Storage.prototype.setItem;
  if(get.call(storage,key)===null)set.call(storage,key,JSON.stringify(data));
  set.call(storage,live,'protected fictional database');
  if(theme!==undefined&&get.call(storage,pref)===null)set.call(storage,pref,theme);
  window.__appearanceRead=k=>get.call(storage,k);window.__appearanceOps=[];
  for(const method of ['getItem','setItem','removeItem','clear']){const original=Storage.prototype[method];Storage.prototype[method]=function(...args){window.__appearanceOps.push({method,key:args[0]});if(method==='getItem'&&args[0]===pref&&denyRead)throw new DOMException('Preference denied','SecurityError');if(method==='setItem'&&args[0]===pref&&denyWrite)throw new DOMException('Preference quota','QuotaExceededError');return original.apply(this,args);};}
  if(deniedGetter)Object.defineProperty(window,'localStorage',{configurable:true,get(){throw new DOMException('Storage denied','SecurityError');}});
 },{key:KEY,draft:DRAFT,pref:PREF,live:LIVE,theme,denyRead,denyWrite,deniedGetter,data:fixture()});
 const errors=[],requests=[];context.on('page',page=>{page.setDefaultTimeout(16000);page.on('pageerror',e=>errors.push(e.message));page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});page.on('dialog',dialog=>dialog.accept());page.on('request',request=>requests.push(request.url()));});
 return {errors,requests};
}
async function open(options={}){const width=options.width||1366,context=await browser.newContext({viewport:{width,height:900},isMobile:width<768,hasTouch:width<768,acceptDownloads:true}),watch=await setup(context,options),page=await context.newPage();await page.goto(url);await paint(page);return {page,context,...watch};}
async function paint(page){await page.evaluate(async()=>{await document.fonts.ready;const urls=[...getComputedStyle(document.body).backgroundImage.matchAll(/url\(["']?([^"')]+)/g)].map(m=>m[1]);await Promise.all(urls.map(url=>new Promise(resolve=>{const img=new Image();img.onload=resolve;img.onerror=resolve;img.src=url;})));});}
async function choose(page,theme){if(await page.locator('#appearance-panel').isHidden())await page.locator('#appearance-toggle').click();await page.locator(`input[name=kitchen-appearance][value=${theme}]`).check();await page.keyboard.press('Escape');await paint(page);assert.equal(await page.evaluate(()=>KitchenAppearance.current()),theme);}
async function guard(page,state){assert.equal(await page.evaluate(key=>__appearanceRead(key),LIVE),'protected fictional database');const ops=await page.evaluate(()=>__appearanceOps);assert(ops.every(op=>op.method!=='clear'&&[KEY,DRAFT,PREF].includes(op.key)));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(state.errors,[]);}
async function snapshot(page){return page.evaluate(async({key,draft})=>{const data=KitchenStorage.load().data,photos=[];for(const r of data.recipes)for(const id of KitchenPhotos.ids(r))if(id){const rec=await KitchenPhotos.get(id),digest=await crypto.subtle.digest('SHA-256',await rec.blob.arrayBuffer());photos.push({id,hash:Array.from(new Uint8Array(digest)).join(',')});}return {raw:__appearanceRead(key),draft:__appearanceRead(draft),photos,json:JSON.stringify(await KitchenPhotos.exportData(data))};},{key:KEY,draft:DRAFT});}
async function upload(page,slot=0){await page.locator(slot?'#photo-file-2':'#photo-file').setInputFiles(photo);await page.waitForFunction(slot=>document.querySelector(`.photo-editor [data-photo-slot="${slot}"] img`)?.naturalWidth>0&&!document.querySelector(slot?'#photo-file-2':'#photo-file').disabled,slot);}
async function saveView(page){await page.locator('#save-item').click();await page.locator('#view-recipe').click();await page.waitForFunction(()=>!document.querySelector('#print-recipe').disabled);await paint(page);}
async function contrast(page,selector,min=4.5){const value=await page.locator(selector).first().evaluate(el=>{const parse=s=>{const n=s.match(/[\d.]+/g).map(Number);return [n[0],n[1],n[2],n[3]??1];};const layers=[];for(let n=el;n;n=n.parentElement)layers.push(parse(getComputedStyle(n).backgroundColor));let bg=[255,255,255];for(const c of layers.reverse())bg=bg.map((v,i)=>c[i]*c[3]+v*(1-c[3]));const lum=c=>c.slice(0,3).map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((s,n,i)=>s+n*[.2126,.7152,.0722][i],0);const a=lum(parse(getComputedStyle(el).color)),b=lum(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);});assert(value>=min,`${selector}: contrast ${value.toFixed(2)} < ${min}`);return Number(value.toFixed(2));}
async function comparePixels(page,a,b){return page.evaluate(async({a,b})=>{const decode=async data=>{const image=new Image();image.src=data;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;return {pixels,width:canvas.width,height:canvas.height};};const x=await decode(a),y=await decode(b);if(x.width!==y.width||x.height!==y.height)return {sameSize:false};let max=0,overTolerance=0;for(let i=0;i<x.pixels.length;i+=4){let d=0;for(let c=0;c<3;c++)d=Math.max(d,Math.abs(x.pixels[i+c]-y.pixels[i+c]));max=Math.max(max,d);if(d>2)overTolerance++;}return {sameSize:true,maxChannelDifference:max,pixelsOverTwo:overTolerance};},{a:'data:image/png;base64,'+a.toString('base64'),b:'data:image/png;base64,'+b.toString('base64')});}
async function test(name,fn,options={}){if(process.env.KITCHEN_APPEARANCE_TEST_FILTER&&!name.includes(process.env.KITCHEN_APPEARANCE_TEST_FILTER))return;const s=await open(options);try{await fn(s.page,s);await guard(s.page,s);passed++;console.log('PASS appearance:',name);}catch(error){failures.push({name,error:error.stack||String(error)});console.error('FAIL appearance:',name,error.message);}finally{await s.context.close();}}
(async()=>{try{
 browser=await chromium.launch(launch);await fs.mkdir(output,{recursive:true});
 for(const theme of ['berry','graphite','sage'])for(const width of [1366,390])await test(`${theme}: main, card and editor remain readable at ${width}px`,async page=>{
  assert.equal(await page.evaluate(()=>KitchenAppearance.current()),theme);assert.equal(await page.locator('#editor').evaluate(el=>getComputedStyle(el).backgroundColor),specs[theme].paper);
  const c={};for(const selector of ['#section-title','.local-note','.card-controls label','#appearance-toggle','#recipe-card h1','#recipe-card th','.profitability-grid dt'])c[selector]=await contrast(page,selector);
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(output,`${theme}-${width}-main.png`),fullPage:true});
  if(theme==='berry'){await page.locator('#appearance-toggle').click();await page.screenshot({path:path.join(output,`picker-${width}.png`)});await page.keyboard.press('Escape');}
  await page.locator('#edit-recipe').click();await upload(page);await saveView(page);await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(output,`${theme}-${width}-card.png`),fullPage:true});
  await page.locator('#edit-recipe').click();for(const selector of ['#item-name','.intro','#save-item','#delete-item','#editor label:has(input)'])c[selector]=await contrast(page,selector);await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(output,`${theme}-${width}-editor.png`),fullPage:true});
  proof.push({theme,width,contrast:c});
 },{theme:theme==='berry'?undefined:theme,width});
 for(const width of [1366,390])await test(`approved berry pixels are preserved outside the new control at ${width}px`,async page=>{
  await page.locator('#appearance-control').evaluate(el=>el.remove());const old=await open({width,reference:true});try{
   for(const view of ['main','card','editor']){
    if(view==='card'){
     await page.locator('#edit-recipe').click();await upload(page);await saveView(page);
     const portable=await page.evaluate(()=>KitchenPhotos.exportData(KitchenStorage.load().data));
     await old.page.evaluate(async data=>{const staged=await KitchenPhotos.prepareImport(data),result=KitchenStorage.save(staged.data);if(!result.ok)throw Error(result.error);},portable);
     for(const p of [old.page,page]){await p.reload();await p.waitForFunction(()=>!document.querySelector('#print-recipe').disabled);}
     await page.locator('#appearance-control').evaluate(el=>el.remove());
    }
    if(view==='editor')for(const p of [old.page,page])await p.locator('#edit-recipe').click();
    for(const p of [old.page,page]){await paint(p);await p.evaluate(()=>scrollTo(0,0));}
    const a=await old.page.screenshot({fullPage:true,caret:'hide'}),b=await page.screenshot({fullPage:true,caret:'hide'});await fs.writeFile(path.join(output,`reference-${width}-${view}.png`),a);await fs.writeFile(path.join(output,`actual-${width}-${view}.png`),b);const metrics=await comparePixels(page,a,b);assert(metrics.sameSize,'Approved berry geometry is unchanged');assert.equal(metrics.pixelsOverTwo,0,'Approved berry '+view+' changed beyond browser antialiasing tolerance');proof.push({approvedBerry:true,width,view,...metrics});
   }await guard(old.page,old);
  }finally{await old.context.close();}
 },{width});
 await test('palette keyboard, Escape, outside click and mobile popover stay accessible',async page=>{
  await page.locator('#appearance-toggle').focus();await page.keyboard.press('Enter');assert(await page.locator('input[value=berry]').evaluate(el=>el===document.activeElement));await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>KitchenAppearance.current()==='graphite');await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>KitchenAppearance.current()==='sage');
  const r=await page.locator('#appearance-panel').boundingBox();assert(r.x>=0&&r.x+r.width<=320);for(const selector of ['.appearance-panel h2','.appearance-name','.appearance-status'])await contrast(page,selector);
  await page.keyboard.press('Escape');assert(await page.locator('#appearance-panel').isHidden());assert(await page.locator('#appearance-toggle').evaluate(el=>el===document.activeElement));assert.notEqual(await page.locator('#appearance-toggle').evaluate(el=>getComputedStyle(el).outlineStyle),'none');
  await page.locator('#appearance-toggle').click();await page.locator('#library-search').click();assert(await page.locator('#appearance-panel').isHidden());
 },{width:320});
 await test('switching every theme preserves saved JSON, photo bytes, DOM nodes and geometry',async page=>{
  await page.locator('#edit-recipe').click();await upload(page);await upload(page,1);await saveView(page);const before=await snapshot(page),text=await page.locator('#recipe-card').innerText(),time=await page.evaluate(()=>performance.timeOrigin);
  await page.evaluate(()=>window.__editorNode=document.querySelector('#editor'));
  const rect=()=>page.locator('#editor,#recipe-card,#card-photos,.tabs,.app-header').evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height].map(n=>Math.round(n*10)/10);}));const geometry=await rect();
  for(const theme of ['graphite','sage','berry']){await choose(page,theme);assert.deepEqual(await snapshot(page),before);assert.equal(await page.locator('#recipe-card').innerText(),text);assert.deepEqual(await rect(),geometry);assert.equal(await page.evaluate(()=>performance.timeOrigin),time);assert(await page.evaluate(()=>window.__editorNode===document.querySelector('#editor')));}
  await page.reload();assert.equal(await page.evaluate(()=>KitchenAppearance.current()),'berry');assert.deepEqual(await snapshot(page),before);
 });
 await test('theme switching keeps an unsaved recipe and its draft recoverable',async page=>{
  const saved=await snapshot(page);await page.locator('#edit-recipe').click();await page.locator('#item-name').fill('Незавершённый пирог');await page.locator('#qty-p-apple').fill('601');await page.locator('#technology').fill('Учебный незавершённый способ.');await page.waitForFunction(()=>document.querySelector('#draft-status')?.textContent.includes('Черновик сохранён'));
  const draft=await page.evaluate(key=>__appearanceRead(key),DRAFT);
  for(const theme of ['graphite','berry','sage']){await choose(page,theme);assert.equal(await page.locator('#item-name').inputValue(),'Незавершённый пирог');assert.equal(await page.locator('#qty-p-apple').inputValue(),'601');assert.equal(await page.evaluate(key=>__appearanceRead(key),DRAFT),draft);assert.equal((await snapshot(page)).raw,saved.raw);}
  await page.reload();assert.equal(await page.evaluate(()=>KitchenAppearance.current()),'sage');await page.locator('[data-restore-draft="pie"]').click();assert.equal(await page.locator('#item-name').inputValue(),'Незавершённый пирог');assert.equal((await snapshot(page)).raw,saved.raw);
 });
 await test('invalid saved preference falls back without rewriting data',async page=>{
  assert.equal(await page.evaluate(()=>KitchenAppearance.current()),'berry');assert.equal(await page.evaluate(key=>__appearanceRead(key),PREF),'{unsupported preference');await choose(page,'sage');assert.equal(await page.evaluate(key=>__appearanceRead(key),PREF),'sage');
 },{theme:'{unsupported preference'});
 await test('preference quota applies the theme only in memory and preserves the saved database',async page=>{
  const saved=await snapshot(page);await choose(page,'graphite');assert.match(await page.locator('#appearance-status').textContent(),/Не удалось/);assert.equal(await page.evaluate(key=>__appearanceRead(key),PREF),'berry');assert.deepEqual(await snapshot(page),saved);await page.reload();assert.equal(await page.evaluate(()=>KitchenAppearance.current()),'berry');
 },{theme:'berry',denyWrite:true});
 await test('denied localStorage still permits safe in-memory appearance without exceptions',async page=>{
  assert.equal(await page.evaluate(()=>KitchenAppearance.current()),'berry');await choose(page,'sage');assert.match(await page.locator('#appearance-status').textContent(),/Не удалось/);assert.equal(await page.evaluate(key=>__appearanceRead(key),PREF),null);
 },{deniedGetter:true});
 await test('appearance synchronizes between tabs without rewriting recipes',async(page,s)=>{
  const before=await snapshot(page),second=await s.context.newPage();await second.goto(url);await choose(page,'graphite');await second.waitForFunction(()=>KitchenAppearance.current()==='graphite');await choose(second,'sage');await page.waitForFunction(()=>KitchenAppearance.current()==='sage');assert.deepEqual(await snapshot(page),before);await second.close();
 });
 await test('a real Chromium restart retains preference, recipe and photograph',async()=>{
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'kitchen-appearance-profile-'));let context;try{
   context=await chromium.launchPersistentContext(profile,{...launch,viewport:{width:1366,height:900}});let watch=await setup(context);let p=await context.newPage();await p.goto(url);await choose(p,'graphite');await p.locator('#edit-recipe').click();await upload(p);await saveView(p);const before=await snapshot(p);await context.close();context=null;
   context=await chromium.launchPersistentContext(profile,{...launch,viewport:{width:1366,height:900}});watch=await setup(context);p=await context.newPage();await p.goto(url);await p.waitForFunction(()=>!document.querySelector('#print-recipe').disabled);assert.equal(await p.evaluate(()=>KitchenAppearance.current()),'graphite');assert.deepEqual(await snapshot(p),before);await guard(p,watch);
  }finally{if(context)await context.close();await fs.rm(profile,{recursive:true,force:true});}
 });
 await test('initial load requests only the selected illustration, including after reload',async()=>{
  for(const theme of ['berry','graphite','sage']){const s=await open({theme:theme==='berry'?undefined:theme});try{
   const illustrations=()=>s.requests.filter(x=>/\/(watercolor|graphite|sage)-kitchen\.webp(?:\?|$)/.test(x));await paint(s.page);assert(illustrations().length>0);assert(illustrations().every(x=>x.includes(specs[theme].art)),JSON.stringify(illustrations()));await s.page.reload();await paint(s.page);assert(illustrations().every(x=>x.includes(specs[theme].art)));await guard(s.page,s);
  }finally{await s.context.close();}}
 });
 await test('all themes keep the palette and artwork out of A4 printing',async page=>{
  await page.locator('#edit-recipe').click();await upload(page);await saveView(page);const saved=await snapshot(page);
  for(const theme of ['berry','graphite','sage']){await choose(page,theme);await page.locator('#appearance-toggle').click();await page.emulateMedia({media:'print'});assert(await page.locator('#appearance-control').isHidden());assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundImage),'none');assert.equal(await page.locator('#recipe-card').evaluate(el=>getComputedStyle(el).color),'rgb(0, 0, 0)');await page.pdf({path:path.join(output,'appearance-'+theme+'.pdf'),format:'A4',preferCSSPageSize:true});await page.emulateMedia({media:'screen'});await page.keyboard.press('Escape');}
  assert.deepEqual(await snapshot(page),saved);
 });
 await fs.writeFile(path.join(output,'appearance-proof.json'),JSON.stringify(proof,null,2)+'\n');
 }catch(error){failures.push({name:'runner',error:error.stack||String(error)});}finally{if(browser)await browser.close();}
 for(const failure of failures)console.error(JSON.stringify(failure));console.log(`${passed} appearance browser scenarios passed; ${failures.length} failures.`);if(failures.length)process.exitCode=1;
})();
