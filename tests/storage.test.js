const test = require('node:test');
const assert = require('node:assert/strict');
const Storage = require('../js/storage.js');
const Seed = require('../js/seed.js');

test('seed retains all requested incomplete data and can be serialized', () => {
  const state = Storage.parseJSON(Storage.stringify(Seed.create()));
  assert.equal(state.products.every(p => p.price === null), true);
  const fries = state.recipes.find(r => r.id === 'prep-fries');
  assert.equal(fries.actualYield, 100);
  assert.deepEqual([fries.ingredients[0].quantity, fries.ingredients[0].lossPercent, fries.ingredients[0].outputGrams], [160, 37.5, 100]);
  assert.equal(fries.ingredients.slice(1).every(r => r.quantity === null), true);
  assert.equal(state.recipes.find(r => r.id === 'prep-meat').actualYield, null);
  const gyro = state.recipes.find(r => r.id === 'dish-gyro');
  assert.equal(gyro.ingredients.length, 9);
  assert.equal(gyro.ingredients.some(r => /salt|paprika/.test(r.refId)), false);
  assert.equal(state.products.find(p => p.id === 'product-bun').massPerPiece, 100);
  state.products[0].name = 'changed';
  assert.notEqual(Seed.create().products[0].name, 'changed');
});

function memoryStorage() {
  const entries = new Map();
  return { getItem: key => entries.has(key) ? entries.get(key) : null, setItem: (key, value) => entries.set(key, value) };
}

test('save and reload round-trip, null prices do not become zero', () => {
  const storage = memoryStorage();
  assert.deepEqual(Storage.load(storage), { data: null, error: null });
  assert.equal(Storage.save(Seed.create(), storage).ok, true);
  assert.deepEqual(Storage.load(storage).data, Seed.create());
});

test('corrupt data is not overwritten on load', () => {
  const storage = memoryStorage();
  storage.setItem(Storage.KEY, '{broken');
  assert.match(Storage.load(storage).error, /JSON/);
  assert.equal(storage.getItem(Storage.KEY), '{broken');
});

test('storage denial and quota failure are reported without throwing', () => {
  const storage = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); } };
  assert.match(Storage.load(storage).error, /SecurityError/);
  assert.equal(Storage.save(Seed.create(), storage).ok, false);
  assert.match(Storage.save(Seed.create(), storage).error, /JSON/);
});

test('import rejects malformed schemas, negative values and division by zero', () => {
  assert.throws(() => Storage.parseJSON('[]'), /объект/);
  assert.throws(() => Storage.parseJSON('{"version":2}'), /версия/);
  for (const [field, value] of [['price', -1], ['packQuantity', 0], ['massPerPiece', 0], ['gramsPerMl', Infinity], ['price', '500']]) {
    const state = Seed.create();
    state.products[0][field] = value;
    assert.throws(() => Storage.validate(state));
  }
  const state = Seed.create();
  state.recipes[1].ingredients[0].lossPercent = 101;
  assert.throws(() => Storage.validate(state), /100/);
});

test('import rejects duplicates, broken references, dish references, and cycles', () => {
  const duplicate = Seed.create();
  duplicate.products[1].id = duplicate.products[0].id;
  assert.throws(() => Storage.validate(duplicate), /Повторяющийся/);
  const broken = Seed.create();
  broken.recipes[0].ingredients[0].refId = 'missing';
  assert.throws(() => Storage.validate(broken), /отсутствующий/);
  const dish = Seed.create();
  dish.recipes[0].ingredients[0].refId = 'dish-gyro';
  assert.throws(() => Storage.validate(dish), /блюдо нельзя/);
  const cycle = Seed.create();
  cycle.recipes[0].ingredients[0].refId = 'prep-fries';
  cycle.recipes[1].ingredients[0] = { ...cycle.recipes[0].ingredients[0], id: 'cycle-row', refId: 'prep-meat' };
  assert.throws(() => Storage.validate(cycle), /циклическая/);
});

test('import validates loss/output agreement, prep ready mass and dimensional conversions', () => {
  const state = Seed.create();
  state.recipes[1].ingredients[0].outputGrams = 120;
  assert.throws(() => Storage.validate(state), /не согласованы/);
  state.recipes[1].ingredients[0].outputGrams = 200;
  assert.throws(() => Storage.validate(state), /превышать/);
  const prep = Seed.create();
  prep.recipes[2].ingredients[0].lossPercent = 30;
  assert.throws(() => Storage.validate(prep), /повторно/);
  const volume = Seed.create();
  volume.recipes[1].ingredients[1].unit = 'g';
  assert.throws(() => Storage.validate(volume), /несовместимые/);
  volume.products.find(p => p.id === 'product-oil').gramsPerMl = 0.9;
  assert.doesNotThrow(() => Storage.validate(volume));
});

test('malicious markup remains plain data and legitimate extension fields are preserved', () => {
  const state = Seed.create();
  state.products[0].name = '<img src=x onerror=alert(1)>';
  state.products[0].unknown = 'preserved';
  const result = Storage.validate(state);
  assert.equal(result.products[0].name, state.products[0].name);
  assert.equal(result.products[0].unknown, 'preserved');
});

test('import rejects IDs with spaces, quotes, selector punctuation, and non-Latin letters', () => {
  for (const id of ['product potato', ' product', 'product ', 'product"', "product'", 'product]', 'product#x', 'product.x', 'продукт']) {
    const state = Seed.create();
    state.products[0].id = id;
    assert.throws(() => Storage.validate(state), /идентификатор может содержать только/);
  }
  const state = Seed.create();
  state.recipes[0].ingredients[0].id = 'row[0]';
  assert.throws(() => Storage.validate(state), /идентификатор может содержать только/);
});

function nestedRecipes(count) {
  return {
    version: 1,
    products: [],
    recipes: Array.from({ length: count }, (_, index) => ({
      id: 'prep-' + index, type: 'prep', name: 'Рецепт ' + index, note: '', actualYield: 1,
      ingredients: index === count - 1 ? [] : [{
        id: 'row-' + index, refId: 'prep-' + (index + 1), quantity: 1, unit: 'g',
        lossPercent: null, outputGrams: null, note: ''
      }]
    }))
  };
}

test('import allows 100 recipe levels but rejects deeper graphs before recursive calculation', () => {
  assert.doesNotThrow(() => Storage.validate(nestedRecipes(100)));
  assert.throws(() => Storage.validate(nestedRecipes(101)), /Глубина вложенных рецептов превышает 100/);
  const reused = nestedRecipes(101);
  // Visit a shared deep leaf first, so memoization cannot hide the longest path.
  reused.recipes.reverse();
  assert.throws(() => Storage.validate(reused), /Глубина вложенных рецептов превышает 100/);
});

test('ingredient rows are not limited by the recipe nesting bound', () => {
  const state = Seed.create();
  state.recipes[2].ingredients.push(...Array.from({ length: 250 }, (_, index) => ({
    id: 'extra-row-' + index, refId: 'product-tomato', quantity: 1, unit: 'g',
    lossPercent: null, outputGrams: null, note: ''
  })));
  assert.doesNotThrow(() => Storage.validate(state));
});
