(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./calculations.js') : root.KitchenCalc,
    node ? require('./recipe-view.js') : root.KitchenRecipeView);
  if (node) module.exports = api;
  else root.KitchenRecipeCardModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C, V) {
  'use strict';

  // Presentation only: saved recipes, procurement formulas and photo/draft data
  // remain owned by their existing modules. New card forms can be added here.
  const MODES = Object.freeze(['chef', 'calculation']);
  function quantity(value, factor) {
    if (value == null) return null;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
    const converted = value * factor;
    if (!Number.isFinite(converted) || (value > 0 && converted === 0)) {
      throw Error('Количество ингредиента слишком велико или слишком мало.');
    }
    return converted;
  }
  function serving(row, result, product, isPrep) {
    const unit = C.units[row.unit];
    if (!unit) return {quantity:null, unit:null};
    if (isPrep) {
      // This is already a ready-to-use mass. Production loss belongs to the
      // linked preparation; applying it again would change an assembly recipe.
      return ['g','kg'].includes(row.unit)
        ? {quantity:quantity(row.quantity, unit.factor), unit:'g'}
        : {quantity:null, unit:'g'};
    }
    const processed = product && (row.lossPercent != null || row.outputGrams != null);
    if (processed) {
      // The existing calculator has already resolved processing output. Never
      // show procurement/raw mass as the amount a cook should take for assembly.
      return {quantity:quantity(result?.massGrams, 1), unit:'g'};
    }
    return {quantity:quantity(row.quantity, unit.factor), unit:unit.base};
  }
  function create(state, id, portions, mode = 'calculation') {
    if (!MODES.includes(mode)) throw Error('Неизвестная форма технологической карты.');
    const view = V.scale(state, id, portions);
    // Always derive a serving from the saved recipe, never from a previously
    // scaled or rounded view. This also supports old recipes without portions.
    const single = V.scale(state, id, 1);
    const products = new Map(state.products.map(item => [item.id,item]));
    const recipes = new Map(state.recipes.map(item => [item.id,item]));
    const rows = view.recipe.ingredients.map((row,index) => {
      const product = products.get(row.refId), recipe = recipes.get(row.refId);
      const isPrep = !product && recipe?.type === 'prep';
      const reference = product || (isPrep ? recipe : null);
      const perPortion = serving(single.recipe.ingredients[index], single.result.rows[index], product, isPrep);
      const total = serving(row, view.result.rows[index], product, isPrep);
      const issues = [];
      if (!reference) issues.push('Выберите продукт или полуфабрикат.');
      if (perPortion.quantity == null || total.quantity == null) issues.push('Уточните готовое количество ингредиента.');
      return {id:row.id,refId:row.refId,name:reference?.name || 'Ингредиент не выбран',isPrep,
        perPortion,total,note:row.note || '',issues};
    });
    return {view,perPortionView:single,mode,rows};
  }
  return {MODES,create};
});
