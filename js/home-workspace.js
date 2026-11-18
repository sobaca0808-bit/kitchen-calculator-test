(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./calculations.js'):root.KitchenCalc);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.KitchenHomeWorkspace=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C){
  'use strict';
  // A presentation of the one existing recipe model; no saved mode, database,
  // photo mutation, packaging allocation or replacement calculation engine.
  const SECTIONS=Object.freeze(['dish','prep','products']);
  const TOOLS=Object.freeze(['recipes','prep','products']);
  const allowed=section=>SECTIONS.includes(section);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=value=>value==null?'Не определён':new Intl.NumberFormat('ru-RU',{maximumFractionDigits:8,useGrouping:false}).format(value);
  const money=value=>Number.isFinite(value)?new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',minimumFractionDigits:2,maximumFractionDigits:2}).format(value):'Не рассчитано';
  function renderCard(model){
    const {recipe,result,yieldGrams}=model.view;
    const quantities=recipe.ingredients.map((row,i)=>{const reference=model.rows[i],computed=result.rows[i],unit=C.units[row.unit];
      return `<tr data-ingredient-id="${esc(row.id)}"><td>${esc(reference.name)}${reference.isPrep?'<span class="prep-label">Полуфабрикат</span>':''}${row.note?`<div class="card-text">${esc(row.note)}</div>`:''}</td><td>${row.quantity==null||!unit?'Не задано':esc(num(row.quantity))+' '+esc(unit.label)}</td><td>${esc(money(computed.knownCost))}${computed.complete?'':' (неполно)'}</td></tr>`;
    }).join('');
    return `<p class="eyebrow">ДОМАШНИЙ РЕЦЕПТ</p><h1>${esc(recipe.name)}</h1><dl class="home-recipe-results"><div><dt>Порций</dt><dd>${esc(num(recipe.portions))}</dd></div><div><dt>Выход готового блюда</dt><dd>${yieldGrams==null?'Не определён':esc(num(yieldGrams))+' г'}</dd></div><div><dt>${result.complete?'Стоимость ингредиентов':'Известная стоимость ингредиентов'}</dt><dd class="home-food-cost">${esc(money(result.knownCost))}</dd></div></dl>${result.complete?'':'<p class="home-cost-status">Расчёт неполный: уточните количества, цены и выход заготовок.</p>'}<table class="food-ingredients home-ingredients"><thead><tr><th>Ингредиент</th><th>Количество</th><th>Стоимость</th></tr></thead><tbody>${quantities}</tbody></table>${recipe.technology?.trim()?`<h2>Способ приготовления</h2><div class="card-text recipe-technology">${esc(recipe.technology)}</div>`:''}${recipe.note?.trim()?`<h2>Заметки</h2><div class="card-text recipe-notes">${esc(recipe.note)}</div>`:''}`;
  }
  return {SECTIONS,TOOLS,allowed,renderCard};
});
