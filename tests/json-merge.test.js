'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Merge = require('../js/json-merge.js');
const Storage = require('../js/storage.js');
const Calc = require('../js/calculations.js');
const clone = value => JSON.parse(JSON.stringify(value));
const empty = () => ({version: 1, products: [], recipes: []});
const product = (id = 'raw', name = 'Тестовое сырьё', price = 100) => ({id, name, aliases: '', price, packQuantity: 1,
  unit: 'kg', massPerPiece: null, gramsPerMl: null, note: ''});
const row = (id, refId, quantity = 100) => ({id, refId, quantity, unit: 'g', lossPercent: null, outputGrams: null, note: ''});
function fixture() {
  return {version: 1, products: [product()], folders: [{id: 'folder', name: 'Тестовые блюда'}],
    packaging: [{id: 'box', name: 'Тестовый контейнер', price: 10, packQuantity: 1, unit: 'pcs', note: ''}],
    recipes: [
      {id: 'prep', type: 'prep', name: 'Тестовый полуфабрикат', note: '', technology: 'Подготовить.', actualYield: 800,
        ingredients: [row('prep-row', 'raw', 1000)]},
      {id: 'dish', type: 'dish', name: 'Тестовое блюдо', note: '', technology: 'Собрать.', portions: 2,
        sellingPrice: 300, actualYield: 200, folderId: 'folder', ingredients: [row('dish-row', 'prep', 200)],
        packaging: [{id: 'dish-box', refId: 'box', ingredientRefId: 'raw', quantity: 1, unit: 'pcs', costMode: 'auto', freeForGuest: false}]}
    ]};
}
async function resolve(base, incoming, value = 'both', choices = {}) {
  let plan;
  for (let step = 0; step < 20; step++) {
    plan = await Merge.plan(base, incoming, {choices});
    if (!plan.unresolved) return plan;
    for (const conflict of plan.conflicts) if (!conflict.resolved) {
      choices[conflict.key] = typeof value === 'function' ? value(conflict) : value;
    }
  }
  throw Error('Unexpected non-converging conflict plan');
}
const byId = (data, id) => [...(data.folders || []), ...data.products, ...(data.packaging || []), ...data.recipes].find(item => item.id === id);

test('empty libraries and old JSON without optional fields retain their exact shape', async () => {
  const original = empty();
  const plan = await Merge.plan(original, empty());
  assert.equal(plan.ready, true);assert.deepEqual(plan.data, original);
  assert.deepEqual(plan.changes, {added: 0, updated: 0, skipped: 0, removed: 0, conflicts: 0});
  const old = {version: 1, products: [product()], recipes: [{id: 'old', type: 'dish', name: 'Старое блюдо', note: '', actualYield: null, ingredients: [row('old-row', 'raw')]}]};
  const merged = await Merge.plan(empty(), old);
  assert.deepEqual(merged.data, old);
  assert.equal(Object.hasOwn(merged.data, 'folders'), false);
  assert.equal(Object.hasOwn(merged.data.recipes[0], 'folderId'), false);
});

test('all linked kinds are added with valid relations and no input mutation', async () => {
  const base = empty(), incoming = fixture(), before = JSON.stringify(incoming);
  const plan = await Merge.plan(base, incoming);
  assert.equal(plan.ready, true);assert.equal(plan.changes.added, 5);
  assert.deepEqual(plan.data, incoming);assert.deepEqual(Storage.validate(plan.data), incoming);
  assert.equal(JSON.stringify(incoming), before);assert.deepEqual(base, empty());
  assert.equal(Calc.calcRecipe(plan.data, 'dish').knownCost, 25);
});

test('reimport of the same unchanged file is a no-op without new IDs', async () => {
  const incoming = fixture(), first = await Merge.plan(empty(), incoming);
  const second = await Merge.plan(first.data, incoming);
  assert.equal(second.ready, true);assert.equal(second.changes.added, 0);assert.equal(second.changes.skipped, 5);
  assert.deepEqual(second.data, first.data);assert.deepEqual(second.conflicts, []);
});

test('different prices expose product and both affected recipe conflicts before applying anything', async () => {
  const base = fixture(), incoming = fixture();incoming.products[0].price = 500;
  const plan = await Merge.plan(base, incoming);
  assert.equal(plan.ready, false);assert.equal(plan.data, null);assert.equal(plan.unresolved, 3);
  assert.deepEqual(plan.conflicts.map(item => item.key), ['product:raw', 'prep:prep', 'dish:dish']);
  assert(plan.conflicts.every(item => item.options.join() === 'local,both' && item.choice === null));
  assert.equal(base.products[0].price, 100);assert.equal(Calc.calcRecipe(base, 'dish').knownCost, 25);
});

