(function (root, factory) {
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./profitability.js') : root.KitchenProfitability);
  if (node) module.exports = api;
  else root.KitchenProfitabilityView = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Profitability) {
  'use strict';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const rubles = new Intl.NumberFormat('ru-RU', {style:'currency',currency:'RUB',minimumFractionDigits:2,maximumFractionDigits:2});
  const percentages = new Intl.NumberFormat('ru-RU', {maximumFractionDigits:2});
  const available = value => typeof value === 'number' && Number.isFinite(value);
  // This affects display only: a rounded negative zero is not a loss of 0 ₽.
  const displayNumber = value => Math.abs(value) < .005 ? 0 : value;
  const money = value => available(value) ? rubles.format(displayNumber(value)) : '—';
  const percent = value => available(value) ? percentages.format(displayNumber(value))+' %' : '—';

  const messages = Object.freeze({
    'missing-price':'Укажите цену продажи в редакторе блюда.',
    incomplete:'Завершите продуктовую калькуляцию: пока себестоимость неполная, доходность не рассчитывается.',
    'invalid-price':'Исправьте цену продажи: укажите неотрицательное конечное число.',
    'invalid-recipe':'Не удалось рассчитать продуктовую себестоимость порции. Проверьте рецепт и количество порций.',
    overflow:'Значения слишком велики или слишком малы для расчёта доходности.'
  });

  function value(name, label, amount, format) {
    return `<div data-profit="${name}"><dt>${label}</dt><dd class="profitability-value">${esc(format(amount))}</dd></div>`;
  }
  function render(state, recipeId, options = {}) {
    const result = Profitability.calculate(state,recipeId);
    const invalid = !!options.invalid, foodInvalid = !!options.foodInvalid;
    const status = invalid ? 'invalid-input' : foodInvalid ? 'invalid-food-input' : result.status;
    const ready = !invalid && !foodInvalid && status === 'ready';
    const issueMessages = [];
    if (invalid) issueMessages.push(options.invalidMessage || 'Исправьте цену продажи.');
    if (foodInvalid) issueMessages.push('Исправьте количества, порции или выход перед оценкой доходности.');
    if (!invalid && !foodInvalid) {
      if (status !== 'ready') issueMessages.push(messages[status] || 'Проверьте данные для расчёта доходности.');
      // The calculator supplies precise explanations for zero denominators or
      // a percentage that exceeds finite arithmetic. No unavailable value is 0.
      if (status === 'ready') for (const issue of result.issues || []) if (typeof issue === 'string' && issue.trim()) issueMessages.push(issue);
    }
    const uniqueMessages = [...new Set(issueMessages)];
    const sale = !invalid && available(result.sellingPrice) && result.sellingPrice >= 0 ? result.sellingPrice : null;
    const cost = !foodInvalid && available(result.foodCostPerPortion) && result.foodCostPerPortion >= 0 ? result.foodCostPerPortion : null;
    const number = key => ready && available(result[key]) ? result[key] : null;

    return `<section class="profitability-card" data-profit-status="${esc(status)}" aria-label="Цена продажи и рентабельность"><h2>Цена продажи и рентабельность</h2><p class="profitability-basis">Продуктовая себестоимость одной порции. Упаковка не включена.</p><dl class="profitability-grid profitability-basis-values">${value('selling-price','Цена продажи за порцию',sale,money)}${value('food-cost','Продуктовая себестоимость порции',cost,money)}</dl><dl class="profitability-grid profitability-metrics">${value('gross-profit','Валовая прибыль с порции',number('grossProfitPerPortion'),money)}${value('markup','Наценка',number('markupPercent'),percent)}${value('gross-margin','Валовая маржа',number('grossMarginPercent'),percent)}${value('food-cost-percent','Фудкост',number('foodCostPercent'),percent)}</dl>${uniqueMessages.length ? `<div class="profitability-status" role="status">${uniqueMessages.map(message=>`<p>${esc(message)}</p>`).join('')}</div>` : ''}<p class="profitability-note">${esc(Profitability.NOTE)}</p></section>`;
  }
  return {render};
});
