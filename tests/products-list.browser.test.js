/* Focused Issue #4 checks. scripts/check-preview.mjs supplies a loopback URL.
 * Every scenario uses a fresh browser context and fictional test-namespace data. */
'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const PREVIEW_KEY = 'kitchen-calculator-pr2-browser-test-v1';
const PRODUCTION_KEY = 'kitchen-calculator-v1';
const SENTINEL = '{"fictional":"issue-4-protected-production-placeholder"}';
const testURL = process.env.KITCHEN_TEST_URL;
if (!testURL) throw Error('KITCHEN_TEST_URL must point to a disposable loopback server.');
const target = new URL(testURL);
if (!['http:', 'https:'].includes(target.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) {
  throw Error('Product-list checks may run only against a loopback server.');
}

const LONG_NAME = 'Вымышленный продукт с полным длинным названием для кухонного справочника ' +
  'и дополнительным уточнением сорта, упаковки и назначения ' + 'ДлинноеНазваниеБезПробелов'.repeat(3);
const productId = n => 'fixture-product-' + String(n).padStart(3, '0');
function fixture(count) {
  return {
    version: 1,
    products: Array.from({ length: count }, (_, i) => ({
      id: productId(i + 1),
      name: i === 0 ? 'Рис 001' : i === 1 ? LONG_NAME : 'Продукт ' + String(i + 1).padStart(3, '0'),
      aliases: i === 2 ? 'картофель проверочный' : '',
      price: i === 2 ? null : 120 + i,
      packQuantity: 1,
      unit: 'kg', massPerPiece: null, gramsPerMl: null, note: ''
    })),
    recipes: [
      { id: 'fixture-prep', type: 'prep', name: 'Вымышленный полуфабрикат', note: '', actualYield: null, ingredients: [] },
      { id: 'fixture-dish', type: 'dish', name: 'Вымышленное блюдо', note: '', actualYield: null, ingredients: [] }
    ]
  };
}
const stored = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), PREVIEW_KEY);
const row = (page, n) => page.locator(`[data-open="${productId(n)}"]`);
async function guard(page) {
  assert.equal(await page.evaluate(() => KitchenStorage.KEY), PREVIEW_KEY, 'Only the isolated test namespace is allowed');
  assert.match(await page.locator('.test-notice').innerText(), /ТЕСТ/, 'The test-site warning must be present');
}
async function checkStorageIsolation(page, expectSentinel = true) {
  const proof = await page.evaluate(key => {
    const ops = window.__productListStorageOps.slice();
    return { ops, sentinel: localStorage.getItem(key) };
  }, PRODUCTION_KEY);
  if (expectSentinel) assert.equal(proof.sentinel, SENTINEL, 'The fictional production-key sentinel is unchanged');
  assert(proof.ops.length > 0 && proof.ops.every(op => op.method !== 'clear' && op.key === PREVIEW_KEY), 'Application storage operations remain inside the test namespace');
}
async function listStyles(page) {
  return page.locator('#library-list').evaluate(list => {
    const css = getComputedStyle(list);
    return { display: css.display, overflowX: css.overflowX, overflowY: css.overflowY, maxHeight: css.maxHeight };
  });
}
async function noHorizontalOverflow(page) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'The page must not scroll horizontally');
  assert(await page.locator('#library-list').evaluate(list => list.scrollWidth <= list.clientWidth + 1), 'The product list must not scroll horizontally');
}
async function selection(page, n, key) {
  await row(page, n).focus();
  await row(page, n).press(key);
  assert(await row(page, n).evaluate(button => button.classList.contains('active')), key + ' selects the row');
  assert.equal(await row(page, n).getAttribute('aria-current'), 'true');
  assert.equal(await page.locator('.product-row.active').count(), 1, 'Selection remains unique');
  assert.equal(await page.locator('#item-name').inputValue(), fixture(n).products[n - 1].name);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.open), productId(n), 'Keyboard focus remains on the selected row');
}

