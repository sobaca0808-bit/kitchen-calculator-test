'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Drafts = require('../js/drafts.js');

function record(id = 'dish-new', type = 'dish', name = 'Незавершённый рецепт') {
  return {
    id, type, isNew: true, updatedAt: 1730000000000,
    data: {id, type, name, ingredients: [{id: 'row-1', refId: null, quantity: 10, unit: 'g', lossPercent: null, outputGrams: null, note: 'Проверить'}],
      portions: 2, actualYield: null, technology: '1. Подготовить.\n2. Приготовить.', note: 'Не готово', photoId: 'local-photo-123',
      ...(type === 'dish' ? {packaging: [{id: 'pack-row', refId: 'box', quantity: 1, unit: 'pcs', freeForGuest: false, costMode: 'auto'}]} : {})},
    invalidValues: [['qty-row-1', '1,2,3']], errors: [['qty-row-1', 'Введите число.']],
    formValues: [{id: 'qty-row-1', value: '1,2,3'}, {id: 'search-row-1', value: 'Кар'}, {id: 'unit-row-1', value: 'kg'}, {id: 'pack-free-pack-row', value: 'on', checked: true}],
    details: [{index: 0, open: true}, {index: 1, open: false}]
  };
}
function memoryStorage() {
  const entries = new Map([['kitchen-calculator-v1', '{"real":"protected"}'], ['kitchen-calculator-pr2-browser-test-v1', '{"saved":"unchanged"}']]);
  const operations = [];
  return {entries, operations,
    getItem(key) { operations.push(['get', key]); return entries.get(key) ?? null; },
    setItem(key, value) { operations.push(['set', key]); entries.set(key, value); }
  };
}
function unchangedKeys(storage) {
  assert.equal(storage.entries.get('kitchen-calculator-v1'), '{"real":"protected"}');
  assert.equal(storage.entries.get('kitchen-calculator-pr2-browser-test-v1'), '{"saved":"unchanged"}');
  assert(storage.operations.every(([, key]) => key === Drafts.KEY), 'Only the exact draft namespace may be accessed');
}

test('drafts preserve full raw input, recipe fields, photo references and opened details through reload', () => {
  const storage = memoryStorage(), original = record();
  assert.deepEqual(Drafts.load(storage), {items: [], error: null});
  assert.deepEqual(Drafts.save(original, storage), {ok: true, error: null});
  assert.deepEqual(Drafts.load(storage), {items: [original], error: null});
  const restored = Drafts.load(storage).items[0];
  restored.data.name = 'Changed outside storage';
  assert.equal(Drafts.load(storage).items[0].data.name, original.data.name);
  assert.equal(original.data.name, 'Незавершённый рецепт');
  unchangedKeys(storage);
});

test('saving and deleting one exact type:id never mixes other dishes or preparations', () => {
  const storage = memoryStorage();
  const dish = record('same-id'), prep = record('same-id', 'prep', 'Полуфабрикат'), other = record('other-dish');
  for (const item of [dish, prep, other]) assert(Drafts.save(item, storage).ok);
  dish.data.name = 'Changed dish only'; dish.isNew = false;
  assert(Drafts.save(dish, storage).ok);
  assert.deepEqual(Drafts.load(storage).items, [dish, prep, other]);
  assert(Drafts.remove('same-id', 'dish', storage).ok);
  assert.deepEqual(Drafts.load(storage).items, [prep, other]);
  const before = storage.entries.get(Drafts.KEY), beforeOps = storage.operations.length;
  assert(Drafts.remove('missing', 'dish', storage).ok);
  assert.equal(storage.entries.get(Drafts.KEY), before);
  assert(storage.operations.slice(beforeOps).every(([method]) => method === 'get'), 'Removing a missing draft makes no write');
  assert(Drafts.remove('same-id', 'prep', storage).ok);
  assert.deepEqual(Drafts.load(storage).items, [other]);
  unchangedKeys(storage);
});

