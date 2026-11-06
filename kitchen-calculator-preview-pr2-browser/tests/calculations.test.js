const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/calculations.js');

const product = (id, patch = {}) => ({ id, name: id, aliases: '', price: 500, packQuantity: 1, unit: 'kg', massPerPiece: null, gramsPerMl: null, note: '', ...patch });
const row = (refId, quantity, unit = 'g', patch = {}) => ({ id: 'row-' + refId, refId, quantity, unit, lossPercent: null, outputGrams: null, note: '', ...patch });
const recipe = (id, type, ingredients, patch = {}) => ({ id, name: id, type, ingredients, actualYield: null, note: '', ...patch });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
function meatState() {
  return { version: 1, products: [product('raw')], recipes: [
    recipe('meat', 'prep', [row('raw', 1, 'kg', { lossPercent: 40, outputGrams: 600 })], { actualYield: 600 }),
    recipe('dish', 'dish', [row('meat', 100)])
  ] };
}

test('decimal comma, point, empty price and invalid numbers', () => {
  assert.equal(C.parseNumber('37,5'), 37.5);
  assert.equal(C.parseNumber(' 37.5 '), 37.5);
  assert.equal(C.parseNumber(''), null);
  assert.equal(C.parseNumber('0'), 0);
  for (const value of ['-1', '1,2,3', '2x', Infinity, NaN, true]) assert.throws(() => C.parseNumber(value));
});

test('160g with 37.5% loss gives 100g and inverse input agrees', () => {
  assert.equal(C.syncLoss(160, '37,5'), 100);
  assert.equal(C.lossFromOutput(160, 100), 37.5);
  assert.throws(() => C.syncLoss(160, 101));
  assert.throws(() => C.lossFromOutput(0, 0));
  assert.throws(() => C.lossFromOutput(100, 101));
});

test('500 rubles per kg, actual output 600g: 100g costs 83.33, loss not reapplied', () => {
  const state = meatState();
  const prep = C.calcRecipe(state, 'meat');
  assert.equal(prep.complete, true);
  assert.equal(prep.knownCost, 500);
  close(prep.costPerGram, 5 / 6);
  const dish = C.calcRecipe(state, 'dish');
  assert.equal(dish.complete, true);
  close(dish.knownCost, 83.33333333333333);
  assert.equal(dish.massGrams, 100);
  state.recipes[1].ingredients[0].lossPercent = 40;
  close(C.calcRecipe(state, 'dish').knownCost, 83.33333333333333);
  assert.equal(C.calcRecipe(state, 'dish').massGrams, 100);
});

test('actual batch yield, not summed row yield, sets cost per gram', () => {
  const state = meatState();
  state.recipes[0].actualYield = 500;
  close(C.calcRecipe(state, 'dish').knownCost, 100);
});

test('missing prices propagate incompleteness and a known partial sum', () => {
  const state = meatState();
  state.products.push(product('salt', { price: null }));
  state.recipes[0].ingredients.push(row('salt', 10));
  const prep = C.calcRecipe(state, 'meat');
  assert.equal(prep.complete, false);
  assert.equal(prep.costPerGram, null);
  assert.equal(prep.knownCost, 500);
  const dish = C.calcRecipe(state, 'dish');
  assert.equal(dish.complete, false);
  close(dish.knownCost, 83.33333333333333);
  assert.match(prep.issues.join(' '), /Нет цены/);
  assert.match(dish.issues.join(' '), /Неполный расчёт полуфабриката/);
});

test('dependent recipes immediately reflect a changed purchase price', () => {
  const state = meatState();
  close(C.calcRecipe(state, 'dish').knownCost, 83.33333333333333);
  state.products[0].price = 600;
  assert.equal(C.calcRecipe(state, 'dish').knownCost, 100);
});

test('missing yield or quantity, empty recipe and dangling references are incomplete', () => {
  const state = meatState();
  state.recipes[0].actualYield = null;
  assert.equal(C.calcRecipe(state, 'dish').complete, false);
  state.recipes[0].actualYield = 600;
  state.recipes[0].ingredients[0].quantity = null;
  assert.equal(C.calcRecipe(state, 'dish').complete, false);
  state.recipes[0].ingredients = [];
  assert.equal(C.calcRecipe(state, 'meat').complete, false);
  state.recipes[0].ingredients = [row('missing', 10)];
  assert.equal(C.calcRecipe(state, 'meat').complete, false);
});

test('zero price is valid, but zero pack or batch yield never divides by zero', () => {
  const state = meatState();
  state.products[0].price = 0;
  assert.equal(C.calcRecipe(state, 'dish').complete, true);
  assert.equal(C.calcRecipe(state, 'dish').knownCost, 0);
  state.products[0].packQuantity = 0;
  assert.equal(C.calcRecipe(state, 'dish').complete, false);
  assert.equal(C.productBasePrice(state.products[0]).value, null);
  state.recipes[0].actualYield = 0;
  assert.equal(C.calcRecipe(state, 'dish').complete, false);
});

