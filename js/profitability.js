(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./calculations.js') : root.KitchenCalc);
  if (node) module.exports = api;
  else root.KitchenProfitability = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';

  const NOTE = 'Расчёт основан на продуктовой себестоимости. Зарплата, аренда, коммунальные расходы, налоги и другие затраты не учитываются. Указанная прибыль не является чистой прибылью заведения';
  const nonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

  // This module consumes the existing food calculation. Packaging and operating
  // expenses are deliberately outside its per-portion profitability basis.
  function calculate(state, recipeId) {
    const output = {
      sellingPrice:null, foodCostPerPortion:null, grossProfitPerPortion:null,
      markupPercent:null, grossMarginPercent:null, foodCostPercent:null,
      status:'invalid-recipe', issues:[]
    };
    const recipe = Array.isArray(state?.recipes) ? state.recipes.find(item => item?.id === recipeId) : null;
    if (!recipe || recipe.type !== 'dish' || !Array.isArray(state?.products)) {
      output.issues.push('Блюдо не найдено или его данные недоступны.');
      return output;
    }
    const portions = recipe.portions === undefined ? 1 : recipe.portions;
    if (!nonnegative(portions) || portions === 0) {
      output.issues.push('Укажите количество порций больше нуля.');
      return output;
    }
    if (recipe.sellingPrice != null && !nonnegative(recipe.sellingPrice)) {
      output.status='invalid-price';
      output.issues.push('Укажите конечную неотрицательную цену продажи.');
      return output;
    }
    output.sellingPrice=recipe.sellingPrice ?? null;
    let food;
    try { food=C.calcRecipe(state,recipeId); }
    catch (_) {
      output.issues.push('Не удалось рассчитать продуктовую себестоимость блюда.');
      return output;
    }
    if (!food.complete || !nonnegative(food.knownCost)) {
      output.status='incomplete';
      output.issues.push('Для показателей доходности завершите продуктовую калькуляцию: уточните цены, количества и выход полуфабрикатов.');
      return output;
    }
    const cost=food.knownCost/portions;
    if (!nonnegative(cost) || (food.knownCost > 0 && cost === 0)) {
      output.status='overflow';
      output.issues.push('Продуктовая себестоимость одной порции слишком велика или слишком мала для расчёта.');
      return output;
    }
    output.foodCostPerPortion=cost;
    if (output.sellingPrice === null) {
      output.status='missing-price';
      output.issues.push('Укажите цену продажи одной порции.');
      return output;
    }

    const price=output.sellingPrice, profit=price-cost;
    output.grossProfitPerPortion=Object.is(profit,-0) ? 0 : profit;
    output.status='ready';
    function percent(numerator, denominator, label) {
      // Multiply first when safe to retain representable subnormal percentages;
      // divide first for large numerators to avoid an unnecessary intermediate overflow.
      let value = Math.abs(numerator) <= Number.MAX_VALUE/100
        ? (numerator*100)/denominator : (numerator/denominator)*100;
      if (!Number.isFinite(value) || (numerator !== 0 && value === 0)) {
        output.issues.push(label+': показатель слишком велик или слишком мал для расчёта.');
        return null;
      }
      return Object.is(value,-0) ? 0 : value;
    }
    if (cost === 0) output.issues.push('Наценка не рассчитывается при нулевой продуктовой себестоимости.');
    else output.markupPercent=percent(profit,cost,'Наценка');
    if (price === 0) output.issues.push('Валовая маржа и фудкост не рассчитываются при нулевой цене продажи.');
    else {
      output.grossMarginPercent=percent(profit,price,'Валовая маржа');
      output.foodCostPercent=percent(cost,price,'Фудкост');
    }
    return output;
  }
  return {NOTE,calculate};
});