test('draft data supports absent optional editor fields and preserves future JSON fields', () => {
  const storage = memoryStorage(), item = record();
  for (const key of ['invalidValues', 'errors', 'formValues', 'details', 'updatedAt']) delete item[key];
  item.data.future = {mode: 'future', nested: [null, false, 1.25]};
  assert(Drafts.save(item, storage).ok);
  const loaded = Drafts.load(storage).items[0];
  assert.deepEqual(loaded.data.future, item.data.future);
  for (const key of ['invalidValues', 'errors', 'formValues', 'details']) assert.deepEqual(loaded[key], []);
  assert(Number.isSafeInteger(loaded.updatedAt));
});

test('quota failures preserve the last good draft and the saved recipe database', () => {
  const storage = memoryStorage(), old = record();
  assert(Drafts.save(old, storage).ok);
  const prior = storage.entries.get(Drafts.KEY);
  storage.setItem = key => { storage.operations.push(['set', key]); throw Error('QuotaExceededError'); };
  const changed = record(); changed.data.name = 'Must not replace the previous snapshot';
  const failed = Drafts.save(changed, storage);
  assert.equal(failed.ok, false); assert.match(failed.error, /QuotaExceededError/);
  assert.equal(storage.entries.get(Drafts.KEY), prior);
  assert.deepEqual(Drafts.load(storage).items, [old]);
  assert.equal(Drafts.remove(old.id, old.type, storage).ok, false);
  assert.equal(storage.entries.get(Drafts.KEY), prior);
  unchangedKeys(storage);
});

test('storage access denial reports an error without throwing or attempting a write', () => {
  let writes = 0;
  const storage = {getItem() {throw Error('SecurityError');}, setItem() {writes++;}};
  assert.match(Drafts.load(storage).error, /SecurityError/);
  assert.match(Drafts.save(record(), storage).error, /SecurityError/);
  assert.match(Drafts.remove('dish-new', 'dish', storage).error, /SecurityError/);
  assert.equal(writes, 0);
});

test('unreadable, unknown or duplicate draft envelopes are never overwritten', () => {
  const item = record();
  const invalid = ['{broken', '[]', '{"version":2,"items":[]}', '{"version":1,"items":{}}',
    JSON.stringify({version:1,items:[item,item]}), JSON.stringify({version:1,items:[{...item,data:{...item.data,id:'wrong'}}]})];
  for (const raw of invalid) {
    const storage = memoryStorage(); storage.entries.set(Drafts.KEY, raw);
    assert(Drafts.load(storage).error, raw);
    assert.equal(Drafts.save(record('new-id'), storage).ok, false);
    assert.equal(Drafts.remove('dish-new', 'dish', storage).ok, false);
    assert.equal(storage.entries.get(Drafts.KEY), raw);
    assert(storage.operations.every(([method]) => method === 'get'), 'Corrupt draft storage is read only');
    unchangedKeys(storage);
  }
});

test('malformed draft identity, type, form values and editor state are rejected before writing', () => {
  const invalid = [
    item => {item.id = '../bad';}, item => {item.id = '';}, item => {item.id = 'x'.repeat(201);},
    item => {item.type = 'products';}, item => {item.isNew = 'yes';}, item => {item.data.id = 'different';},
    item => {item.data.type = 'prep';}, item => {item.data.ingredients = null;}, item => {item.data.name = 123;},
    item => {item.invalidValues = [['field', 123]];}, item => {item.errors = [['field']];},
    item => {item.formValues = [{id: 'field', value: 123}];}, item => {item.formValues[0].checked = 'yes';},
    item => {item.details = [{index: -1, open: true}];}, item => {item.details = [{index: 1.5, open: true}];},
    item => {item.updatedAt = -1;}, item => {item.updatedAt = Infinity;}
  ];
  for (const mutate of invalid) {
    const storage = memoryStorage(), item = record(); mutate(item);
    const failed = Drafts.save(item, storage);
    assert.equal(failed.ok, false, mutate.toString()); assert(failed.error);
    assert.equal(storage.entries.has(Drafts.KEY), false);
    assert(storage.operations.every(([method]) => method !== 'set'));
  }
  const storage = memoryStorage();
  for (const [id, type] of [['bad/id', 'dish'], ['dish-new', 'products'], ['dish-new', undefined]]) {
    assert.equal(Drafts.remove(id, type, storage).ok, false);
  }
});

