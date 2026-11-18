(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./calculations.js'):root.KitchenCalc,typeof module==='object'&&module.exports?require('./workspace-policy.js'):root.KitchenWorkspacePolicy);if(typeof module==='object'&&module.exports)module.exports=api;else root.KitchenUnifiedCard=api;})(typeof globalThis!=='undefined'?globalThis:this,function(C,Policy){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=value=>Number.isFinite(value)?new Intl.NumberFormat('ru-RU',{maximumFractionDigits:8,useGrouping:false}).format(value):'—';
  const money=value=>Number.isFinite(value)?new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',minimumFractionDigits:2,maximumFractionDigits:2}).format(value):'Не задано';
  const icon=(kind)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${kind==='clock'?'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>':kind==='portion'?'<path d="M5 3v7m3-7v7M2 3v7m0 0h6M5 10v11M17 3v18m0-18c-6 4-6 10 0 10"/>':kind==='cost'?'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v12c0 4 16 4 16 0V5M4 11c0 4 16 4 16 0"/>':'<path d="M3 16h18M5 16a7 7 0 0 1 14 0M12 7V4m-2 0h4M3 20h18"/>'}</svg>`;
  function header(model,title,{showBusiness=true}={}){
    const {recipe,result,yieldGrams}=model.view,minutes=Policy.minutes(recipe),count=recipe.portions;
    const metric=(label,value,type='money')=>`<div class="unified-metric"><dt>${icon(type==='mass'?'yield':'cost')}<span>${esc(label)}</span></dt><dd>${esc(type==='mass'?num(value)+' г':money(value))}</dd></div>`;
    const metrics=model.mode==='chef'?metric('Выход блюда',yieldGrams,'mass'):
      metric('Продуктовая себестоимость порции',model.perPortionView.result.knownCost)+metric('Ингредиенты на '+num(count)+' порц.',result.knownCost)+(showBusiness?metric('Цена продажи порции',recipe.sellingPrice):metric('Выход блюда',yieldGrams,'mass'));
    return `<p class="eyebrow">${title}</p><div class="unified-recipe-hero"><div class="unified-recipe-name"><h1>${esc(recipe.name)}</h1><div class="unified-recipe-chips"><span>${icon('portion')}${esc(num(count))} порции</span><span>${icon('clock')}${minutes===null?'Время не задано':esc(num(minutes))+' мин'}</span></div>${!result.complete&&model.mode!=='chef'?'<p class="unified-incomplete">Стоимость неполная · уточните ингредиенты</p>':''}<button type="button" class="favorite-recipe" aria-pressed="${Policy.favorite(recipe)}">${Policy.favorite(recipe)?'★ В избранном':'☆ В избранное'}</button></div><div class="unified-recipe-photo"><div id="card-photos"></div><button type="button" class="unified-photo-edit" aria-label="Добавить или изменить фотографии блюда">▧</button></div><dl class="unified-recipe-metrics">${metrics}</dl></div><p class="card-portions">Количество порций: ${esc(num(count))}</p>${minutes===null?'':`<p class="unified-print-time">Время приготовления: ${esc(num(minutes))} мин</p>`}`;
  }
  function unitPrice(row,computed){
    const unit=C.units[row.unit];if(!unit||!computed.complete||!(row.quantity>0))return '—';
    const target=unit.base==='g'?1000:unit.base==='ml'?1000:1,label=unit.base==='g'?'кг':unit.base==='ml'?'л':'шт.';
    const price=computed.knownCost/row.quantity/unit.factor*target;
    return Number.isFinite(price)?money(price)+' / '+label:'—';
  }
  return {header,unitPrice,icon};
});
