(function (root) {
  'use strict';

  // These templates are views of the existing recipe model, not saved records.
  // A later presentation can add a renderer without changing kitchen data.
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const num = (value, digits = 3) => value == null ? '' : new Intl.NumberFormat('ru-RU',{maximumFractionDigits:digits,useGrouping:false}).format(value);
  const money = value => !Number.isFinite(value) ? 'Значение слишком велико' : new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',minimumFractionDigits:2,maximumFractionDigits:2}).format(value);

  function ingredient(row) {
    return `${esc(row.name)}${row.isPrep ? '<span class="prep-label">Полуфабрикат</span>' : ''}${row.note ? `<div class="card-text ingredient-note">${esc(row.note)}</div>` : ''}`;
  }
  function attributes(row) {
    return `data-ingredient-id="${esc(row.id)}" data-ref-id="${esc(row.refId || '')}"`;
  }
  function serving(amount) {
    if (amount?.quantity == null) return 'Не задано';
    const label = root.KitchenCalc.units[amount.unit]?.label;
    return label ? esc(num(amount.quantity,8))+' '+esc(label) : 'Не задано';
  }
  function header(model, title) {
    const recipe = model.view.recipe;
    return `<p class="eyebrow">${title}</p><h1>${esc(recipe.name)}</h1><div id="card-photos"></div><p class="card-portions">Количество порций: ${esc(num(recipe.portions,8))}</p>`;
  }
  function details(recipe) {
    return `${recipe.technology?.trim() ? `<h2>Способ приготовления</h2><div class="card-text recipe-technology">${esc(recipe.technology)}</div>` : ''}${recipe.note?.trim() ? `<h2>Примечания</h2><div class="card-text recipe-notes">${esc(recipe.note)}</div>` : ''}`;
  }
  function chef(state, model) {
    const {recipe} = model.view, count = recipe.portions, batch = count !== 1;
    const perPortionYield = model.perPortionView?.yieldGrams;
    return header(model,'КАРТА ПОВАРА')+
      `<table class="food-ingredients chef-ingredients"><thead><tr><th>Ингредиент</th><th>На 1 порцию</th>${batch ? `<th>Всего на ${esc(num(count,8))} порций</th>` : ''}</tr></thead><tbody>${model.rows.map(row => `<tr ${attributes(row)}><td>${ingredient(row)}</td><td class="chef-per-portion">${serving(row.perPortion)}</td>${batch ? `<td class="chef-total">${serving(row.total)}</td>` : ''}</tr>`).join('')}</tbody></table>`+
      root.KitchenPackagingUI.renderCard(state,recipe,count,false)+
      (perPortionYield == null ? '' : `<p class="chef-yield">Выход на 1 порцию: <strong>${esc(num(perPortionYield))} г</strong></p>`)+
      (batch && model.view.yieldGrams != null ? `<p class="chef-yield">Выход на ${esc(num(count,8))} порций: <strong>${esc(num(model.view.yieldGrams))} г</strong></p>` : '')+
      details(recipe);
  }
  function calculation(state, model) {
    const {view} = model, {recipe,result} = view, count = recipe.portions;
    const packaging = root.KitchenPackaging.calculate(state,recipe,count);
    const total = result.knownCost + packaging.knownCost;
    if (!Number.isFinite(total)) throw Error('Слишком большая полная себестоимость. Уменьшите количество порций.');
    const complete = result.complete && packaging.complete;
    return header(model,'КАЛЬКУЛЯЦИОННАЯ КАРТА')+
      `<table class="food-ingredients calculation-ingredients"><thead><tr><th>Ингредиент</th><th>Кол-во</th><th>Выход, г</th><th>Сумма</th></tr></thead><tbody>${recipe.ingredients.map((source,index) => {
        const row = model.rows[index], computed = result.rows[index];
        const unit = root.KitchenCalc.units[source.unit]?.label;
        return `<tr ${attributes(row)}><td>${ingredient(row)}</td><td class="calculation-quantity">${source.quantity == null || !unit ? 'Не задано' : esc(num(source.quantity,8))+' '+esc(unit)}</td><td class="calculation-output">${computed.massGrams == null ? 'Неизвестен' : esc(num(computed.massGrams))}</td><td class="calculation-cost">${esc(money(computed.knownCost))}${computed.complete ? '' : ' (неполно)'}</td></tr>`;
      }).join('')}</tbody></table>`+
      root.KitchenPackagingUI.renderCard(state,recipe,count,true)+
      `<p class="card-raw-mass">Общая масса ингредиентов: ${view.rawMass == null ? 'неизвестна — задайте коэффициенты массы' : esc(num(view.rawMass))+' г'}</p><p class="card-yield"><strong>Выход готового блюда: ${view.yieldGrams == null ? 'неизвестен — уточните массу компонентов' : esc(num(view.yieldGrams))+' г'}</strong></p>`+
      ((recipe.packaging || []).length ? `<p class="food-cost">Себестоимость ингредиентов: ${esc(money(result.knownCost))}${result.complete ? '' : ' (неполно)'}</p>` : '')+
      `<p class="card-cost">${complete ? 'Общая себестоимость' : 'Известная часть стоимости (расчёт неполный)'}: ${esc(money(total))}</p><p class="portion-cost">На одну порцию: ${esc(money(total/count))}${complete ? '' : ' (неполно)'}</p>`+
      details(recipe);
  }
  const renderers = Object.freeze({chef,calculation});
  function render(state, model) {
    const renderer = Object.hasOwn(renderers,model?.mode) ? renderers[model.mode] : null;
    if (typeof renderer !== 'function') throw Error('Неизвестная форма технологической карты.');
    return renderer(state,model);
  }
  root.KitchenRecipeCardTemplates = {render};
})(typeof globalThis !== 'undefined' ? globalThis : this);