test('prototype setters, custom prototypes, functions and toJSON are not accepted or executed', () => {
  const storage = memoryStorage();
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    const item = JSON.parse(JSON.stringify(record()));
    Object.defineProperty(item.data, key, {enumerable: true, value: {polluted: true}});
    assert.equal(Drafts.save(item, storage).ok, false);
  }
  let invoked = 0;
  const withFunction = record(); withFunction.data.toJSON = () => {invoked++; return {};};
  assert.equal(Drafts.save(withFunction, storage).ok, false);
  const withPrototype = record(); withPrototype.data.future = Object.create({polluted: true});
  assert.equal(Drafts.save(withPrototype, storage).ok, false);
  assert.equal(invoked, 0);
  assert.equal({}.polluted, undefined);
  assert.equal(storage.entries.has(Drafts.KEY), false);
});

test('accessor values anywhere in a draft are rejected without running user code', () => {
  const storage = memoryStorage(); let invoked = 0;
  const increment = () => {invoked++; return 'dish-new';};
  for (const field of ['id', 'type', 'isNew']) {
    const item = record(); Object.defineProperty(item, field, {enumerable: true, get: increment});
    assert.equal(Drafts.save(item, storage).ok, false);
  }
  const nested = record(); Object.defineProperty(nested.data, 'name', {enumerable: true, get: increment});
  assert.equal(Drafts.save(nested, storage).ok, false);
  const array = record(); Object.defineProperty(array.data.ingredients, '0', {enumerable: true, get: increment});
  assert.equal(Drafts.save(array, storage).ok, false);
  assert.equal(invoked, 0);
});

test('single draft byte limit rejects oversized UTF-8 content without replacing a saved snapshot', () => {
  const storage = memoryStorage(); assert(Drafts.save(record(), storage).ok);
  const before = storage.entries.get(Drafts.KEY), item = record();
  item.data.technology = 'Я'.repeat(Drafts.MAX_DRAFT_BYTES / 2);
  const failed = Drafts.save(item, storage);
  assert.equal(failed.ok, false); assert.match(failed.error, /1 МБ/);
  assert.equal(storage.entries.get(Drafts.KEY), before);
});

test('total storage limit preserves all existing drafts on addition failure', () => {
  const storage = memoryStorage();
  for (let i = 0; i < 5; i++) {
    const item = record('bulk-' + i); item.data.technology = 'a'.repeat(900000);
    assert(Drafts.save(item, storage).ok);
  }
  const before = storage.entries.get(Drafts.KEY), extra = record('bulk-5'); extra.data.technology = 'a'.repeat(900000);
  const failed = Drafts.save(extra, storage);
  assert.equal(failed.ok, false); assert.match(failed.error, /5 МБ/);
  assert.equal(storage.entries.get(Drafts.KEY), before);
  assert.equal(Drafts.load(storage).items.length, 5);
  unchangedKeys(storage);
});

test('oversized stored envelope remains untouched during read, save and deletion', () => {
  const storage = memoryStorage(), raw = ' '.repeat(Drafts.MAX_TOTAL_BYTES + 1);
  storage.entries.set(Drafts.KEY, raw);
  assert.match(Drafts.load(storage).error, /5 МБ/);
  assert.equal(Drafts.save(record(), storage).ok, false);
  assert.equal(Drafts.remove('dish-new', 'dish', storage).ok, false);
  assert.equal(storage.entries.get(Drafts.KEY), raw);
  assert(storage.operations.every(([method]) => method !== 'set'));
});
