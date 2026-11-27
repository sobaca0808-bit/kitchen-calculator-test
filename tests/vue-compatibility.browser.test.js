'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('playwright');
const {start} = require('./helpers/pwa-server');
const fixture = require('./helpers/unified-fixture');

async function exportFile(page) {
  await page.locator('.sintez-settings-access').click();
  const event = page.waitForEvent('download');
  await page.locator('#export').click();
  return JSON.parse(await fs.readFile(await (await event).path(),'utf8'));
}
async function importFile(page, data) {
  await page.locator('.sintez-settings-access').click();
  await page.locator('#import-file').setInputFiles({name:'round-trip.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
  await page.waitForFunction(()=>!document.querySelector('#import-apply').disabled);
  await page.locator('#import-apply').click();
  await page.waitForFunction(()=>document.querySelector('#import-panel').hidden);
}
async function main() {
  const [oldRoot,newRoot]=process.argv.slice(2);
  const old=await start([oldRoot]);
  const identity=JSON.parse(await fs.readFile(path.join(newRoot,'pwa-version.json'),'utf8'));
  const latest=await start([newRoot],{mount:identity.manifest_id});
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  try {
    const context=await browser.newContext({viewport:{width:800,height:1000},hasTouch:true});
    const errors=[];
    context.on('page',p=>{p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());});
    const source=await context.newPage();
    await source.goto(old.url+'?section=dish');
    await source.evaluate(data=>{const saved=KitchenStorage.save(data);if(!saved.ok)throw Error(saved.error);},fixture());
    await source.reload();
    // Use the real photo editor and old export UI for a portable reference.
    await source.locator('[data-sintez-mode=business]').click();
    await source.locator('[data-open=risotto]').click();
    await source.locator('#edit-recipe').click();
    await source.locator('#photo-file').setInputFiles(path.join(__dirname,'fixtures/risotto.webp'));
    await source.waitForFunction(()=>document.querySelector('#photo-editor img')?.naturalWidth>0 && !document.querySelector('#photo-file').disabled);
    await source.locator('#save-item').click();
    const original=await exportFile(source);
    assert(original.recipes.some(r=>r.photo?.dataUrl||r.photos?.some(Boolean)||r.photo?.dataURL));
    const page=await context.newPage();
    await page.goto(latest.url+'?section=dish');
    assert.match(await page.evaluate(()=>window.KitchenVueVersion),/^3\./);
    await importFile(page,original);
    await page.reload();
    const returned=await exportFile(page);
    assert.deepEqual(returned,original);
    const fresh=await browser.newContext();
    const back=await fresh.newPage();back.on('dialog',d=>d.accept());
    await back.goto(old.url+'?section=dish');
    await importFile(back,returned);
    assert.deepEqual(await exportFile(back),original);
    await fresh.close();
    // Wait for checksum-verified precaching and a controlled navigation.
    await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
    await page.reload();
    assert(await page.evaluate(()=>!!navigator.serviceWorker.controller));
    await context.setOffline(true);
    await page.goto(latest.url+'?mode=business&tool=recipes');
    await page.locator('[data-open=risotto]').click();
    await page.locator('.photo-open').first().click();
    await page.locator('#photo-viewer[open] img').waitFor();
    await page.locator('#photo-zoom-in').click();
    assert.equal(await page.locator('#photo-zoom-value').innerText(),'140%');
    await page.keyboard.press('Escape');
    await page.locator('#photo-viewer').waitFor({state:'detached'});
    await page.locator('.sintez-settings-access').click();
    for(const theme of ['berry','sage','graphite']){
      await page.evaluate(theme=>KitchenAppearance.select(theme),theme);
      await page.reload();
      assert.equal(await page.evaluate(()=>KitchenAppearance.current()),theme);
    }
    assert.deepEqual(errors,[]);
    console.log('PASS PR44 → Vue → PR44 full JSON/photo, tablet, offline reload, lazy photo zoom, themes');
  }finally{await browser.close();await Promise.all([old.close(),latest.close()]);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
