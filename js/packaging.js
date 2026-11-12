(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KitchenPackaging = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Materials have their own dimensions. Food's units and mass formulas stay unchanged.
  const units = Object.freeze({
    pcs: {label:'шт.',base:'pcs',factor:1},
    m: {label:'м',base:'m',factor:1},
    cm: {label:'см',base:'m',factor:0.01},
    g: {label:'г',base:'g',factor:1},
    kg: {label:'кг',base:'g',factor:1000},
    ml: {label:'мл',base:'ml',factor:1},
    l: {label:'л',base:'ml',factor:1000}
  });
  const valid = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const positive = value => valid(value) && value > 0;
  function convert(quantity, from, to) {
    const source = units[from], target = units[to];
    if (!valid(quantity) || !source || !target || source.base !== target.base) return null;
    // Use the ratio first: kg -> kg must not overflow through an intermediate gram value.
    const amount = quantity * (source.factor / target.factor);
    return valid(amount) && !(quantity > 0 && amount === 0) ? amount : null;
  }
  function basePrice(item) {
    const unit = units[item?.unit];
    if (!unit || !valid(item.price) || !positive(item.packQuantity)) return {value:null,unit:unit?.base ?? null};
    const quantity = convert(item.packQuantity,item.unit,unit.base);
    if (!positive(quantity)) return {value:null,unit:unit.base};
    const value = item.price / quantity;
    return {value:valid(value) && !(item.price > 0 && value === 0) ? value : null,unit:unit.base};
  }
  const normalize = value => String(value ?? '').trim().toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/\s+/g,' ');
  function activeIngredients(state, recipe) {
    const products = new Map((state.products || []).map(item => [item.id,item]));
    const recipes = new Map((state.recipes || []).map(item => [item.id,item]));
    const ids = new Set(), byName = new Map(), visited = new Set(), pending = [recipe];
    while (pending.length) {
      const current = pending.pop();
      if (!current || visited.has(current.id)) continue;
      visited.add(current.id);
      for (const row of current.ingredients || []) {
        // An empty/zero food line does not account for any consumption. It must
        // not make a real additional serving appear already paid for.
        if (!positive(row.quantity)) continue;
        const product = products.get(row.refId), prep = recipes.get(row.refId);
        if (product) {
          ids.add(product.id);
          byName.set(normalize(product.name),product.id);
        } else if (prep?.type === 'prep') {
          ids.add(prep.id);
          byName.set(normalize(prep.name),prep.id);
          pending.push(prep);
        }
      }
    }
    return {ids,byName};
  }
  function calculate(state, recipe, portions) {
    const count = portions === undefined ? recipe?.portions ?? 1 : portions;
    const items = new Map((state.packaging || []).map(item => [item.id,item]));
    const food = activeIngredients(state,recipe);
    const issues = [], warnings = [];
    if (!positive(count)) issues.push('Укажите количество порций больше нуля.');
    const rows = (recipe?.packaging || []).map(row => {
      const item = items.get(row.refId), name = item?.name || 'Упаковка или добавка';
      const rowIssues = [], rowWarnings = [];
      const mode = row.costMode ?? 'auto';
      // A persisted identity survives later renaming. Stale identities are only
      // hints: once actual food consumption disappears, its extra serving costs again.
      const matchedIngredientRefId = item ? (food.ids.has(row.ingredientRefId)
        ? row.ingredientRefId : food.byName.get(normalize(item.name)) ?? null) : null;
      const duplicate = matchedIngredientRefId !== null;
      const included = mode === 'included' || (mode === 'auto' && duplicate);
      let quantity = null, knownCost = 0;
      if (!['auto','additional','included'].includes(mode)) rowIssues.push('Выберите способ учёта стоимости.');
      if (row.freeForGuest !== undefined && typeof row.freeForGuest !== 'boolean') rowIssues.push('Некорректная отметка бесплатной выдачи.');
      if (row.ingredientRefId !== undefined && (typeof row.ingredientRefId !== 'string' || !row.ingredientRefId.trim() || row.ingredientRefId.length > 200)) {
        rowIssues.push('Некорректная ссылка для защиты от двойного учёта.');
      }
      if (!item) rowIssues.push('Выберите позицию из справочника упаковки.');
      if (!positive(row.quantity)) rowIssues.push('Укажите расход на порцию больше нуля.');
      else if (positive(count)) {
        const scaled = row.quantity * count;
        if (!positive(scaled)) rowIssues.push('Количество упаковки слишком велико или слишком мало.');
        else quantity = scaled;
      }
      if (!units[row.unit]) rowIssues.push('Неизвестная единица расхода.');
      if (item && (!units[item.unit] || !units[row.unit] || units[item.unit].base !== units[row.unit].base)) {
        rowIssues.push('Единицы закупки и расхода несовместимы.');
      }
      const price = item ? basePrice(item) : {value:null,unit:null};
      if (duplicate && mode === 'auto') rowWarnings.push('Совпадает с пищевым ингредиентом: стоимость уже учтена в составе и повторно не добавлена. Для отдельной дополнительной выдачи выберите «Дополнительно».');
      if (duplicate && mode === 'additional') rowWarnings.push('Совпадает с пищевым ингредиентом. Проверьте, что указан отдельный дополнительный расход, а не повтор той же порции.');
      if (included && mode === 'included') rowWarnings.push('Стоимость отмечена как уже учтённая в ингредиентах и повторно не добавлена.');
      if (item && !included) {
        if (!valid(item.price)) rowIssues.push('Нет закупочной цены.');
        if (!positive(item.packQuantity)) rowIssues.push('Укажите закупленное количество больше нуля.');
        if (valid(item.price) && positive(item.packQuantity) && price.value === null) rowIssues.push('Не удалось рассчитать цену единицы: проверьте величину закупки.');
        if (quantity !== null && units[row.unit] && price.unit && units[row.unit].base === price.unit) {
          const amount = convert(quantity,row.unit,price.unit);
          if (amount === null) rowIssues.push('Количество упаковки слишком велико или слишком мало.');
          else if (price.value !== null) {
            const cost = amount * price.value;
            if (!valid(cost) || (amount > 0 && price.value > 0 && cost === 0)) rowIssues.push('Стоимость упаковки слишком велика или слишком мала.');
            else knownCost = cost;
          }
        }
      }
      issues.push(...rowIssues.map(message => name + ': ' + message));
      warnings.push(...rowWarnings.map(message => name + ': ' + message));
      return {id:row.id,refId:row.refId,name,quantity,perPortionQuantity:row.quantity,unit:row.unit,
        knownCost,complete:rowIssues.length === 0,issues:rowIssues,warnings:rowWarnings,
        included,duplicate,matchedIngredientRefId,freeForGuest:row.freeForGuest === true,unitPrice:price.value,baseUnit:price.unit};
    });
    let knownCost = 0;
    for (const row of rows) {
      const sum = knownCost + row.knownCost;
      if (!valid(sum)) issues.push('Общая стоимость упаковки слишком велика.');
      else knownCost = sum;
    }
    return {knownCost,complete:issues.length === 0,issues:[...new Set(issues)],warnings:[...new Set(warnings)],rows};
  }
  function resolveLinks(state) {
    let changed = false;
    const recipes = (state.recipes || []).map(recipe => {
      if (!recipe.packaging?.length) return recipe;
      const result = calculate(state,recipe);
      let rowsChanged = false;
      const packaging = recipe.packaging.map((row,index) => {
        const matched = result.rows[index].matchedIngredientRefId;
        if ((row.costMode ?? 'auto') !== 'auto' || !matched || row.ingredientRefId === matched) return row;
        rowsChanged = true;
        return {...row,ingredientRefId:matched};
      });
      if (!rowsChanged) return recipe;
      changed = true;
      return {...recipe,packaging};
    });
    return changed ? {...state,recipes} : state;
  }
  return {units,basePrice,convert,calculate,resolveLinks};
});