test('keeping both versions preserves original costs and maps the whole incoming dependency graph', async () => {
  const base = fixture(), incoming = fixture();incoming.products[0].price = 500;
  const plan = await resolve(base, incoming);
  assert.equal(plan.ready, true);assert.equal(plan.changes.added, 3);assert.equal(plan.changes.updated, 0);
  for (const item of [...base.products, ...base.recipes]) assert.deepEqual(byId(plan.data, item.id), item);
  const importedRaw = byId(plan.data, plan.idMap.raw), importedPrep = byId(plan.data, plan.idMap.prep), importedDish = byId(plan.data, plan.idMap.dish);
  assert.equal(importedRaw.price, 500);assert.notEqual(importedRaw.id, 'raw');assert.match(importedRaw.name, /импорт/);
  assert.equal(importedPrep.ingredients[0].refId, importedRaw.id);
  assert.equal(importedDish.ingredients[0].refId, importedPrep.id);
  assert.equal(importedDish.packaging[0].ingredientRefId, importedRaw.id);
  assert.equal(importedDish.folderId, 'folder');
  assert.equal(Calc.calcRecipe(plan.data, 'dish').knownCost, 25);
  assert.equal(Calc.calcRecipe(plan.data, importedDish.id).knownCost, 125);
  assert.doesNotThrow(() => Storage.validate(plan.data));
});

test('repeated keep-both import recognizes derived identities and never grows copies', async () => {
  const base = fixture(), incoming = fixture();incoming.products[0].price = 500;
  const first = await resolve(base, incoming);
  const second = await Merge.plan(first.data, incoming);
  assert.equal(second.ready, true);assert.deepEqual(second.conflicts, []);
  assert.equal(second.changes.added, 0);assert.deepEqual(second.data, first.data);
  assert.equal(second.idMap.raw, first.idMap.raw);assert.equal(second.idMap.prep, first.idMap.prep);assert.equal(second.idMap.dish, first.idMap.dish);
  const third = await Merge.plan(second.data, incoming);assert.deepEqual(third.data, first.data);
});

test('skipping a price conflict leaves current data and dependent recipes exactly unchanged', async () => {
  const base = fixture(), incoming = fixture();incoming.products[0].price = 700;
  const plan = await Merge.plan(base, incoming, {choices: {'product:raw': 'local'}});
  assert.equal(plan.ready, true);assert.deepEqual(plan.data, base);
  assert.equal(plan.conflicts.length, 1);assert.equal(plan.changes.added, 0);
});

test('same names with a different ingredient amount are conflicts rather than assumed duplicates', async () => {
  const base = fixture(), incoming = fixture();incoming.recipes[1].id = 'other-dish';incoming.recipes[1].ingredients[0].id = 'other-row';
  incoming.recipes[1].packaging[0].id = 'other-box';incoming.recipes[1].ingredients[0].quantity = 300;
  const preview = await Merge.plan(base, incoming);
  assert.equal(preview.ready, false);assert.equal(preview.conflicts.length, 1);assert.match(preview.conflicts[0].reason, /название/);
  const plan = await resolve(base, incoming);
  assert.equal(plan.data.recipes.filter(item => item.type === 'dish').length, 2);
  assert.notEqual(plan.idMap['other-dish'], 'dish');
  assert.equal(Calc.calcRecipe(plan.data, plan.idMap['other-dish']).knownCost, 37.5);
});

test('full semantic equality under different IDs deduplicates only after references are mapped', async () => {
  const base = fixture(), incoming = fixture();
  incoming.folders[0].id = 'foreign-folder';incoming.products[0].id = 'foreign-raw';incoming.packaging[0].id = 'foreign-box';
  incoming.recipes[0].id = 'foreign-prep';incoming.recipes[0].ingredients[0].id = 'foreign-prep-row';incoming.recipes[0].ingredients[0].refId = 'foreign-raw';
  incoming.recipes[1].id = 'foreign-dish';incoming.recipes[1].folderId = 'foreign-folder';incoming.recipes[1].ingredients[0].id = 'foreign-dish-row';incoming.recipes[1].ingredients[0].refId = 'foreign-prep';
  incoming.recipes[1].packaging[0].id = 'foreign-dish-box';incoming.recipes[1].packaging[0].refId = 'foreign-box';incoming.recipes[1].packaging[0].ingredientRefId = 'foreign-raw';
  const plan = await Merge.plan(base, incoming);
  assert.equal(plan.ready, true);assert.deepEqual(plan.data, base);assert.equal(plan.changes.skipped, 5);
  assert.equal(plan.idMap['foreign-prep'], 'prep');assert.equal(plan.idMap['foreign-dish-row'], 'dish-row');
});

