(function(root) {
  'use strict';
  const C = typeof module === 'object' && module.exports ? require('./calculations.js') : root.KitchenCalc;
  function scale(state, id, portions, lookup = C.createRecipeLookup(state)) {
    const original = lookup.recipes.get(id);
    if (!original || original.type !== 'dish') throw Error('Блюдо не найдено.');
    if (!Number.isFinite(portions) || portions <= 0) throw Error('Укажите количество порций больше нуля.');
    const factor = portions / (original.portions || 1);
    function multiply(value) {
      if (value == null) return null;
      const scaled = value * factor;
      if (!Number.isFinite(scaled) || (value > 0 && scaled === 0)) throw Error('Количество порций слишком велико или слишком мало.');
      return scaled;
    }
    const recipe = {...original, portions, actualYield:multiply(original.actualYield), ingredients:original.ingredients.map(row => ({...row,quantity:multiply(row.quantity),outputGrams:multiply(row.outputGrams)}))};
    // Only the selected dish changes size. Its ingredients still resolve in
    // the original immutable library for this calculation.
    const recipes = {get: key => key === id ? recipe : lookup.recipes.get(key)};
    const result = C.calcRecipe(state,id,{products:lookup.products, recipes});
    if (result.issues.some(issue => /слишком больш/i.test(issue))) throw Error('Количество порций слишком велико.');
    let rawMass = 0;
    for (const row of recipe.ingredients) {
      const product = lookup.products.get(row.refId);
      const mass = product ? C.convertProductQuantity(product,row.quantity,row.unit,'g') : row.refId && ['g','kg'].includes(row.unit) && row.quantity != null ? row.quantity*C.units[row.unit].factor : null;
      if (mass == null || !Number.isFinite(rawMass + mass)) {rawMass=null;break;}
      rawMass += mass;
    }
    return {recipe,result,rawMass,yieldGrams:recipe.actualYield ?? result.massGrams};
  }
  root.KitchenRecipeView = {scale};
  if (typeof module === 'object' && module.exports) module.exports = {scale};
})(typeof globalThis !== 'undefined' ? globalThis : this);
