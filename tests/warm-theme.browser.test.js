/* Warm screen theme: fictional data, disposable loopback contexts, unchanged A4. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const url=process.env.KITCHEN_TEST_URL;
if(!url||!['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname))throw Error('Theme tests require a disposable loopback server.');
const KEY='kitchen-calculator-pr2-browser-test-v1',DRAFT='kitchen-calculator-pr2-browser-drafts-v1',LIVE='kitchen-calculator-v1';
const SENTINEL='{"fictional":"warm-theme-protected-placeholder"}';
const output=process.env.KITCHEN_TEST_ARTIFACT_DIR||path.join(os.tmpdir(),'kitchen-warm-theme-artifacts');
const theme='link[href="assets/warm-kitchen.css"]';
let browser,passed=0;const failures=[],proof=[];
function fixture(long=false){
 const product=(id,name,price,packQuantity=1,unit='kg',massPerPiece=null)=>({id,name,price,packQuantity,unit,massPerPiece,gramsPerMl:null,aliases:'',note:'Вымышленные данные для проверки оформления.'});
 const row=(id,refId,quantity,unit='g')=>({id,refId,quantity,unit,lossPercent:null,outputGrams:null,note:''});
 return {version:1,folders:[{id:'baking',name:'Выпечка'},{id:'menu',name:'Основное меню'}],products:[product('flour','Пшеничная мука',75),product('apple','Яблоки',140),product('butter','Сливочное масло',210,180,'g'),product('egg','Яйцо куриное',110,10,'pcs',55),product('sugar','Сахар',70),product('spice','Корица',160,20,'g')],packaging:[{id:'box',name:'Коробка для пирога',price:50,packQuantity:10,unit:'pcs',note:''}],recipes:[
 {id:'dough',type:'prep',name:'Песочное тесто',actualYield:900,note:'Охладить перед раскаткой.',technology:'1. Соединить компоненты.\n2. Охладить.',ingredients:[row('d-flour','flour',500),row('d-butter','butter',180),row('d-egg','egg',1,'pcs'),row('d-sugar','sugar',120)]},
 {id:'pie',type:'dish',name:'Яблочный пирог с корицей',folderId:'baking',portions:8,actualYield:1400,sellingPrice:190,note:'Вымышленный рецепт. Перед подачей остудить.',technology:'1. Подготовить яблоки.\n2. Раскатать тесто и выложить начинку.\n3. Выпечь и разделить на порции.',ingredients:[row('p-dough','dough',700),row('p-apple','apple',600),row('p-sugar','sugar',60),row('p-spice','spice',3),...(long?Array.from({length:40},(_,i)=>row('long-'+i,'apple',1)):[])],packaging:[{id:'p-box',refId:'box',quantity:1,unit:'pcs',freeForGuest:false,costMode:'additional'}]},
 {id:'tart',type:'dish',name:'Яблочная тарталетка',folderId:'menu',portions:1,actualYield:150,sellingPrice:230,note:'',technology:'Собрать и выпечь.',ingredients:[row('t-dough','dough',80),row('t-apple','apple',70)]}]};
}
async function open({width=1366,before=false,long=false}={}){
 const context=await browser.newContext({viewport:{width,height:900},isMobile:width<768,hasTouch:width<=768,acceptDownloads:true});
 await context.route('**/favicon.ico',route=>route.fulfill({status:204,body:''}));
 if(before)await context.route('**/assets/warm-kitchen.css',route=>route.fulfill({contentType:'text/css',body:''}));
 await context.addInitScript(({key,live,sentinel,data})=>{
  if(!['http:','https:'].includes(location.protocol))return;
  const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
  if(get.call(localStorage,key)===null)set.call(localStorage,key,JSON.stringify(data));
  set.call(localStorage,live,sentinel);window.__warmRead=id=>get.call(localStorage,id);window.__warmOps=[];
  for(const method of ['getItem','setItem','removeItem','clear']){const original=Storage.prototype[method];Storage.prototype[method]=function(...args){window.__warmOps.push({method,key:args[0]});return original.apply(this,args);};}
 },{key:KEY,live:LIVE,sentinel:SENTINEL,data:fixture(long)});
 const errors=[],requests=[];context.on('page',page=>{page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});page.on('dialog',dialog=>dialog.accept());page.on('request',request=>requests.push(request.url()));});
 const page=await context.newPage();await page.goto(url);await ready(page);return {page,context,errors,requests};
}
async function ready(page){await page.evaluate(()=>document.fonts.ready);}
async function guard(page){
 const p=await page.evaluate(key=>({live:window.__warmRead(key),ops:window.__warmOps}),LIVE);
 assert.equal(p.live,SENTINEL);assert(p.ops.every(op=>op.method!=='clear'&&[KEY,DRAFT].includes(op.key)));
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal page overflow');
}
async function section(page,name){await page.locator(`[data-tab="${name}"]`).click();if(name==='dish'&&await page.locator('#edit-recipe').count())await page.locator('#edit-recipe').click();await ready(page);}
async function pair(page,selector,pseudo=null){return page.locator(selector).first().evaluate((el,pseudo)=>{
 const color=value=>{const n=value.match(/[\d.]+/g)?.map(Number)||[0,0,0,0];return [n[0],n[1],n[2],n[3]??1];};
 const over=(a,b)=>{const t=a[3]+b[3]*(1-a[3]);return t?[0,1,2].map(i=>(a[i]*a[3]+b[i]*b[3]*(1-a[3]))/t).concat(t):[0,0,0,0];};
 const layers=[];for(let n=el;n;n=n.parentElement)layers.push(color(getComputedStyle(n).backgroundColor));
 let bg=[255,255,255,1];for(const layer of layers.reverse())bg=over(layer,bg);
 return {fg:color(getComputedStyle(el,pseudo).color),bg,disabled:el.disabled||false};
},pseudo);}
function ratio({fg,bg}){const lum=c=>c.slice(0,3).map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((s,n,i)=>s+n*[.2126,.7152,.0722][i],0);const a=lum(fg),b=lum(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);}
async function contrast(page,selector,min=4.5,pseudo=null){const colors=await pair(page,selector,pseudo),value=ratio(colors);assert(value>=min,`${selector}${pseudo||''}: contrast ${value.toFixed(2)} < ${min}`);return Number(value.toFixed(2));}
async function snapshot(page){return page.evaluate(async({key,draft})=>{
 const raw=localStorage.getItem(key),data=JSON.parse(raw),photos=[];
 for(const recipe of data.recipes)for(const id of KitchenPhotos.ids(recipe))if(id){const record=await KitchenPhotos.get(id),digest=await crypto.subtle.digest('SHA-256',await record.blob.arrayBuffer());photos.push({id,hash:[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('')});}
 return {raw,draft:localStorage.getItem(draft),photos,export:JSON.stringify(await KitchenPhotos.exportData(data))};
},{key:KEY,draft:DRAFT});}
async function pictures(page){
 await page.locator('#edit-recipe').click();await page.locator('#photo-editor').scrollIntoViewIfNeeded();
 for(let i=0;i<2;i++){
  const source=await page.evaluate(i=>{const c=document.createElement('canvas');c.width=640;c.height=420;const x=c.getContext('2d');x.fillStyle=i?'#d5c4a5':'#c4a780';x.fillRect(0,0,640,420);x.shadowColor='#594f3933';x.shadowBlur=15;x.fillStyle='#f0e9db';x.beginPath();x.ellipse(320,210,240,170,0,0,Math.PI*2);x.fill();x.shadowBlur=0;x.fillStyle='#a26b35';x.beginPath();x.ellipse(320,210,183,138,0,0,Math.PI*2);x.fill();x.fillStyle='#d5a558';x.beginPath();x.ellipse(320,210,167,123,0,0,Math.PI*2);x.fill();x.strokeStyle='#edd2a4';x.lineWidth=13;x.save();x.beginPath();x.ellipse(320,210,158,114,0,0,Math.PI*2);x.clip();for(let a=100;a<580;a+=44){x.beginPath();x.moveTo(a,60);x.lineTo(a+70,360);x.stroke();}x.restore();x.fillStyle='#4e6945';x.beginPath();x.ellipse(520,325,27,9,-.6,0,Math.PI*2);x.fill();return c.toDataURL('image/png');},i);
  await page.locator(i?'#photo-file-2':'#photo-file').setInputFiles({name:'fictional-pie.png',mimeType:'image/png',buffer:Buffer.from(source.split(',')[1],'base64')});
  await page.waitForFunction(i=>document.querySelector(`.photo-editor [data-photo-slot="${i}"] img`)?.naturalWidth>0&&!document.querySelector(i?'#photo-file-2':'#photo-file').disabled,i);
 }
 await page.locator('#save-item').click();await page.locator('#view-recipe').click();await page.waitForFunction(()=>!document.querySelector('#print-recipe').disabled);
}
async function test(name,fn,opts={}){
 if(process.env.KITCHEN_THEME_TEST_FILTER&&!name.includes(process.env.KITCHEN_THEME_TEST_FILTER))return;
 const s=await open(opts);try{await fn(s.page,s);await guard(s.page);assert.deepEqual(s.errors,[]);passed++;console.log('PASS warm theme:',name);}catch(error){failures.push({name,error:error.stack||error.message});console.error('FAIL warm theme:',name,error.message);}finally{await s.context.close();}
}
function pdf(file){const info=execFileSync('pdfinfo',[file],{encoding:'utf8'});return {pages:Number(info.match(/^Pages:\s+(\d+)/m)[1]),text:execFileSync('pdftotext',['-layout',file,'-'],{encoding:'utf8'}),info};}
(async()=>{
 try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});await fs.mkdir(output,{recursive:true});
  for(const width of [320,390,768,1366])await test(`main editors remain readable and usable at ${width}px`,async page=>{
   const values={};for(const name of ['products','prep','dish','packaging']){
    await section(page,name);assert.equal(await page.locator('.editor').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(245, 240, 231)');
    for(const selector of ['#item-name','.intro','#save-item','#delete-item'])values[name+selector]=await contrast(page,selector);
    values[name+'label']=await contrast(page,'#editor label:has(input)');values[name+'field']=await contrast(page,'#editor input:not([type=file])');
    await guard(page);assert((await page.locator('#save-item').boundingBox()).height>=44);
   }proof.push({width,contrast:values});
  },{width});
  await test('buttons, selectors and keyboard focus have distinct accessible states',async page=>{
   await section(page,'products');
   const colors=await page.evaluate(()=>({input:getComputedStyle(document.querySelector('#price')).backgroundColor,select:getComputedStyle(document.querySelector('#product-unit')).backgroundColor}));assert.notEqual(colors.input,colors.select);
   await contrast(page,'#price',4.5,'::placeholder');await contrast(page,'#save-item');await contrast(page,'#delete-item');await contrast(page,'#export');await contrast(page,'#folder-create');
   assert(await page.locator('#folder-rename').isDisabled());await contrast(page,'#folder-rename',3);
   await page.locator('#price').focus();assert.notEqual(await page.locator('#price').evaluate(el=>getComputedStyle(el).boxShadow),'none');
   await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'packQuantity');
   await page.locator('#save-item').focus();await page.waitForFunction(()=>getComputedStyle(document.querySelector('#save-item')).outlineStyle!=='none');
   assert((await page.locator('#save-item').evaluate(el=>parseFloat(getComputedStyle(el).outlineWidth)))>=2);
   const before=await page.locator('#save-item').evaluate(el=>getComputedStyle(el).backgroundColor);await page.locator('#save-item').hover();const hovered=await page.locator('#save-item').evaluate(el=>getComputedStyle(el).backgroundColor);assert.notEqual(hovered,before);
   await page.mouse.down();assert.notEqual(await page.locator('#save-item').evaluate(el=>getComputedStyle(el).backgroundColor),hovered);await page.mouse.move(1,1);await page.mouse.up();
   const body=await page.evaluate(()=>{const s=getComputedStyle(document.body);return {image:s.backgroundImage,repeat:s.backgroundRepeat,attachment:s.backgroundAttachment};});assert.doesNotMatch(body.image,/url\(/);assert(body.repeat.split(',').every(s=>s.trim()==='no-repeat'));assert(body.attachment.split(',').every(s=>s.trim()==='fixed'));
  });
  await test('long recipe, fixed actions and both photographs keep their data and proportions',async page=>{
   await pictures(page);await page.locator('#edit-recipe').click();const field=page.locator('#qty-long-39');await field.focus();await field.scrollIntoViewIfNeeded();await page.waitForFunction(()=>{const f=document.querySelector('#qty-long-39').getBoundingClientRect(),b=document.querySelector('.form-actions').getBoundingClientRect();return f.bottom<=b.top+1;});
   assert.equal(await page.locator('.form-actions').getAttribute('data-fixed'),'true');await page.locator('#view-recipe').click();
   const saved=await snapshot(page);assert.equal(saved.photos.length,2);await page.evaluate(selector=>document.querySelector(selector).disabled=true,theme);await ready(page);await page.evaluate(selector=>document.querySelector(selector).disabled=false,theme);await ready(page);assert.deepEqual(await snapshot(page),saved);
   for(const img of await page.locator('#card-photos img').all())assert.equal(await img.evaluate(el=>getComputedStyle(el).objectFit),'contain');
   await page.locator('#card-photos .photo-open').first().click();assert(await page.locator('.photo-viewer').isVisible());await page.keyboard.press('Escape');assert.deepEqual(await snapshot(page),saved);
   await page.locator('#recipe-card').screenshot({path:path.join(output,'recipe-photos-after.png')});
   await page.locator('#recipe-card').evaluate(el=>el.scrollIntoView({block:'start'}));await page.screenshot({path:path.join(output,'recipe-mobile-after.png')});
  },{width:390,long:true});
  for(const width of [390,1366])await test(`import preview uses the same palette without writing data at ${width}px`,async page=>{
   const saved=await snapshot(page),incoming=fixture();incoming.products[0].price=90;
   await page.locator('#import-file').setInputFiles({name:'fictional-warm-theme.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(incoming))});
   await page.waitForFunction(()=>!document.querySelector('#import-panel').hidden&&document.querySelector('#import-panel').getAttribute('aria-busy')==='false');
   assert(await page.locator('#import-apply').isDisabled());assert((await page.locator('[data-conflict-choice]').count())>0);
   await contrast(page,'#import-panel h2');await contrast(page,'#import-summary span');await contrast(page,'#import-mode');
   await page.locator('#import-panel').evaluate(el=>el.scrollIntoView({block:'start'}));await page.screenshot({path:path.join(output,width===390?'import-mobile-after.png':'import-desktop-after.png')});
   await page.locator('#import-cancel').click();assert.deepEqual(await snapshot(page),saved);
  },{width});
  for(const width of [390,1366])await test(`before and after comparison is captured from the same fixture at ${width}px`,async(page,s)=>{
   const old=await open({width,before:true});try{
    for(const [p,label]of [[old.page,'before'],[page,'after']]){
     await section(p,'products');await p.locator('#item-name').evaluate(el=>el.blur());
     if(width===390)await p.locator('#editor').evaluate(el=>el.scrollIntoView({block:'start'}));else await p.evaluate(()=>scrollTo(0,0));
     await ready(p);await p.screenshot({path:path.join(output,(width===390?'mobile-':'desktop-')+label+'.png')});await guard(p);
    }
    assert.equal(await old.page.locator('.editor').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
    assert.equal(await page.locator('.editor').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(245, 240, 231)');assert.deepEqual(old.errors,[]);
   }finally{await old.context.close();}
  },{width});
  await test('both A4 forms and all four photo choices print identically with and without the screen theme',async page=>{
   await pictures(page);const saved=await snapshot(page);
   await page.locator('#recipe-card').evaluate(el=>el.scrollIntoView({block:'start'}));await page.screenshot({path:path.join(output,'recipe-desktop-after.png')});
   for(const form of ['chef','calculation'])for(const choice of ['none','first','second','both']){
    await page.emulateMedia({media:'screen'});await page.locator('#card-mode').selectOption(form);await page.locator('#print-photos').selectOption(choice);await page.waitForFunction(()=>!document.querySelector('#print-recipe').disabled);
    const files=[];for(const [label,disabled]of [['before',true],['after',false]]){
     await page.evaluate(({selector,disabled})=>document.querySelector(selector).disabled=disabled,{selector:theme,disabled});await page.emulateMedia({media:'print'});
     const file=path.join(output,`print-${form}-${choice}-${label}.pdf`);await page.pdf({path:file,format:'A4',preferCSSPageSize:true});files.push(file);
    }
    const a=pdf(files[0]),b=pdf(files[1]);assert.match(b.info,/A4/);assert.equal(b.pages,a.pages);assert.equal(b.text,a.text);
    for(let i=0;i<2;i++)execFileSync('pdftoppm',['-r','85','-png',files[i],files[i].slice(0,-4)]);
    for(let n=1;n<=a.pages;n++){const suffix='-'+String(n).padStart(String(a.pages).length,'0')+'.png';assert.deepEqual(await fs.readFile(files[0].slice(0,-4)+suffix),await fs.readFile(files[1].slice(0,-4)+suffix),'Printed pixels are unchanged');}
    proof.push({form,choice,pages:b.pages,printPixelsIdentical:true});
   }
   await page.emulateMedia({media:'screen'});assert.deepEqual(await snapshot(page),saved);
  });
  await fs.writeFile(path.join(output,'theme-proof.json'),JSON.stringify(proof,null,2)+'\n');
 }catch(error){failures.push({name:'runner',error:error.stack||error.message});}
 finally{if(browser)await browser.close();}
 for(const failure of failures)console.error(JSON.stringify(failure));console.log(`${passed} warm-theme browser scenarios passed; ${failures.length} failures.`);if(failures.length)process.exitCode=1;
})();