test('folder metadata conflicts preserve both categories with unique names and correct dish links', async () => {
  const base = fixture(), incoming = fixture();incoming.folders[0].name = 'Другая категория';
  const plan = await resolve(base, incoming);
  assert.equal(plan.ready, true);assert.equal(plan.data.folders.length, 2);
  const importedDish = byId(plan.data, plan.idMap.dish);
  assert.equal(importedDish.folderId, plan.idMap.folder);assert.notEqual(importedDish.folderId, 'folder');
  assert.equal(new Set(plan.data.folders.map(item => item.name.toLocaleLowerCase('ru'))).size, 2);
  assert.deepEqual((await Merge.plan(plan.data, incoming)).data, plan.data);
});

test('cross-namespace entity ID collisions allocate valid IDs instead of overwriting another kind', async () => {
  const base = fixture(), incoming = fixture();incoming.folders = [];delete incoming.recipes[1].folderId;
  incoming.products[0].id = 'folder';incoming.products[0].price = 500;incoming.recipes[0].ingredients[0].refId = 'folder';incoming.recipes[1].packaging[0].ingredientRefId = 'folder';
  const preview = await Merge.plan(base, incoming);assert.match(preview.conflicts[0].reason, /другого типа/);
  const plan = await resolve(base, incoming);assert.equal(plan.ready, true);
  assert.equal(byId(plan.data, 'folder').name, base.folders[0].name);
  assert.equal(byId(plan.data, plan.idMap.folder).price, 500);assert.notEqual(plan.idMap.folder, 'folder');
  assert.doesNotThrow(() => Storage.validate(plan.data));
});

test('skipping an unavailable cross-type dependency skips dependent incoming recipes visibly', async () => {
  const base = fixture(), incoming = fixture();incoming.folders = [];delete incoming.recipes[1].folderId;
  incoming.products[0].id = 'folder';incoming.products[0].price = 500;incoming.recipes[0].ingredients[0].refId = 'folder';incoming.recipes[1].packaging[0].ingredientRefId = 'folder';
  const plan = await Merge.plan(base, incoming, {choices: {'product:folder': 'local'}});
  assert.equal(plan.ready, true);assert.deepEqual(plan.data, base);assert.equal(plan.idMap.folder, null);
  assert(plan.rows.filter(item => ['prep', 'dish'].includes(item.kind)).every(item => item.action === 'skipped' && /недоступны/.test(item.reason)));
});

test('row ID collisions are remapped independently and remain stable on repeated import', async () => {
  const base = fixture(), incoming = {version: 1, products: [product()], recipes: [
    {id: 'new-prep', type: 'prep', name: 'Новая заготовка', note: '', actualYield: 100, ingredients: [row('dish-row', 'raw')]}
  ]};
  const plan = await Merge.plan(base, incoming);assert.equal(plan.ready, true);
  const added = byId(plan.data, 'new-prep');assert.notEqual(added.ingredients[0].id, 'dish-row');assert.match(added.ingredients[0].id, /^merge-row-/);
  assert.deepEqual(byId(plan.data, 'dish'), byId(base, 'dish'));assert.doesNotThrow(() => Storage.validate(plan.data));
  assert.deepEqual((await Merge.plan(plan.data, incoming)).data, plan.data);
});

test('edited deterministic copies are not silently reused or overwritten on next keep-both import', async () => {
  const incoming = fixture();incoming.products[0].price = 500;
  const first = await resolve(fixture(), incoming), changed = clone(first.data);
  byId(changed, first.idMap.raw).price = 750;
  const next = await resolve(changed, incoming);
  assert.equal(next.ready, true);assert.notEqual(next.idMap.raw, first.idMap.raw);
  assert.equal(byId(next.data, first.idMap.raw).price, 750);assert.equal(byId(next.data, next.idMap.raw).price, 500);
  assert.deepEqual((await Merge.plan(next.data, incoming)).data, next.data);
});