let browser;
let passed = 0;
const failures = [];
const dimensions = new Map();
async function scenario(width, count) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  await context.addInitScript(() => {
    window.__productListStorageOps = [];
    for (const method of ['getItem', 'setItem', 'removeItem', 'clear']) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function (...args) {
        window.__productListStorageOps.push({ method, key: args[0] });
        return original.apply(this, args);
      };
    }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  try {
    await page.goto(testURL);
    await guard(page);
    await checkStorageIsolation(page, false);
    await page.evaluate(({ key, productionKey, sentinel, data }) => {
      localStorage.setItem(productionKey, sentinel);
      localStorage.setItem(key, JSON.stringify(KitchenStorage.validate(data)));
    }, { key: PREVIEW_KEY, productionKey: PRODUCTION_KEY, sentinel: SENTINEL, data: fixture(count) });
    await page.reload();
    await guard(page);
    const originalStyles = await listStyles(page);
    await page.locator('[data-tab="products"]').click();
    assert.equal(await page.locator('.workspace').getAttribute('data-section'), 'products');
    assert.equal(await page.locator('.product-row').count(), count);
    assert.equal(await page.locator('#library-list').getAttribute('role'), 'region');
    assert.equal(await page.locator('#library-list').getAttribute('aria-labelledby'), 'section-title');
    assert.equal(await page.locator('#library-list').getAttribute('tabindex'), '0');

    const sizes = await page.locator('#library-list').evaluate(list => {
      const css = getComputedStyle(list), box = list.getBoundingClientRect();
      return { height: box.height, clientHeight: list.clientHeight, scrollHeight: list.scrollHeight,
        overflowY: css.overflowY, pageHeight: document.documentElement.scrollHeight, viewport: innerHeight };
    });
    assert(sizes.height > 0 && sizes.height <= sizes.viewport * 0.65, 'The list occupies a bounded part of the viewport');
    assert(['auto', 'scroll'].includes(sizes.overflowY), 'Vertical scrolling belongs to the list');
    if (count >= 100) assert(sizes.scrollHeight > sizes.clientHeight, 'Long product lists scroll internally');
    dimensions.set(`${width}/${count}`, sizes);

    const normal = await row(page, 1).evaluate(button => {
      const name = button.querySelector('strong'), price = button.querySelector('small');
      const a = name.getBoundingClientRect(), b = price.getBoundingClientRect();
      return { height: button.getBoundingClientRect().height, nameRight: a.right, priceLeft: b.left,
        nameTop: a.top, nameBottom: a.bottom, priceTop: b.top, priceBottom: b.bottom,
        nameFont: parseFloat(getComputedStyle(name).fontSize), priceFont: parseFloat(getComputedStyle(price).fontSize),
        price: price.textContent };
    });
    assert(normal.height >= 44, 'Product rows retain a touch target of at least 44px');
    assert(normal.nameFont >= 14 && normal.priceFont >= 12, 'Product names and prices remain readable');
    assert(normal.nameRight <= normal.priceLeft, 'Name and price have separate horizontal columns');
    assert(Math.min(normal.nameBottom, normal.priceBottom) > Math.max(normal.nameTop, normal.priceTop), 'A short name and its price share one row');
    assert.match(normal.price, /₽.*\/.*г/, 'The existing per-base-unit price remains visible');
    assert.equal(await row(page, 3).locator('small').innerText(), 'Нет цены', 'Missing prices remain explicit');

    const long = await row(page, 2).locator('strong').evaluate(name => {
      const css = getComputedStyle(name), box = name.getBoundingClientRect();
      const range = document.createRange(); range.selectNodeContents(name);
      return { text: name.textContent, height: box.height, lineHeight: parseFloat(css.lineHeight),
        textOverflow: css.textOverflow, whiteSpace: css.whiteSpace, clientHeight: name.clientHeight,
        scrollHeight: name.scrollHeight, left: box.left, right: box.right, top: box.top, bottom: box.bottom,
        textBoxes: Array.from(range.getClientRects(), rect => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom })) };
    });
    assert.equal(long.text, LONG_NAME, 'The complete stored name is rendered');
    assert(long.height > long.lineHeight * 1.8, 'A long name wraps onto multiple visible lines');
    assert.notEqual(long.textOverflow, 'ellipsis');
    assert.notEqual(long.whiteSpace, 'nowrap');
    assert(long.scrollHeight <= long.clientHeight + 1, 'The wrapped name is not vertically clipped');
    assert(long.textBoxes.every(box => box.left >= long.left - 1 && box.right <= long.right + 1 && box.bottom <= long.bottom + 1), 'Every wrapped text fragment stays visible inside the name cell');
    await noHorizontalOverflow(page);

    const controlsBefore = await page.locator('.search-label').evaluate(label => ({ search: label.getBoundingClientRect().top, create: document.querySelector('#create').getBoundingClientRect().top }));
    await page.locator('#library-list').evaluate(list => { list.scrollTop = list.scrollHeight; });
    const last = await row(page, count).evaluate(button => {
      const list = button.parentElement, box = list.getBoundingClientRect(), item = button.getBoundingClientRect();
      return { top: item.top, bottom: item.bottom, listTop: box.top, listBottom: box.bottom, scrollTop: list.scrollTop };
    });
    assert(last.scrollTop > 0, 'The final product is reached through internal scrolling');
    assert(last.top >= last.listTop - 1 && last.bottom <= last.listBottom + 1, 'The final product is fully reachable within the list');
    const controlsAfter = await page.locator('.search-label').evaluate(label => ({ search: label.getBoundingClientRect().top, create: document.querySelector('#create').getBoundingClientRect().top }));
    assert.deepEqual(controlsAfter, controlsBefore, 'Scrolling products leaves search and creation controls in place');
    await noHorizontalOverflow(page);
    await row(page, count).click();
    assert.equal(await row(page, count).getAttribute('aria-current'), 'true', 'The last visible row can be selected');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.open), productId(count), 'Clicking the last product retains row focus');
    const selectedScrollTop = await page.locator('#library-list').evaluate(list => list.scrollTop);
    assert(Math.abs(selectedScrollTop - last.scrollTop) <= 2, 'Selecting the last product preserves the internal scroll position');

    await selection(page, 3, 'Enter');
    await selection(page, 4, 'Space');
    const selectedColors = await page.evaluate(() => ({
      active: getComputedStyle(document.querySelector('.product-row.active')).backgroundColor,
      other: getComputedStyle(document.querySelector('.product-row:not(.active)')).backgroundColor
    }));
    assert.notEqual(selectedColors.active, selectedColors.other, 'The active product is visually highlighted');

    const lastName = fixture(count).products[count - 1].name;
    await page.locator('#library-search').fill(lastName);
    assert.equal(await page.locator('[data-open]').count(), 1, 'Search filters the existing list');
    await row(page, count).click();
    assert.equal(await page.locator('#item-name').inputValue(), lastName, 'A search result opens the product');
    await page.locator('#library-search').fill('картоф');
    assert.equal(await page.locator('[data-open]').count(), 1, 'Existing aliases remain searchable');
    assert.equal(await page.locator('[data-open]').getAttribute('data-open'), productId(3));
    await page.locator('#library-search').fill('');

    const beforeCreate = await stored(page);
    await page.locator('#create').click();
    await page.locator('#item-name').fill('Вымышленный новый продукт');
    await page.locator('#price').fill('250');
    await page.locator('#packQuantity').fill('1');
    await page.locator('#product-unit').selectOption('kg');
    await page.locator('#save-item').click();
    await page.locator('#save-item').click();
    assert.equal(await page.locator('#save-item').innerText(), 'Сохранено ✓');
    let data = await stored(page);
    assert.equal(data.products.length, beforeCreate.products.length + 1, 'Repeated saving creates only one product');
    const created = data.products.find(product => product.name === 'Вымышленный новый продукт');
    assert(created, 'A new product persists');
    await page.locator('#item-name').fill('Вымышленный изменённый продукт');
    await page.locator('#price').fill('300');
    await page.locator('#save-item').click();
    data = await stored(page);
    assert.equal(data.products.find(product => product.id === created.id).price, 300);
    assert.equal(data.products.length, count + 1, 'Editing updates the existing record');
    assert.deepEqual(data.products.filter(product => product.id !== created.id), beforeCreate.products, 'Existing products are preserved');
    assert.deepEqual(data.recipes, beforeCreate.recipes, 'Product-list changes preserve recipes');
    await checkStorageIsolation(page);
    await page.reload();
    await guard(page);
    await page.locator('[data-tab="products"]').click();
    await page.locator(`[data-open="${created.id}"]`).click();
    assert.equal(await page.locator('#item-name').inputValue(), 'Вымышленный изменённый продукт');
    assert.equal(await page.locator('#price').inputValue(), '300');

    for (const section of ['prep', 'dish']) {
      await page.locator(`[data-tab="${section}"]`).click();
      assert.equal(await page.locator('.workspace').getAttribute('data-section'), section);
      assert.equal(await page.locator('.product-row').count(), 0, 'Product row styling is scoped to products');
      assert.equal(await page.locator('#library-list').getAttribute('role'), null);
      assert.equal(await page.locator('#library-list').getAttribute('tabindex'), null);
      assert.deepEqual(await listStyles(page), originalStyles, 'Other sections retain their original list layout');
    }
    await checkStorageIsolation(page);
    assert.deepEqual(errors, [], 'No application JavaScript exceptions');
    console.log(`PASS compact products: ${count} records, ${width}px`);
    passed++;
  } catch (error) {
    failures.push({ width, count, error: error.stack || error.message });
    console.error(`FAIL compact products: ${count} records, ${width}px: ${error.message}`);
  } finally {
    await context.close();
  }
}

(async () => {
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    for (const width of [360, 390, 430, 1366]) {
      for (const count of [12, 100, 500]) await scenario(width, count);
      const samples = [12, 100, 500].map(count => dimensions.get(`${width}/${count}`)).filter(Boolean);
      if (samples.length === 3) {
        for (const metric of ['height', 'pageHeight']) {
          const values = samples.map(sample => sample[metric]);
          // A three-digit tab counter may wrap at the narrowest viewport.
          // The list itself stays fixed, and growing 100 to 500 rows never grows the page.
          const tolerance = metric === 'height' ? 2 : 16;
          if (Math.max(...values) - Math.min(...values) > tolerance || Math.abs(values[1] - values[2]) > 2) {
            failures.push({ width, error: `${metric} grows with product count: ${values.join(', ')}` });
          }
        }
      }
    }
  } catch (error) {
    failures.push({ error: error.stack || error.message });
  } finally {
    if (browser) await browser.close();
  }
  if (failures.length) {
    for (const failure of failures) console.error(JSON.stringify(failure));
    process.exitCode = 1;
  }
  console.log(`${passed}/12 compact product-list browser scenarios passed; ${failures.length} failures.`);
})();
