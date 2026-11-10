(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KitchenStorage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Separate preview namespace: never read or write the live calculator key.
  const KEY = 'kitchen-calculator-pr2-browser-test-v1';
  const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
  const MAX_RECIPE_DEPTH = 100;
  const UNITS = ['g', 'kg', 'ml', 'l', 'pcs'];
  const PACKAGING_UNITS = [...UNITS, 'm', 'cm'];
  const fail = message => { throw new Error(message); };
  const object = (value, label) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(label + ': ожидался объект.');
  };
  function text(value, label, required = false, max = 10000) {
    if (value == null && !required) return '';
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
      fail(label + ': ' + (required ? 'укажите непустую строку' : 'некорректный текст') + '.');
    }
    return required ? value.trim() : value;
  }
  function number(value, label, positive = false, maximum = Infinity) {
    if (value == null) return null;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 ||
        (positive && value === 0) || value > maximum) {
      fail(label + ': требуется ' + (positive ? 'положительное' : 'неотрицательное') + ' конечное число' +
        (maximum !== Infinity ? ' не больше ' + maximum : '') + '.');
    }
    return value;
  }
  function unit(value, label) {
    if (!UNITS.includes(value)) fail(label + ': неизвестная единица измерения.');
    return value;
  }
  function packagingUnit(value, label) {
    if (!PACKAGING_UNITS.includes(value)) fail(label + ': неизвестная единица упаковки.');
    return value;
  }
  function boolean(value, label) {
    if (value === undefined) return false;
    if (typeof value !== 'boolean') fail(label + ': ожидалось логическое значение.');
    return value;
  }
  const dimension = value => value === 'pcs' ? 'count' : ['g', 'kg'].includes(value) ? 'mass' : 'volume';
  const packagingDimension = value => ['m', 'cm'].includes(value) ? 'length' : dimension(value);
  function validate(input) {
    object(input, 'Данные');
    if (input.version !== 1) fail('Неподдерживаемая версия данных. Ожидается версия 1.');
    if (!Array.isArray(input.products) || !Array.isArray(input.recipes)) fail('В файле должны быть списки products и recipes.');
    const ids = new Set();
    function id(value, label) {
      const result = text(value, label, true, 200);
      if (!/^[A-Za-z0-9_-]+$/.test(value)) {
        fail(label + ': идентификатор может содержать только латинские буквы, цифры, дефис и знак подчёркивания.');
      }
      if (ids.has(result)) fail('Повторяющийся идентификатор: ' + result + '.');
      ids.add(result);
      return result;
    }
    const products = input.products.map((item, index) => {
      const label = 'Продукт ' + (index + 1);
      object(item, label);
      return {
        id: id(item.id, label + ', id'), name: text(item.name, label + ', название', true, 500),
        aliases: text(item.aliases, label + ', слова для поиска'),
        price: number(item.price, label + ', цена'),
        packQuantity: number(item.packQuantity, label + ', количество в упаковке', true),
        unit: unit(item.unit, label), massPerPiece: number(item.massPerPiece, label + ', масса штуки', true),
        gramsPerMl: number(item.gramsPerMl, label + ', граммов в миллилитре', true),
        note: text(item.note, label + ', заметка')
      };
    });
    let packaging;
    if (input.packaging !== undefined) {
      if (!Array.isArray(input.packaging)) fail('Справочник packaging должен быть списком.');
      packaging = input.packaging.map((item, index) => {
        const label = 'Упаковка ' + (index + 1);
        object(item, label);
        return {
          id: id(item.id, label + ', id'), name: text(item.name, label + ', название', true, 500),
          price: number(item.price, label + ', цена'),
          packQuantity: number(item.packQuantity, label + ', закупленное количество', true),
          unit: packagingUnit(item.unit, label), note: text(item.note, label + ', заметка')
        };
      });
    }
    const recipes = input.recipes.map((item, index) => {
      const label = 'Рецепт ' + (index + 1);
      object(item, label);
      if (!['prep', 'dish'].includes(item.type)) fail(label + ': неизвестный тип рецепта.');
      if (!Array.isArray(item.ingredients)) fail(label + ': отсутствует список ингредиентов.');
      return {
        id: id(item.id, label + ', id'), type: item.type,
        name: text(item.name, label + ', название', true, 500), note: text(item.note, label + ', заметка'),
        ...(item.portions !== undefined ? {portions: number(item.portions, label + ', порции', true) ?? 1} : {}),
        ...(item.technology !== undefined ? {technology: text(item.technology, label + ', технология')} : {}),
        actualYield: number(item.actualYield, label + ', фактический выход', true),
        ...(item.packaging !== undefined ? {packaging: (() => {
          if (!Array.isArray(item.packaging)) fail(label + ': упаковка должна быть списком.');
          if (item.type !== 'dish' && item.packaging.length) fail(label + ': упаковка и фасовка учитывается при выдаче блюда, а не в полуфабрикате.');
          return item.packaging.map((row, rowIndex) => {
            const prefix = label + ', упаковка ' + (rowIndex + 1);
            object(row, prefix);
            const costMode = row.costMode ?? 'auto';
            if (!['auto', 'additional', 'included'].includes(costMode)) fail(prefix + ': неизвестный способ учёта стоимости.');
            return {
              id: id(row.id, prefix + ', id'),
              refId: row.refId == null ? null : text(row.refId, prefix + ', ссылка', true, 200),
              ...(row.ingredientRefId !== undefined ? {ingredientRefId: text(row.ingredientRefId, prefix + ', ссылка для защиты от двойного учёта', true, 200)} : {}),
              quantity: number(row.quantity, prefix + ', расход на порцию', true),
              unit: packagingUnit(row.unit, prefix),
              freeForGuest: boolean(row.freeForGuest, prefix + ', бесплатная выдача'), costMode
            };
          });
        })()} : {}),
        ingredients: item.ingredients.map((row, rowIndex) => {
          const prefix = label + ', строка ' + (rowIndex + 1);
          object(row, prefix);
          return {
            id: id(row.id, prefix + ', id'),
            refId: row.refId == null ? null : text(row.refId, prefix + ', ссылка', true, 200),
            quantity: number(row.quantity, prefix + ', количество'), unit: unit(row.unit, prefix),
            lossPercent: number(row.lossPercent, prefix + ', потери', false, 100),
            outputGrams: number(row.outputGrams, prefix + ', расчётный выход'), note: text(row.note, prefix + ', заметка')
          };
        })
      };
    });
    const productMap = new Map(products.map(item => [item.id, item]));
    const recipeMap = new Map(recipes.map(item => [item.id, item]));
    const packagingMap = new Map((packaging || []).map(item => [item.id, item]));
    for (const recipe of recipes) {
      for (const row of recipe.packaging || []) {
        const prefix = '«' + recipe.name + '», упаковка ' + row.id;
        const item = packagingMap.get(row.refId);
        if (row.refId !== null && !item) fail(prefix + ': ссылка на отсутствующую позицию упаковки.');
        if (item && packagingDimension(item.unit) !== packagingDimension(row.unit)) {
          fail(prefix + ': несовместимые единицы закупки и расхода упаковки.');
        }
      }
      for (const row of recipe.ingredients) {
        const prefix = '«' + recipe.name + '», ингредиент ' + row.id;
        const product = productMap.get(row.refId);
        const prep = recipeMap.get(row.refId);
        if (row.refId !== null && !product && !prep) fail(prefix + ': ссылка на отсутствующий продукт или полуфабрикат.');
        if (prep && prep.type !== 'prep') fail(prefix + ': блюдо нельзя использовать как ингредиент.');
        if (prep && dimension(row.unit) !== 'mass') fail(prefix + ': полуфабрикат нужно измерять в граммах или килограммах.');
        if (prep && (row.lossPercent !== null || row.outputGrams !== null)) fail(prefix + ': у готового полуфабриката потери повторно не задаются.');
        if (product) {
          const from = dimension(row.unit), to = dimension(product.unit);
          const compatible = from === to ||
            ([from, to].includes('count') && [from, to].includes('mass') && product.massPerPiece !== null) ||
            ([from, to].includes('volume') && [from, to].includes('mass') && product.gramsPerMl !== null) ||
            ([from, to].includes('volume') && [from, to].includes('count') && product.gramsPerMl !== null && product.massPerPiece !== null);
          if (!compatible) fail(prefix + ': несовместимые единицы; задайте массу штуки или коэффициент г/мл.');
        }
        if (row.lossPercent !== null || row.outputGrams !== null) {
          if (dimension(row.unit) !== 'mass') fail(prefix + ': потери и выход задаются только для весового ингредиента.');
          if (row.quantity !== null) {
            const grams = row.quantity * (row.unit === 'kg' ? 1000 : 1);
            if (!Number.isFinite(grams)) fail(prefix + ': слишком большое количество.');
            const tolerance = Math.max(0.000001, grams * 0.000001);
            if (row.outputGrams !== null && row.outputGrams > grams + tolerance) fail(prefix + ': выход не может превышать исходную массу.');
            if (row.lossPercent !== null && row.outputGrams !== null &&
                Math.abs(grams * (1 - row.lossPercent / 100) - row.outputGrams) > tolerance) {
              fail(prefix + ': исходный вес, потери и выход не согласованы.');
            }
          }
        }
      }
    }
    // Iterative DFS also checks unused recipes without depending on call-stack depth.
    const colors = new Map();
    const depths = new Map();
    for (const recipe of recipes) {
      if (colors.get(recipe.id) === 2) continue;
      const stack = [{ id: recipe.id, exit: false }];
      while (stack.length) {
        const entry = stack.pop();
        if (entry.exit) {
          let depth = 1;
          for (const row of recipeMap.get(entry.id).ingredients) {
            if (recipeMap.has(row.refId)) depth = Math.max(depth, 1 + depths.get(row.refId));
          }
          if (depth > MAX_RECIPE_DEPTH) {
            fail('Глубина вложенных рецептов превышает ' + MAX_RECIPE_DEPTH + '. Разделите цепочку полуфабрикатов.');
          }
          depths.set(entry.id, depth);
          colors.set(entry.id, 2);
          continue;
        }
        const color = colors.get(entry.id);
        if (color === 1) fail('Обнаружена циклическая ссылка между полуфабрикатами.');
        if (color === 2) continue;
        colors.set(entry.id, 1);
        stack.push({ id: entry.id, exit: true });
        const refs = recipeMap.get(entry.id).ingredients.map(row => row.refId).filter(ref => recipeMap.has(ref));
        for (const ref of refs) stack.push({ id: ref, exit: false });
      }
    }
    return { version: 1, products, recipes, ...(packaging !== undefined ? {packaging} : {}) };
  }
  function parseJSON(source) {
    if (typeof source !== 'string') fail('Резервная копия должна быть текстовым JSON-файлом.');
    const bytes = typeof TextEncoder === 'function' ? new TextEncoder().encode(source).length : source.length * 2;
    if (bytes > MAX_IMPORT_BYTES) fail('Файл больше 10 МБ. Импорт отменён.');
    let value;
    try { value = JSON.parse(source); }
    catch (_) { fail('Не удалось прочитать JSON. Проверьте, что выбран файл резервной копии.'); }
    return validate(value);
  }
  const stringify = data => JSON.stringify(validate(data), null, 2);
  function getStorage(explicit) {
    if (explicit !== undefined) return explicit;
    if (typeof globalThis.localStorage === 'undefined') fail('Локальное хранилище недоступно в этом браузере.');
    return globalThis.localStorage;
  }
  function load(storage) {
    try {
      const source = getStorage(storage).getItem(KEY);
      return { data: source === null ? null : parseJSON(source), error: null };
    } catch (error) {
      return { data: null, error: 'Не удалось загрузить сохранённые данные: ' + error.message + ' Исходная запись не изменена.' };
    }
  }
  function save(data, storage) {
    try {
      const serialized = stringify(data);
      getStorage(storage).setItem(KEY, serialized);
      return { ok: true, error: null };
    } catch (error) {
      return { ok: false, error: 'Не удалось сохранить данные: ' + error.message + ' Скачайте JSON, чтобы не потерять изменения.' };
    }
  }
  return { KEY, MAX_IMPORT_BYTES, MAX_RECIPE_DEPTH, validate, parseJSON, stringify, load, save };
});