test('reimport recognizes kept copies after the entire original graph was removed', async () => {
  const incoming = fixture();incoming.products[0].price = 500;
  const first = await resolve(fixture(), incoming), cleaned = clone(first.data);
  cleaned.products = cleaned.products.filter(item => item.id !== 'raw');
  cleaned.recipes = cleaned.recipes.filter(item => !['prep', 'dish'].includes(item.id));
  assert.doesNotThrow(() => Storage.validate(cleaned));
  const repeated = await Merge.plan(cleaned, incoming);
  assert.equal(repeated.ready, true);assert.equal(repeated.changes.added, 0);assert.deepEqual(repeated.conflicts, []);
  assert.deepEqual(repeated.data, cleaned);assert.equal(repeated.idMap.dish, first.idMap.dish);
});

test('reimport finds an existing numbered copy even after earlier alias slots were deleted', async () => {
  const base = {version: 1, products: [product()], recipes: []}, incoming = clone(base);incoming.products[0].price = 500;
  const first = await resolve(base, incoming), edited = clone(first.data);byId(edited, first.idMap.raw).price = 750;
  const second = await resolve(edited, incoming), cleaned = clone(second.data);
  cleaned.products = cleaned.products.filter(item => item.id !== first.idMap.raw);
  const repeated = await Merge.plan(cleaned, incoming);
  assert.equal(repeated.ready, true);assert.equal(repeated.changes.added, 0);
  assert.equal(repeated.idMap.raw, second.idMap.raw);assert.deepEqual(repeated.data, cleaned);
});

test('merge never offers in-place financial overwrites but full replacement is explicit and audited', async () => {
  const base = fixture(), incoming = {version: 1, products: [product('raw', 'Тестовое сырьё', 900)], recipes: []};
  const plan = await Merge.plan(base, incoming, {mode: 'replace'});
  assert.equal(plan.ready, true);assert.deepEqual(plan.data, incoming);assert.equal(plan.changes.updated, 1);assert.equal(plan.changes.removed, 4);
  assert(plan.rows.some(item => item.kind === 'dish' && item.action === 'removed'));
  await assert.rejects(Merge.plan(base, incoming, {choices: {'product:raw': 'incoming'}}), /Недопустимое/);
  assert.equal(base.products[0].price, 100);
});

test('incompatible local dependency choices retain conflict controls and cannot produce an applyable plan', async () => {
  const base = fixture(), incoming = fixture();incoming.products[0].unit = 'pcs';
  incoming.products[0].massPerPiece = 100;incoming.recipes[0].ingredients[0].unit = 'pcs';incoming.recipes[0].ingredients[0].quantity = 10;
  const plan = await Merge.plan(base, incoming, {choices: {'product:raw': 'local', 'prep:prep': 'both', 'dish:dish': 'both'}});
  assert.equal(plan.ready, false);assert.equal(plan.data, null);assert.equal(plan.unresolved, 0);
  assert(plan.errors.some(value => /несовместимые единицы/.test(value)));assert(plan.conflicts.some(item => item.key === 'product:raw'));
});

test('replacement preview explicitly accounts for removed and changed root extension fields', async () => {
  const base = empty(), incoming = empty();base.kitchen = {name: 'Кухня'};base.note = 'Прежняя заметка';incoming.note = 'Другая заметка';incoming.extra = [1, 2];
  const plan = await Merge.plan(base, incoming, {mode: 'replace'});
  assert.equal(plan.ready, true);assert.deepEqual(plan.data, incoming);
  assert.deepEqual(plan.changes, {added: 1, updated: 1, skipped: 0, removed: 1, conflicts: 0});
  assert(plan.rows.some(item => item.kind === 'extension' && item.id === 'kitchen' && item.action === 'removed'));
});

test('copy suffixes respect maximum folder/name lengths without splitting Unicode characters', async () => {
  const base = fixture(), incoming = fixture();base.folders[0].name = 'Локальная папка';incoming.folders[0].name = '😀'.repeat(60);
  const plan = await resolve(base, incoming);assert.equal(plan.ready, true);
  const copy = byId(plan.data, plan.idMap.folder);assert(copy.name.length <= 120);assert.match(copy.name, /импорт/);
  assert(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(copy.name));
  assert.deepEqual((await Merge.plan(plan.data, incoming)).data, plan.data);
});

