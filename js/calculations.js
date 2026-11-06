(function (root) {
  'use strict';

  const units = Object.freeze({
    g: { label: 'г', base: 'g', factor: 1 },
    kg: { label: 'кг', base: 'g', factor: 1000 },
    ml: { label: 'мл', base: 'ml', factor: 1 },
    l: { label: 'л', base: 'ml', factor: 1000 },
    pcs: { label: 'шт.', base: 'pcs', factor: 1 }
  });

  function parseNumber(value) {
    if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null;
    if (typeof value === 'string') {
      const text = value.trim().replace(',', '.');
      if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) throw new Error('Введите неотрицательное число с запятой или точкой.');
      value = Number(text);
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('Введите конечное неотрицательное число.');
    return value;
  }

  const valid = (number) => typeof number === 'number' && Number.isFinite(number) && number >= 0;
  const positive = (number) => valid(number) && number > 0;
  const finiteOrNull = (number) => Number.isFinite(number) && number >= 0 ? number : null;

  function syncLoss(inputGrams, lossPercent) {
    const input = parseNumber(inputGrams);
    const loss = parseNumber(lossPercent);
    if (input === null || loss === null) return null;
    if (loss > 100) throw new Error('Потери должны быть от 0 до 100%.');
    const output = finiteOrNull(input * (1 - loss / 100));
    if (output === null) throw new Error('Слишком большое значение выхода.');
    return output;
  }

  function lossFromOutput(inputGrams, outputGrams) {
    const input = parseNumber(inputGrams);
    const output = parseNumber(outputGrams);
    if (input === null || output === null) return null;
    if (input === 0) throw new Error('Исходный вес должен быть больше нуля.');
    if (output > input) throw new Error('Выход не может быть больше исходного веса.');
    return (1 - output / input) * 100;
  }

  function productBasePrice(product) {
    const unit = units[product.unit];
    if (!unit || !valid(product.price) || !positive(product.packQuantity)) return { value: null, unit: unit ? unit.base : null };
    const quantity = finiteOrNull(product.packQuantity * unit.factor);
    return { value: quantity && finiteOrNull(product.price / quantity), unit: unit.base };
  }

  // Convert only within a dimension or via a coefficient explicitly supplied by the user.
  function convertProductQuantity(product, quantity, fromUnit, targetBase) {
    const source = units[fromUnit];
    if (!source || !valid(quantity)) return null;
    const amount = finiteOrNull(quantity * source.factor);
    if (amount === null || source.base === targetBase) return amount;
    const coefficients = { g: 1, ml: positive(product.gramsPerMl) ? product.gramsPerMl : null,
      pcs: positive(product.massPerPiece) ? product.massPerPiece : null };
    if (!coefficients[source.base] || !coefficients[targetBase]) return null;
    return finiteOrNull(amount * coefficients[source.base] / coefficients[targetBase]);
  }

  function wouldCreateCycle(state, recipeId, refId) {
    const recipes = new Map(state.recipes.map(recipe => [recipe.id, recipe]));
    const seen = new Set();
    const pending = [refId];
    while (pending.length) {
      const id = pending.pop();
      if (id === recipeId) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      const recipe = recipes.get(id);
      if (recipe) for (const row of recipe.ingredients) pending.push(row.refId);
    }
    return false;
  }

  function calcRecipe(state, recipeId) {
    const products = new Map(state.products.map(product => [product.id, product]));
    const recipes = new Map(state.recipes.map(recipe => [recipe.id, recipe]));
    const cache = new Map();
    function failure(issue) {
      return { knownCost: 0, complete: false, issues: [issue], massGrams: null, rows: [], costPerGram: null };
    }
    function calculate(id, stack) {
      if (stack.has(id)) return failure('Циклическая ссылка между полуфабрикатами.');
      if (cache.has(id)) return cache.get(id);
      if (stack.size >= 100) return failure('Слишком глубокая вложенность полуфабрикатов: не более 100 уровней.');
      const recipe = recipes.get(id);
      if (!recipe) return failure('Рецепт не найден.');
      const nextStack = new Set(stack).add(id);
      const issues = [];
      const rows = recipe.ingredients.map(row => {
        let knownCost = 0;
        let massGrams = null;
        const rowIssues = [];
        const product = products.get(row.refId);
        const prep = recipes.get(row.refId);
        const label = product?.name || prep?.name || 'Ингредиент';
        if (!valid(row.quantity)) rowIssues.push('Укажите количество.');
        if (!units[row.unit]) rowIssues.push('Неизвестная единица измерения.');
        if (product) {
          const basePrice = productBasePrice(product);
          if (!valid(product.price)) rowIssues.push('Нет цены.');
          if (!positive(product.packQuantity)) rowIssues.push('Укажите количество в упаковке больше нуля.');
          if (valid(product.price) && positive(product.packQuantity) && basePrice.value === null) rowIssues.push('Не удалось рассчитать цену: проверьте единицу и величину упаковки.');
          const amount = convertProductQuantity(product, row.quantity, row.unit, basePrice.unit);
          if (valid(row.quantity) && amount === null) rowIssues.push('Единицы несовместимы: задайте массу штуки или коэффициент г/мл.');
          if (basePrice.value !== null && amount !== null) {
            const cost = finiteOrNull(basePrice.value * amount);
            if (cost === null) rowIssues.push('Слишком большая стоимость.');
            else knownCost = cost;
          }
          massGrams = convertProductQuantity(product, row.quantity, row.unit, 'g');
          const hasLoss = row.lossPercent !== null && row.lossPercent !== undefined;
          const hasOutput = row.outputGrams !== null && row.outputGrams !== undefined;
          if (hasLoss || hasOutput) {
            if (massGrams === null) rowIssues.push('Для обработки нужна известная масса сырья.');
            if (hasLoss && (!valid(row.lossPercent) || row.lossPercent > 100)) rowIssues.push('Потери должны быть от 0 до 100%.');
            if (hasOutput && (!valid(row.outputGrams) || (massGrams !== null && row.outputGrams > massGrams + 1e-8))) rowIssues.push('Выход должен быть от нуля до исходного веса.');
            if (massGrams !== null && (!hasLoss || (valid(row.lossPercent) && row.lossPercent <= 100))) {
              const expected = hasLoss ? syncLoss(massGrams, row.lossPercent) : massGrams;
              if (hasLoss && hasOutput && valid(row.outputGrams) && Math.abs(expected - row.outputGrams) > Math.max(1e-7, massGrams * 1e-7)) rowIssues.push('Потери и выход не согласованы.');
              massGrams = hasOutput && valid(row.outputGrams) ? row.outputGrams : expected;
            }
          }
        } else if (prep && prep.type === 'prep') {
          if (row.unit !== 'g' && row.unit !== 'kg') rowIssues.push('Готовый полуфабрикат учитывается в граммах или килограммах.');
          const mass = valid(row.quantity) && (row.unit === 'g' || row.unit === 'kg') ? finiteOrNull(row.quantity * units[row.unit].factor) : null;
          massGrams = mass;
          const nested = calculate(prep.id, nextStack);
          // Do not duplicate an entire descendant issue tree: shared references can
          // otherwise grow the message list exponentially even when calculations are cached.
          if (!nested.complete) rowIssues.push('Неполный расчёт полуфабриката. Откройте его рецептуру.');
          if (!positive(prep.actualYield)) rowIssues.push('Нет фактического выхода полуфабриката.');
          if (positive(prep.actualYield) && mass !== null) {
            const cost = finiteOrNull(nested.knownCost / prep.actualYield * mass);
            if (cost === null) rowIssues.push('Слишком большая стоимость.');
            else knownCost = cost;
          }
          // A prep's production losses are included in its gram price. Never apply them again here.
        } else {
          rowIssues.push('Выберите продукт или полуфабрикат.');
        }
        return { knownCost, complete: rowIssues.length === 0, issues: rowIssues.map(issue => label + ': ' + issue), massGrams };
      });
      let knownCost = 0;
      for (const row of rows) {
        const sum = finiteOrNull(knownCost + row.knownCost);
        if (sum === null) issues.push('Слишком большая общая стоимость.');
        else knownCost = sum;
        issues.push(...row.issues);
      }
      if (!rows.length) issues.push('Добавьте ингредиенты.');
      let massGrams = null;
      if (recipe.type === 'prep') {
        if (positive(recipe.actualYield)) massGrams = recipe.actualYield;
        else issues.push('Укажите фактический выход партии больше нуля.');
      } else if (rows.length && rows.every(row => row.massGrams !== null)) {
        massGrams = finiteOrNull(rows.reduce((sum, row) => sum + row.massGrams, 0));
      }
      const complete = issues.length === 0;
      const costPerGram = recipe.type === 'prep' && complete ? finiteOrNull(knownCost / recipe.actualYield) : null;
      if (recipe.type === 'prep' && complete && costPerGram === null) issues.push('Слишком большая себестоимость грамма.');
      const result = { knownCost, complete: issues.length === 0, issues, massGrams, rows, costPerGram };
      cache.set(id, result);
      return result;
    }
    return calculate(recipeId, new Set());
  }

  const api = { units, parseNumber, syncLoss, lossFromOutput, productBasePrice, convertProductQuantity, wouldCreateCycle, calcRecipe };
  root.KitchenCalc = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