test('volume stays volume without explicit coefficient; price works while weight unknown', () => {
  const state = { products: [product('oil', { unit: 'l', price: 200 })], recipes: [recipe('dish', 'dish', [row('oil', 20, 'ml')])] };
  const result = C.calcRecipe(state, 'dish');
  assert.equal(result.complete, true);
  assert.equal(result.knownCost, 4);
  assert.equal(result.massGrams, null);
  state.recipes[0].ingredients[0].unit = 'g';
  assert.equal(C.calcRecipe(state, 'dish').complete, false);
  state.products[0].gramsPerMl = 0.8;
  const converted = C.calcRecipe(state, 'dish');
  assert.equal(converted.complete, true);
  assert.equal(converted.knownCost, 5);
  assert.equal(converted.massGrams, 20);
});

test('piece weight gives conditional mass without changing purchase cost', () => {
  const state = { products: [product('bun', { unit: 'pcs', packQuantity: 10, price: 100, massPerPiece: 100 })], recipes: [recipe('dish', 'dish', [row('bun', 1, 'pcs')])] };
  const result = C.calcRecipe(state, 'dish');
  assert.equal(result.knownCost, 10);
  assert.equal(result.massGrams, 100);
});

test('raw ingredient loss affects only weight, inconsistent loss/output cannot pass', () => {
  const state = { products: [product('potato')], recipes: [recipe('dish', 'dish', [row('potato', 160, 'g', { lossPercent: 37.5, outputGrams: 100 })])] };
  assert.equal(C.calcRecipe(state, 'dish').massGrams, 100);
  assert.equal(C.calcRecipe(state, 'dish').knownCost, 80);
  state.recipes[0].ingredients[0].outputGrams = 90;
  assert.equal(C.calcRecipe(state, 'dish').complete, false);
});

test('nested preparations supported and direct/indirect cycles are rejected', () => {
  const state = meatState();
  state.recipes.push(recipe('sauce', 'prep', [row('meat', 120)], { actualYield: 120 }));
  state.recipes[1].ingredients = [row('sauce', 100)];
  assert.equal(C.calcRecipe(state, 'dish').complete, true);
  close(C.calcRecipe(state, 'dish').knownCost, 83.33333333333333);
  assert.equal(C.wouldCreateCycle(state, 'meat', 'sauce'), true);
  assert.equal(C.wouldCreateCycle(state, 'meat', 'meat'), true);
  assert.equal(C.wouldCreateCycle(state, 'sauce', 'raw'), false);
  state.recipes[0].ingredients = [row('sauce', 100)];
  assert.equal(C.calcRecipe(state, 'dish').complete, false);
  assert.match(C.calcRecipe(state, 'dish').issues.join(' '), /Неполный расчёт полуфабриката/);
});

test('numeric overflow never produces a complete infinite total', () => {
  const state = meatState();
  state.products[0].price = Number.MAX_VALUE;
  state.recipes[0].ingredients[0].quantity = Number.MAX_VALUE;
  const result = C.calcRecipe(state, 'dish');
  assert.equal(result.complete, false);
  assert.ok(Number.isFinite(result.knownCost));
});

test('shared references at 30 levels keep incomplete issue lists bounded', () => {
  const state = { products: [product('raw', { price: null })], recipes: [recipe('level0', 'prep', [row('raw', 1)], { actualYield: 1 })] };
  for (let i = 1; i <= 30; i++) {
    state.recipes.push(recipe('level' + i, 'prep', [row('level' + (i - 1), 1), row('level' + (i - 1), 1)], { actualYield: 1 }));
  }
  const started = performance.now();
  const result = C.calcRecipe(state, 'level30');
  assert.equal(result.complete, false);
  assert.equal(result.issues.length, 2);
  assert.ok(result.issues.join(' ').length < 300);
  assert.ok(performance.now() - started < 1000);
});

test('excessive depth is incomplete and cycle checking uses no recursive call stack', () => {
  const state = { products: [product('raw')], recipes: [recipe('level0', 'prep', [row('raw', 1)], { actualYield: 1 })] };
  for (let i = 1; i <= 10000; i++) {
    state.recipes.push(recipe('level' + i, 'prep', [row('level' + (i - 1), 1)], { actualYield: 1 }));
  }
  assert.equal(C.wouldCreateCycle(state, 'level0', 'level10000'), true);
  assert.equal(C.wouldCreateCycle(state, 'newRecipe', 'level10000'), false);
  assert.equal(C.calcRecipe(state, 'level10000').complete, false);
});