test('legacy single photo and an equal two-slot representation compare by actual bytes', async () => {
  const photo = {dataUrl: 'data:image/jpeg;base64,AQID', width: 1, height: 1, mime: 'image/jpeg'};
  const base = fixture(), incoming = fixture();base.recipes[1].photo = photo;incoming.recipes[1].photos = [clone(photo), null];
  const equal = await Merge.plan(base, incoming);assert.equal(equal.ready, true);assert.deepEqual(equal.data, base);
  incoming.recipes[1].photos[0].dataUrl = 'data:image/jpeg;base64,BAUG';
  const changed = await resolve(base, incoming);assert.equal(changed.changes.added, 1);
  assert.equal(byId(changed.data, 'dish').photo.dataUrl, photo.dataUrl);
  assert.equal(byId(changed.data, changed.idMap.dish).photos[0].dataUrl, 'data:image/jpeg;base64,BAUG');
  assert.deepEqual((await Merge.plan(changed.data, incoming)).data, changed.data);
});

test('device-local photograph IDs must be resolved before a portable merge comparison', async () => {
  const input = fixture();input.recipes[1].photoIds = ['fictional-local-photo', null];
  await assert.rejects(Merge.plan(fixture(), input), /встроенными фотографиями/);
});

test('malformed schemas, broken references, cycles, unsupported modes and invalid choices never mutate input', async () => {
  const base = fixture(), before = clone(base);
  await assert.rejects(Merge.plan(base, {...empty(), version: 2}), /версия/);
  const invalid = fixture();invalid.recipes[0].ingredients[0].refId = 'missing';await assert.rejects(Merge.plan(base, invalid), /отсутствующий/);
  const cyclic = fixture();cyclic.recipes[0].ingredients[0].refId = 'prep';await assert.rejects(Merge.plan(base, cyclic), /циклическая/);
  await assert.rejects(Merge.plan(base, empty(), {mode: 'synchronize'}), /Выберите/);
  await assert.rejects(Merge.plan(base, empty(), {choices: []}), /решения/);
  assert.deepEqual(base, before);
});

test('a thousand incoming dishes keep unique identities, links and repeated-import idempotence', async () => {
  const incoming = empty();incoming.products.push(product());
  incoming.recipes = Array.from({length: 1000}, (_, index) => ({id: 'large-' + index, type: 'dish', name: 'Тестовое блюдо ' + index,
    note: '', actualYield: null, ingredients: [row('large-row-' + index, 'raw')]}));
  const first = await Merge.plan(empty(), incoming);assert.equal(first.ready, true);assert.equal(first.changes.added, 1001);
  const second = await Merge.plan(first.data, incoming);assert.equal(second.ready, true);assert.equal(second.changes.added, 0);assert.equal(second.changes.skipped, 1001);
  assert.deepEqual(second.data, first.data);
});

test('unknown permissible fields survive copies and root conflicts require an explicit field version', async () => {
  const base = fixture(), incoming = fixture();base.kitchen = {title: 'Локальная кухня'};incoming.kitchen = {title: 'Другая кухня'};
  incoming.products[0].supplier = {name: 'Вымышленный поставщик', sourceId: 'raw'};
  incoming.recipes[0].ingredients[0].timing = {seconds: 42};incoming.recipes[1].custom = {reference: 'raw'};
  const preview = await Merge.plan(base, incoming);assert.equal(preview.ready, false);
  assert(preview.conflicts.some(item => item.key === 'extension:kitchen' && item.options.join() === 'local,incoming'));
  const plan = await resolve(base, incoming, conflict => conflict.kind === 'extension' ? 'incoming' : 'both');
  assert.equal(plan.ready, true);assert.deepEqual(plan.data.kitchen, incoming.kitchen);
  assert.deepEqual(byId(plan.data, plan.idMap.raw).supplier, incoming.products[0].supplier);
  assert.deepEqual(byId(plan.data, plan.idMap.prep).ingredients[0].timing, {seconds: 42});
  assert.deepEqual(byId(plan.data, plan.idMap.dish).custom, {reference: 'raw'});
  assert(plan.warnings.some(item => /sourceId|reference/.test(item.path)));
  const repeat = await Merge.plan(plan.data, incoming);assert.equal(repeat.ready, true);assert.equal(repeat.changes.added, 0);assert.deepEqual(repeat.data, plan.data);
});
