'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {chromium} = require('playwright');
const {start} = require('./helpers/runtime-server');
const {guard} = require('./helpers/release-storage-guard');
const fixture = require('./helpers/design-fixture');
const KEY = 'kitchen-calculator-sintez-presentation-seen-v1';
const keys = {...JSON.parse(process.env.KITCHEN_SINTEZ_KEYS || JSON.stringify({book:'kitchen-calculator-pr2-browser-test-v1',drafts:'kitchen-calculator-pr2-browser-drafts-v1',photos:'kitchen-calculator-test-photos-v1',backups:'kitchen-calculator-test-import-backups-v1',appearance:'kitchen-calculator-appearance-test-v1'})), extraLocal:[KEY]};
const output = process.env.KITCHEN_INTRO_ARTIFACTS || path.join(os.tmpdir(), 'sintez-intro-proof');
const launch = {executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']};
let browser, server, url;
const proof = [];
const intro = page => page.locator('#sintez-presentation');
const title = page => page.locator('.sx-intro-slide.is-active h2');
const raw = page => page.evaluate(() => localStorage.getItem(KitchenStorage.KEY));
const ready = page => page.waitForFunction(() => !!document.querySelector('#sintez-presentation-replay') && !!window.KitchenNavigation);

async function seed(context, records = {}) {
  const page = await context.newPage(), target = new URL('__intro_fixture__', url).href;
  await page.route(target, route => route.fulfill({contentType:'text/html',body:'<!doctype html><title>Synthetic test only</title>'}));
  await page.goto(target);
  await page.evaluate(records => { for (const [key,value] of Object.entries(records)) localStorage.setItem(key,value); }, records);
  await page.close();
}
async function open({width = 1366, height = 900, records = {}, suffix = '', init, reducedMotion = 'no-preference', readOnly = []} = {}) {
  const context = await browser.newContext({viewport:{width,height},isMobile:width < 768,hasTouch:width < 768,reducedMotion});
  await context.route('**/favicon.ico', route => route.fulfill({status:204,body:''}));
  await seed(context, records);
  const errors = [], violations = [];
  await guard(context, {...keys,readOnly}, violations);
  if (init) await context.addInitScript(init, {KEY,keys});
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
  await page.goto(url + suffix); await ready(page);
  return {context,page,errors,violations};
}
async function test(name, action, options) {
  const state = await open(options);
  try {
    await action(state);
    assert.deepEqual(state.errors, [], 'console/page errors');
    assert.deepEqual(state.violations, [], 'foreign database access');
    assert(await state.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'horizontal page overflow');
    proof.push({name,passed:true});console.log('PASS INTRO:', name);
  } finally { await state.context.close(); }
}
async function skip(page) {
  await page.locator('[data-intro-skip]').click();
  await page.waitForFunction(() => !document.querySelector('#sintez-presentation').open && !history.state?.sintezPresentationV1);
}
async function settings(page) { await page.locator('#sintez-shell [data-sintez-route=settings]').click(); }

(async () => {
  await fs.mkdir(output, {recursive:true});
  if (process.env.KITCHEN_INTRO_URL) {
    url = process.env.KITCHEN_INTRO_URL;
    assert.equal(url, 'https://sobaca0808-bit.github.io/kitchen-calculator-test/sintez-intro/');
  } else {
    server = await start(process.env.KITCHEN_SINTEZ_RUNTIME_ROOT || path.resolve(__dirname,'..'), {home:true});
    url = server.url;
  }
  browser = await chromium.launch(launch);
  for (const [width,height] of [[1366,900],[1024,768],[768,1024],[390,844],[320,690],[844,390]]) {
    await test('four full approved images, readable controls and navigation at ' + width + 'x' + height, async ({page}) => {
      assert(await intro(page).isVisible());
      assert.equal(await page.locator('[data-intro-slide]').count(),4);
      const names = ['СИНТЕЗ МЕРЫ','Для дома','Для повара','Для бизнеса'];
      for (let i = 0; i < names.length; i++) {
        await page.locator('[data-intro-dot]').nth(i).click();
        assert.equal(await title(page).textContent(), names[i]);
        const photo = page.locator('.sx-intro-slide.is-active img');
        await photo.evaluate(img => img.decode());
        const sizes = await photo.evaluate(img => ({nw:img.naturalWidth,nh:img.naturalHeight,w:img.getBoundingClientRect().width,h:img.getBoundingClientRect().height,fit:getComputedStyle(img).objectFit}));
        assert.equal(sizes.nw,1672);assert.equal(sizes.nh,941);assert.equal(sizes.fit,'contain');
        assert(Math.abs(sizes.w / sizes.h - 1672 / 941) < .005, 'photo proportions');
        for (const control of await page.locator('#sintez-presentation button:visible').all()) {
          const box = await control.boundingBox();assert(box.width >= 44 && box.height >= 44, '44px touch target');
        }
        if ([1366,390].includes(width)) await page.screenshot({path:path.join(output, 'slide-' + (i+1) + '-' + width + '.png'),animations:'disabled'});
      }
      assert.match(await page.locator('[data-intro-next]').textContent(), /Начать работу/);
      await page.keyboard.press('Home');assert.equal(await title(page).textContent(),names[0]);
      assert(await page.locator('[data-intro-previous]').isDisabled());
      await page.keyboard.press('ArrowRight');assert.equal(await title(page).textContent(),names[1]);
      await page.locator('[data-intro-previous]').click();assert.equal(await title(page).textContent(),names[0]);
      await page.keyboard.press('End');await page.locator('[data-intro-next]').click();
      await page.waitForFunction(() => !history.state?.sintezPresentationV1);
      assert(await intro(page).isHidden());assert.equal(await raw(page),null);
      assert.equal(await page.locator('.sintez-grid button').count(),6);
      assert.equal(await page.evaluate(KEY => localStorage.getItem(KEY),KEY),'seen');
      if ([1366,390].includes(width)) await page.screenshot({path:path.join(output,'home-'+width+'.png'),fullPage:true});
      await page.reload();assert(await intro(page).isHidden());assert.equal(await raw(page),null);
    }, {width,height});
  }
  await test('skip, reload and settings replay do not create a database', async ({page}) => {
    await skip(page);assert.equal(await raw(page),null);
    await page.reload();assert(await intro(page).isHidden());
    await settings(page);await page.locator('#sintez-presentation-replay').click();assert(await intro(page).isVisible());
    await skip(page);assert(await page.locator('#sintez-settings').isVisible());assert.equal(await raw(page),null);
  });
  await test('browser back/forward and Escape preserve replay context and focus', async ({page}) => {
    await skip(page);await settings(page);await page.locator('#sintez-presentation-replay').click();
    await page.goBack();assert(await intro(page).isHidden());assert(await page.locator('#sintez-settings').isVisible());
    assert.equal(await page.evaluate(() => document.activeElement.id),'sintez-presentation-replay');
    await page.goForward();assert(await intro(page).isVisible());
    await page.keyboard.press('Escape');await page.waitForFunction(() => !history.state?.sintezPresentationV1);
    assert(await intro(page).isHidden());assert(await page.locator('#sintez-settings').isVisible());
    assert.equal(await page.evaluate(() => document.activeElement.id),'sintez-presentation-replay');
  });
  for (const section of ['dish','prep','products','packaging','expenses','settings']) {
    await test('direct link bypasses welcome: '+section, async ({page}) => {
      assert(await intro(page).isHidden());assert.equal(await raw(page),null);
      if (section === 'settings') assert(await page.locator('#sintez-settings').isVisible());
      else assert.equal(await page.locator('.workspace').getAttribute('data-section'),section);
    }, {suffix:'?section='+section});
  }
  await test('storage diagnostics and import entry bypass welcome', async ({page}) => {
    assert(await intro(page).isHidden());assert.equal(await page.evaluate(() => location.hash),'#storage-diagnostics');
    assert.equal(await raw(page),null);
  }, {suffix:'#storage-diagnostics',readOnly:['kitchen-calculator-preview-v1','kitchen-calculator-preview-drafts-v1','kitchen-calculator-pr2-browser-test-v1','kitchen-calculator-pr2-browser-drafts-v1','kitchen-calculator-v1','kitchen-calculator-drafts-v1']});
  for (const [label,records] of [
    ['saved recipe database',{[keys.book]:JSON.stringify(fixture())}],
    ['empty saved database',{[keys.book]:JSON.stringify({version:1,products:[],recipes:[]})}],
    ['damaged database',{[keys.book]:'{broken JSON kept intact'}],
    ['draft only',{[keys.drafts]:'{"version":1,"items":[]}'}],
    ['saved appearance',{[keys.appearance]:'sage'}],
    ['unknown presentation marker',{[KEY]:'future-compatible-marker'}]
  ]) await test(label+' is not mistaken for a new user', async ({page}) => {
    assert(await intro(page).isHidden());
    for (const [key,value] of Object.entries(records)) assert.equal(await page.evaluate(key => localStorage.getItem(key),key),value);
  }, {records});
  await test('a blocked localStorage read never triggers first-run welcome', async ({page}) => {
    assert(await intro(page).isHidden());
  }, {init:() => {const native=Storage.prototype.getItem;Storage.prototype.getItem=function(key){if(key===window.KitchenStorage?.KEY || key.includes('sintez-preview'))throw new DOMException('Read denied','SecurityError');return native.call(this,key);};}});
  await test('an unreadable welcome marker does not touch or initialize the database', async ({page}) => {
    assert(await intro(page).isHidden());assert.equal(await raw(page),null);
  }, {init:({KEY}) => {const native=Storage.prototype.getItem;Storage.prototype.getItem=function(key){if(key===KEY)throw new DOMException('Read denied','SecurityError');return native.call(this,key);};}});
  await test('quota failure remembers nothing but still opens calculator safely', async ({page}) => {
    await skip(page);assert(await intro(page).isHidden());assert.equal(await raw(page),null);
    assert.match(await page.locator('#sintez-status').textContent(),/Не удалось запомнить/);
    assert.equal(await page.evaluate(KEY => localStorage.getItem(KEY),KEY),null);
  }, {init:({KEY}) => {const native=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key===KEY)throw new DOMException('Full','QuotaExceededError');return native.call(this,key,value);};}});
  await test('touch swipe changes one slide and does not treat vertical scroll as navigation', async ({context,page}) => {
    const touch=await context.newCDPSession(page);
    async function swipe(x,y,dx,dy) {
      await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
      for(let step=1;step<=4;step++)await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*step/4,y:y+dy*step/4}]});
      await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }
    await swipe(260,120,-180,5);assert.equal(await title(page).textContent(),'Для дома');
    await swipe(200,120,-20,140);assert.equal(await title(page).textContent(),'Для дома');
  }, {width:390,height:844});
  await test('reduced motion, keyboard focus, autoplay pause and fullscreen controls', async ({page}) => {
    assert.equal(await page.locator('.sx-intro-slide').first().evaluate(el => getComputedStyle(el).transitionDuration),'0s');
    await page.keyboard.press('Tab');assert.notEqual(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle),'none');
    await page.clock.install();
    await page.locator('[data-intro-play]').click();assert.equal(await page.locator('[data-intro-play]').getAttribute('aria-pressed'),'true');
    await page.clock.runFor(6001);assert.equal(await title(page).textContent(),'Для дома');
    await page.locator('[data-intro-play]').click();assert.equal(await page.locator('[data-intro-play]').getAttribute('aria-pressed'),'false');
    const full=page.locator('[data-intro-fullscreen]');if(await full.isVisible()) {
      await full.click();await page.waitForFunction(() => !!document.fullscreenElement);await full.click();await page.waitForFunction(() => !document.fullscreenElement);
    }
  }, {reducedMotion:'reduce'});
  await test('loaded slides and existing calculator keep working when connectivity disappears', async ({context,page}) => {
    for(const img of await page.locator('.sx-intro-slide img').all()) await img.evaluate(img=>{img.loading='eager';return img.decode();});
    // This route is not a new PWA. Exercise an already-loaded workspace,
    // including its theme assets, rather than promise an offline cold start.
    await skip(page);await page.locator('[data-sintez-route=products]').click();
    await page.waitForLoadState('networkidle');
    await page.locator('#sintez-workbar [data-sintez-home]').click();await settings(page);
    await page.locator('#sintez-presentation-replay').click();
    await context.setOffline(true);
    await page.keyboard.press('End');assert.equal(await title(page).textContent(),'Для бизнеса');await skip(page);
    await page.locator('#sintez-settings [data-sintez-home]').click();
    await page.locator('[data-sintez-route=products]').click();assert.equal(await page.locator('.workspace').getAttribute('data-section'),'products');assert.equal(await raw(page),null);
  });
  await test('replay preserves an unsaved recipe, draft and existing library', async ({page}) => {
    const before=await raw(page);
    await page.locator('[data-sintez-route=recipes]').click();await page.locator('[data-open=pie]').click();
    await page.locator('#edit-recipe').click();await page.locator('#technology').fill('Черновик после презентации');
    await page.locator('#sintez-workbar [data-sintez-home]').click();await settings(page);
    const drafts=await page.evaluate(()=>localStorage.getItem(KitchenDrafts.KEY));
    await page.locator('#sintez-presentation-replay').click();await skip(page);
    assert.equal(await raw(page),before);assert.equal(await page.evaluate(()=>localStorage.getItem(KitchenDrafts.KEY)),drafts);
    await page.locator('#sintez-settings [data-sintez-home]').click();await page.locator('#sintez-resume').click();
    assert.equal(await page.locator('#technology').inputValue(),'Черновик после презентации');
    await page.reload();assert(await intro(page).isHidden());
    await page.locator('[data-restore-draft=pie]').click();
    assert.equal(await page.locator('#technology').inputValue(),'Черновик после презентации');assert.equal(await raw(page),before);
  }, {records:{[keys.book]:JSON.stringify(fixture())}});
  // A real browser process/profile restart, not just a new tab or reload.
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'intro-restart-'));
  try {
    for(let cycle=0;cycle<2;cycle++) {
      const context=await chromium.launchPersistentContext(profile,{...launch,viewport:{width:390,height:844},isMobile:true,hasTouch:true});
      try {
        await context.route('**/favicon.ico',r=>r.fulfill({status:204,body:''}));
        const violations=[];await guard(context,keys,violations);const page=await context.newPage();await page.goto(url);await ready(page);
        if(cycle===0){assert(await intro(page).isVisible());await skip(page);}
        else {assert(await intro(page).isHidden());assert.equal(await page.evaluate(KEY=>localStorage.getItem(KEY),KEY),'seen');assert.equal(await raw(page),null);}
        assert.deepEqual(violations,[]);
      } finally {await context.close();}
    }
    proof.push({name:'full Chrome process restart retains presentation choice without creating a database',passed:true});
  } finally {await fs.rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
  await fs.writeFile(path.join(output,'intro-proof.json'),JSON.stringify({url,passed:proof.length,physicalAndroidTested:false,offlineColdStartSupported:false,scenarios:proof},null,2)+'\n');
  console.log(proof.length+' INTRO scenarios passed; 0 failures.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();await server?.close();});
