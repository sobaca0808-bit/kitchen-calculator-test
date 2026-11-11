/* PR #10 supplement: two local photos, disposable localhost contexts only. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('playwright');
const testURL=process.env.KITCHEN_TEST_URL;
if(!testURL)throw Error('KITCHEN_TEST_URL must identify the disposable loopback server.');
const target=new URL(testURL);
if(!['http:','https:'].includes(target.protocol)||!['127.0.0.1','localhost','[::1]'].includes(target.hostname))throw Error('Two-photo checks never run on a published site.');
const KEY='kitchen-calculator-pr2-browser-test-v1',DRAFT='kitchen-calculator-pr2-browser-drafts-v1',PRODUCTION='kitchen-calculator-v1';
const SENTINEL='{"fictional":"two-photo-protected-production-placeholder"}';
const output=process.env.KITCHEN_TEST_ARTIFACT_DIR||path.join(require('node:os').tmpdir(),'kitchen-two-photo-artifacts');
function fixture(){return {version:1,products:[{id:'rice',name:'Рис — тестовый продукт',aliases:'',price:100,packQuantity:1,unit:'kg',massPerPiece:null,gramsPerMl:null,note:''}],packaging:[{id:'box',name:'Контейнер',price:500,packQuantity:50,unit:'pcs',note:''}],recipes:[{id:'dish',type:'dish',name:'Рис с овощами · два эталона подачи',portions:2,actualYield:400,technology:'1. Промыть рис и отварить.\n2. Добавить подготовленные овощи.\n3. Разложить и подать горячим.',note:'Вымышленные данные для проверки двух фотографий.',ingredients:[{id:'rice-row',refId:'rice',quantity:200,unit:'g',lossPercent:null,outputGrams:null,note:''}],packaging:[{id:'box-row',refId:'box',quantity:1,unit:'pcs',freeForGuest:true,costMode:'auto'}]}]};}
const stored=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
const draft=page=>page.evaluate(()=>KitchenDrafts.load().items.find(item=>item.id==='dish'));
const ids=page=>page.evaluate(()=>KitchenPhotos.ids(KitchenStorage.load().data.recipes[0]));
const sourceIds=page=>page.evaluate(()=>KitchenPhotos.ids(KitchenDrafts.load().items.find(item=>item.id==='dish')?.data||KitchenStorage.load().data.recipes[0]));
const inputId=slot=>slot?'#photo-file-2':'#photo-file';
const cameraId=slot=>slot?'#photo-camera-2':'#photo-camera';
const removeId=slot=>slot?'#remove-photo-2':'#remove-photo';
const slot= (page,index,scope='.photo-editor')=>page.locator(`${scope} [data-photo-slot="${index}"]`);
let browser,passed=0;const failures=[];
async function contextFor({width=1366,mobile=false,data=fixture()}={}){
 const context=await browser.newContext({viewport:{width,height:900},acceptDownloads:true,isMobile:mobile,hasTouch:mobile});
 await context.addInitScript(({key,draftKey,production,sentinel,data})=>{
  if(!['http:','https:'].includes(location.protocol))return;
  const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
  if(get.call(localStorage,key)===null)set.call(localStorage,key,JSON.stringify(data));
  set.call(localStorage,production,sentinel);window.__twoPhotoOps=[];window.__twoPhotoRead=k=>get.call(localStorage,k);
  for(const method of ['getItem','setItem','removeItem','clear']){const original=Storage.prototype[method];Storage.prototype[method]=function(...args){window.__twoPhotoOps.push({method,key:args[0]});if(method==='setItem'&&args[0]===key&&window.__blockMain)throw new DOMException('Fictional main quota','QuotaExceededError');return original.apply(this,args);};}
 },{key:KEY,draftKey:DRAFT,production:PRODUCTION,sentinel:SENTINEL,data});
 return context;
}
async function guard(page){
 const proof=await page.evaluate(production=>({sentinel:window.__twoPhotoRead(production),ops:window.__twoPhotoOps}),PRODUCTION);
 assert.equal(proof.sentinel,SENTINEL);assert(proof.ops.length&&proof.ops.every(op=>op.method!=='clear'&&[KEY,DRAFT].includes(op.key)),'Only exact test/draft keys are touched');
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal page overflow');
}
async function test(name,fn,options={}){
 const context=await contextFor(options),errors=[];
 context.on('page',page=>{page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());});
 const page=await context.newPage();
 try{await page.goto(testURL);await fn(page,context);for(const opened of context.pages())if(!opened.isClosed())await guard(opened);assert.deepEqual(errors,[],'No unhandled JavaScript errors');passed++;console.log('PASS two photos:',name);}
 catch(error){failures.push({name,error:error.stack||error.message});console.error('FAIL two photos:',name,error.message);}
 finally{await context.close();}
}
async function edit(page){if(await page.locator('#edit-recipe').count())await page.locator('#edit-recipe').click();}
async function waitPhoto(page,index){await page.waitForFunction(index=>{const input=document.querySelector(index?'#photo-file-2':'#photo-file'),image=document.querySelector(`.photo-editor [data-photo-slot="${index}"] img`);return input&&!input.disabled&&image?.complete&&image.naturalWidth>0;},index);}
async function upload(page,index,file,{camera=false}={}){await page.locator(camera?cameraId(index):inputId(index)).setInputFiles(file);await waitPhoto(page,index);}
async function card(page){await page.locator('#view-recipe').click();await page.waitForFunction(()=>!document.querySelector('#print-recipe')?.disabled);}
async function save(page){await page.locator('#save-item').click();await page.waitForFunction(()=>document.querySelector('#save-item')?.textContent.includes('Сохранено'));}
async function restore(page){await page.locator('[data-restore-draft="dish"]').click();}
async function picture(page,{color='#42583a',width=2304,height=1536,mime='image/png',detail=false}={}){
 const data=await page.evaluate(({color,width,height,mime,detail})=>{
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');
  const gradient=ctx.createLinearGradient(0,0,width,height);gradient.addColorStop(0,color);gradient.addColorStop(1,'#242a21');ctx.fillStyle=gradient;ctx.fillRect(0,0,width,height);
  ctx.fillStyle='#f4edda';ctx.beginPath();ctx.ellipse(width*.5,height*.52,width*.37,height*.35,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#d8bd7c';ctx.beginPath();ctx.ellipse(width*.5,height*.51,width*.28,height*.26,0,0,Math.PI*2);ctx.fill();
  let seed=9187;function rnd(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
  for(let i=0;i<(detail?20000:120);i++){const x=width*(.23+rnd()*.54),y=height*(.29+rnd()*.44);ctx.fillStyle=['#406b38','#a23425','#eddfac','#bd963d'][i%4];ctx.fillRect(x,y,detail?3+rnd()*9:width*.012,detail?2+rnd()*5:height*.01);}
  if(detail){ctx.fillStyle='#252d20';ctx.font=Math.round(width*.014)+'px sans-serif';ctx.fillText('ТЕСТ · детали подачи · 1234567890',width*.29,height*.55);}
  return canvas.toDataURL(mime,.95);
 },{color,width,height,mime,detail});
 return {name:'fictional-dish.'+(mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg'),mimeType:mime,buffer:Buffer.from(data.split(',')[1],'base64')};
}
async function exportJSON(page){const waiting=page.waitForEvent('download');await page.locator('#export').click();const download=await waiting;return JSON.parse(await fs.readFile(await download.path(),'utf8'));}
async function importJSON(page,data){await page.locator('#import-file').setInputFiles({name:'fictional-two-photos.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});}
async function idbCount(page){return page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open(KitchenPhotos.DB_NAME,1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('photos','readonly'),count=tx.objectStore('photos').count();count.onsuccess=()=>{resolve(count.result);db.close();};count.onerror=()=>reject(count.error);};}));}
async function photoInfo(page,id){return page.evaluate(async id=>{const p=await KitchenPhotos.get(id);return {width:p.width,height:p.height,mime:p.mime,bytes:p.blob.size};},id);}
(async()=>{
 try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  await fs.mkdir(output,{recursive:true});
  await test('two equal frames stay under the title, empty slots never create photos',async page=>{
   const before=await stored(page);assert.equal(await page.locator('#card-photos [data-photo-slot]').count(),2);assert.equal(await page.locator('#card-photos img').count(),0);
   const frames=await page.locator('#card-photos [data-photo-slot]').evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}));
   assert(Math.abs(frames[0].width-frames[1].width)<1&&Math.abs(frames[0].height-frames[1].height)<1);assert(Math.abs(frames[0].y-frames[1].y)<1&&frames[1].x>frames[0].x);
   assert(await page.locator('#recipe-card h1').evaluate(el=>el.getBoundingClientRect().bottom)<=frames[0].y);
   await edit(page);assert.equal(await page.locator('.photo-editor [data-photo-slot]').count(),2);
   const placement=await page.evaluate(()=>({name:document.querySelector('#item-name').getBoundingClientRect().bottom,photos:document.querySelector('.photo-editor').getBoundingClientRect().top,ingredients:document.querySelector('#ingredients').getBoundingClientRect().top}));
   assert(placement.photos>placement.name&&placement.photos<placement.ingredients,'Photo controls are near the name above ingredient forms');assert.deepEqual(await stored(page),before);
  });
  await test('two independent uploads, replacement and swap persist without changing food or packaging',async page=>{
   const before=await stored(page);await edit(page);await upload(page,0,await picture(page));const first=(await sourceIds(page))[0];
   assert.deepEqual(await sourceIds(page),[first,null]);await upload(page,1,await picture(page,{color:'#643829',mime:'image/webp'}));const second=(await sourceIds(page))[1];assert(first&&second&&first!==second);
   assert.deepEqual(await stored(page),before,'Uploads only alter the separate draft');
   await page.locator('#swap-photos').click();assert.deepEqual(await sourceIds(page),[second,first]);await save(page);
   const saved=await stored(page);assert.deepEqual(saved.recipes[0].photoIds,[second,first]);assert.deepEqual(saved.products,before.products);assert.deepEqual(saved.packaging,before.packaging);assert.deepEqual(saved.recipes[0].ingredients,before.recipes[0].ingredients);assert.deepEqual(saved.recipes[0].packaging,before.recipes[0].packaging);
   await upload(page,0,await picture(page,{color:'#344c66',mime:'image/jpeg'}));const replaced=await sourceIds(page);assert.notEqual(replaced[0],second);assert.equal(replaced[1],first);assert.deepEqual((await stored(page)).recipes[0].photoIds,[second,first]);await save(page);await card(page);
   assert.equal(await page.locator('#card-photos img').count(),2);assert.match(await page.locator('.card-cost').innerText(),/40,00/);await page.locator('#view-portions').fill('10');assert.match(await page.locator('.card-cost').innerText(),/200,00/);assert.deepEqual(await stored(page),{...saved,recipes:[{...saved.recipes[0],photoIds:replaced}]});
   await page.reload();await page.waitForFunction(()=>document.querySelectorAll('#card-photos img').length===2&&[...document.querySelectorAll('#card-photos img')].every(img=>img.naturalWidth>0));assert.deepEqual(await ids(page),replaced);
  });
  await test('deletion confirms independently; a single photo can move slots and prints once',async page=>{
   await edit(page);await upload(page,0,await picture(page));await upload(page,1,await picture(page,{color:'#643829'}));await save(page);const before=await stored(page);
   page.removeAllListeners('dialog');page.once('dialog',dialog=>dialog.dismiss());await page.locator(removeId(0)).click();assert.deepEqual(await sourceIds(page),before.recipes[0].photoIds);
   page.on('dialog',dialog=>dialog.accept());await page.locator(removeId(0)).click();assert.deepEqual(await sourceIds(page),[null,before.recipes[0].photoIds[1]]);assert.deepEqual(await stored(page),before);
   await page.locator('#swap-photos').click();const remaining=[before.recipes[0].photoIds[1],null];assert.deepEqual(await sourceIds(page),remaining);await save(page);await card(page);
   assert.equal(await page.locator('#card-photos [data-photo-slot]').count(),2);assert.equal(await page.locator('#card-photos img').count(),1);
   await page.emulateMedia({media:'print'});assert.equal(await page.locator('#card-photos .recipe-photo').filter({visible:true}).count(),1);assert.equal(await page.locator('#card-photos [data-photo-slot="1"]').isVisible(),false);await page.pdf({path:'/tmp/kitchen-two-photo-single.pdf',format:'A4'});await page.emulateMedia({media:'screen'});
  });
  await test('two photo draft IDs survive actual tab close, restore and explicit save',async (page,context)=>{
   const before=await stored(page);await edit(page);await page.locator('#item-name').fill('Два незавершённых эталона');await upload(page,0,await picture(page));await upload(page,1,await picture(page,{color:'#643829'}));const pending=await sourceIds(page);
   const closed=page.waitForEvent('close');await page.close({runBeforeUnload:true});await closed;const reopened=await context.newPage();await reopened.goto(testURL);assert.deepEqual(await stored(reopened),before);await restore(reopened);await waitPhoto(reopened,0);await waitPhoto(reopened,1);assert.deepEqual(await sourceIds(reopened),pending);await save(reopened);assert.deepEqual(await ids(reopened),pending);assert.equal(await draft(reopened),undefined);
  },{width:390,mobile:true});
  await test('camera and gallery inputs are separate per slot and share safe image handling',async page=>{
   await edit(page);
   for(const index of [0,1]){assert.equal(await page.locator(cameraId(index)).getAttribute('capture'),'environment');assert.match(await page.locator(cameraId(index)).getAttribute('accept'),/image\/jpeg/);assert.equal(await page.locator(inputId(index)).getAttribute('capture'),null);assert.equal(await page.locator(inputId(index)).getAttribute('multiple'),null);}
   const chooserPromise=page.waitForEvent('filechooser');await slot(page,0).locator('.photo-frame-button').click();const chooser=await chooserPromise;assert.equal(chooser.isMultiple(),false);await chooser.setFiles(await picture(page));await waitPhoto(page,0);
   await upload(page,1,await picture(page,{color:'#643829',mime:'image/jpeg'}),{camera:true});assert.equal((await sourceIds(page)).filter(Boolean).length,2);
  },{width:390,mobile:true});
  await test('viewer opens whole image, zooms and closes with Escape without modifying saved or draft data',async page=>{
   await edit(page);await upload(page,0,await picture(page,{width:800,height:1400}));await upload(page,1,await picture(page));await save(page);await card(page);const before=await stored(page);
   await page.locator('#card-photos img').first().click();await page.locator('#photo-viewer').waitFor({state:'visible'});
   assert.equal(await page.locator('.photo-viewer-image').evaluate(el=>getComputedStyle(el).objectFit),'contain');const stage=page.locator('.photo-viewer-stage');assert.equal(Number(await stage.getAttribute('data-scale')),1);
   await page.locator('#photo-zoom-in').click();assert(Number(await stage.getAttribute('data-scale'))>1);await page.locator('#photo-zoom-reset').click();assert.equal(Number(await stage.getAttribute('data-scale')),1);
   await page.keyboard.press('Escape');assert.equal(await page.locator('#photo-viewer').isVisible(),false);assert.deepEqual(await stored(page),before);assert.equal(await draft(page),undefined);
   await page.locator('#card-photos img').nth(1).click();await page.locator('#photo-viewer-close').click();assert.equal(await page.locator('#photo-viewer').isVisible(),false);
  });
  await test('touch pinch enlarges the image inside the viewer without changing page width or recipe',async (page,context)=>{
   await edit(page);await upload(page,0,await picture(page));await save(page);await card(page);const before=await stored(page);await page.locator('#card-photos img').click();await page.locator('#photo-viewer').waitFor({state:'visible'});
   const stage=page.locator('.photo-viewer-stage'),box=await stage.boundingBox();const cx=Math.round(box.x+box.width/2),cy=Math.round(box.y+box.height/2);const cdp=await context.newCDPSession(page);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx-30,y:cy,id:1},{x:cx+30,y:cy,id:2}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx-70,y:cy,id:1},{x:cx+70,y:cy,id:2}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert(Number(await stage.getAttribute('data-scale'))>1,'A real Chromium touch pointer stream drives pinch zoom');
   await page.locator('#photo-viewer-close').click();assert.deepEqual(await stored(page),before);await guard(page);
  },{width:390,mobile:true});
  await test('photo quota while replacing one slot preserves both prior photos and recoverable draft',async page=>{
   await edit(page);await upload(page,0,await picture(page));await upload(page,1,await picture(page,{color:'#643829'}));await save(page);const before=await stored(page);await page.locator('#item-name').fill('Черновик с двумя фото');await page.waitForTimeout(450);const checkpoint=await draft(page);
   await page.evaluate(()=>{const original=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(...args){if(this.name==='photos')throw new DOMException('Fictional image quota','QuotaExceededError');return original.apply(this,args);};});
   await page.locator(inputId(1)).setInputFiles(await picture(page,{color:'#344c66'}));await page.waitForFunction(()=>[...document.querySelectorAll('.photo-status')].some(el=>el.textContent.includes('не добавлена')));
   assert.deepEqual(await stored(page),before);assert.deepEqual((await draft(page)).data,checkpoint.data);assert.equal(await page.locator('.photo-editor img').count(),2);for(const id of before.recipes[0].photoIds)assert((await photoInfo(page,id)).bytes>0);
  });
  await test('two-photo portable JSON restores fresh IDs on another browser and preserves bytes',async page=>{
   await edit(page);await upload(page,0,await picture(page));await upload(page,1,await picture(page,{color:'#643829'}));await save(page);const source=await stored(page),backup=await exportJSON(page);assert.equal(backup.recipes[0].photos.length,2);assert(backup.recipes[0].photos.every(photo=>photo.dataUrl.startsWith('data:image/jpeg;base64,')));assert.equal(backup.recipes[0].photoIds,undefined);
   const other=await contextFor(),second=await other.newPage();second.setDefaultTimeout(12000);second.on('dialog',dialog=>dialog.accept());try{await second.goto(testURL);await importJSON(second,backup);await second.waitForFunction(()=>KitchenStorage.load().data.recipes[0].photoIds?.filter(Boolean).length===2);const restored=await ids(second);assert(restored.every(id=>!source.recipes[0].photoIds.includes(id)));assert.deepEqual(await exportJSON(second),backup);await guard(second);}finally{await other.close();}
  });
  await test('bad second imported photo rolls back new first photo without touching old data',async page=>{
   await edit(page);await upload(page,0,await picture(page));await upload(page,1,await picture(page,{color:'#643829'}));await save(page);const before=await stored(page),backup=await exportJSON(page),count=await idbCount(page);backup.recipes[0].photos[1].width=1;
   await importJSON(page,backup);await page.waitForFunction(()=>document.querySelector('#message')?.textContent.includes('Импорт отменён'));assert.deepEqual(await stored(page),before);assert.equal(await idbCount(page),count,'No staged first image leaks after the second image fails');for(const id of before.recipes[0].photoIds)assert((await photoInfo(page,id)).bytes>0);
  });
  await test('quota during second imported photo rolls back only staged IDs',async page=>{
   await edit(page);await upload(page,0,await picture(page));await upload(page,1,await picture(page,{color:'#643829'}));await save(page);const before=await stored(page),backup=await exportJSON(page),count=await idbCount(page);
   await page.evaluate(()=>{const original=IDBObjectStore.prototype.add;let writes=0;IDBObjectStore.prototype.add=function(...args){if(this.name==='photos'&&++writes===2)throw new DOMException('Fictional second image quota','QuotaExceededError');return original.apply(this,args);};});await importJSON(page,backup);await page.waitForFunction(()=>document.querySelector('#message')?.textContent.includes('Импорт отменён'));assert.deepEqual(await stored(page),before);assert.equal(await idbCount(page),count);for(const id of before.recipes[0].photoIds)assert((await photoInfo(page,id)).bytes>0);
  });
  await test('old one-photo JSON and local recipes remain readable without eager migration',async page=>{
   await edit(page);await upload(page,0,await picture(page));await save(page);const modern=await exportJSON(page),legacy=fixture();legacy.recipes[0].photo=modern.recipes[0].photos[0];await importJSON(page,legacy);await page.waitForFunction(()=>!!KitchenStorage.load().data.recipes[0].photoId);
   const oldSaved=await stored(page);assert(oldSaved.recipes[0].photoId);assert.equal(oldSaved.recipes[0].photoIds,undefined);assert.equal(await page.locator('#card-photos [data-photo-slot]').count(),2);assert.equal(await page.locator('#card-photos img').count(),1);assert.deepEqual(await exportJSON(page),legacy);await page.reload();assert.deepEqual(await stored(page),oldSaved);
   await edit(page);await page.locator('#item-name').fill('Старая карточка, новое название');await save(page);assert.equal((await stored(page)).recipes[0].photoId,oldSaved.recipes[0].photoId,'A non-photo edit leaves the legacy reference intact');
   await upload(page,1,await picture(page,{color:'#643829'}));await save(page);assert.equal((await ids(page)).filter(Boolean).length,2);assert.equal((await stored(page)).recipes[0].photoId,undefined,'Only explicit photo edit adopts two-slot representation');
   await importJSON(page,fixture());await page.waitForFunction(()=>!KitchenStorage.load().data.recipes[0].photoIds&&!KitchenStorage.load().data.recipes[0].photoId);assert.deepEqual(await stored(page),fixture());
  });
  await test('four print combinations show both photos or no blocks independently of prices',async page=>{
   await edit(page);await upload(page,0,await picture(page));await upload(page,1,await picture(page,{color:'#643829'}));await save(page);await card(page);
   for(const photo of [true,false])for(const prices of [true,false]){await page.locator('#print-photo').setChecked(photo);await page.locator('#show-prices').selectOption(prices?'yes':'no');await page.waitForFunction(()=>!document.querySelector('#print-recipe')?.disabled);assert.equal(await page.locator('#card-photos img').count(),2);await page.emulateMedia({media:'print'});assert.equal(await page.locator('#card-photos').isVisible(),photo);for(const image of await page.locator('#card-photos img').all())assert.equal(await image.isVisible(),photo);assert.equal(await page.locator('.card-cost').count()>0,prices);assert.equal(await page.locator('.card-controls').isVisible(),false);if(!prices)assert.doesNotMatch(await page.locator('#recipe-card').innerText(),/₽|себестоимост/i);await page.pdf({path:`/tmp/kitchen-two-photo-${photo?'photo':'no-photo'}-${prices?'manager':'chef'}.pdf`,format:'A4'});await page.emulateMedia({media:'screen'});}
  });
  await test('quality budget retains 1920px details with bounded memory; EXIF orientation is normalized',async page=>{
   await edit(page);const source=await picture(page,{width:3000,height:2000,detail:true});await upload(page,0,source);const id=(await sourceIds(page))[0],info=await photoInfo(page,id);assert.equal(Math.max(info.width,info.height),1920);assert(info.bytes<=500*1024);assert(info.bytes>0);assert(Math.abs(info.width/info.height-1.5)<.005);
   const quality=await page.evaluate(async ({id,dataUrl})=>{
    const read=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});const decode=src=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=src;});
    const source=await decode(dataUrl),saved=await KitchenPhotos.get(id),current=await decode(await read(saved.blob)),w=current.naturalWidth,h=current.naturalHeight;
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');ctx.drawImage(source,0,0,w,h);const reference=ctx.getImageData(0,0,w,h).data;
    function score(image){ctx.clearRect(0,0,w,h);ctx.drawImage(image,0,0,w,h);const pixels=ctx.getImageData(0,0,w,h).data;let error=0;for(let i=0;i<pixels.length;i+=4)for(let k=0;k<3;k++)error+=(pixels[i+k]-reference[i+k])**2;return 10*Math.log10(255**2/(error/(w*h*3)));}
    const modern=score(current),old=document.createElement('canvas');old.width=1280;old.height=Math.round(1280*source.naturalHeight/source.naturalWidth);old.getContext('2d').drawImage(source,0,0,old.width,old.height);let priorBlob;
    for(const quality of [.84,.72,.6,.48]){priorBlob=await new Promise(resolve=>old.toBlob(resolve,'image/jpeg',quality));if(priorBlob.size<=180*1024)break;}
    const previous=score(await decode(await read(priorBlob)));return {newWidth:w,newHeight:h,newBytes:saved.blob.size,newPSNR:modern,oldWidth:old.width,oldHeight:old.height,oldBytes:priorBlob.size,oldPSNR:previous};
   },{id,dataUrl:'data:'+source.mimeType+';base64,'+source.buffer.toString('base64')});assert(quality.newPSNR>quality.oldPSNR,'More detail than the prior 1280px/180KiB policy on the same deterministic plate');console.log('PHOTO_QUALITY',JSON.stringify(quality));await fs.writeFile(path.join(output,'quality-check.json'),JSON.stringify(quality,null,2)+'\n');
   const jpeg=await picture(page,{width:1200,height:800,mime:'image/jpeg'}),exif=Buffer.from('45786966000049492a0008000000010012010300010000000600000000000000','hex'),header=Buffer.alloc(4);header[0]=255;header[1]=225;header.writeUInt16BE(exif.length+2,2);const oriented={name:'fictional-oriented.jpg',mimeType:'image/jpeg',buffer:Buffer.concat([jpeg.buffer.subarray(0,2),header,exif,jpeg.buffer.subarray(2)])};await upload(page,1,oriented);const normalized=await photoInfo(page,(await sourceIds(page))[1]);assert.equal(normalized.width,800);assert.equal(normalized.height,1200);
   const safeIds=await sourceIds(page),tooManyPixels=await picture(page,{width:100,height:100});tooManyPixels.buffer.writeUInt32BE(10000,16);tooManyPixels.buffer.writeUInt32BE(10000,20);await page.locator(inputId(1)).setInputFiles(tooManyPixels);await page.waitForFunction(()=>document.querySelector('.photo-editor [data-photo-slot=\"1\"] .photo-status')?.textContent.includes('40 мегапикселей'));assert.deepEqual(await sourceIds(page),safeIds,'Oversized dimensions are rejected before decode and preserve both prior images');
  });
  for(const width of [320,390,768,1366])await test(`equal frames, contained images and top controls fit ${width}px`,async page=>{
   await edit(page);await upload(page,0,await picture(page,{width:800,height:1400}));await upload(page,1,await picture(page));await save(page);await guard(page);if(width===390){await page.locator('#item-name').focus();await page.locator('.photo-editor').screenshot({path:path.join(output,'editor-mobile.png')});}await card(page);await guard(page);const frames=await page.locator('#card-photos [data-photo-slot]').evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}));assert(Math.abs(frames[0].width-frames[1].width)<1&&Math.abs(frames[0].height-frames[1].height)<1);if(width>=768)assert(Math.abs(frames[0].y-frames[1].y)<1&&frames[1].x>frames[0].x);for(const img of await page.locator('#card-photos img').all())assert.equal(await img.evaluate(el=>getComputedStyle(el).objectFit),'contain');
   if([390,1366].includes(width)){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(output,width===390?'card-mobile.png':'card-desktop.png'),fullPage:true});await page.locator('#card-photos img').first().click();await page.locator('#photo-viewer').waitFor({state:'visible'});await page.screenshot({path:path.join(output,width===390?'viewer-mobile.png':'viewer-desktop.png')});await page.locator('#photo-viewer-close').click();}
  },{width,mobile:width<768});
 }catch(error){failures.push({name:'runner',error:error.stack||error.message});}
 finally{if(browser)await browser.close();}
 for(const failure of failures)console.error(JSON.stringify(failure));console.log(`${passed} two-photo browser scenarios passed; ${failures.length} failures.`);if(failures.length)process.exitCode=1;
})();
