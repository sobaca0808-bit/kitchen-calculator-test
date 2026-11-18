(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.KitchenRecipeShowcase=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // A projection of the existing card results. Never reads or writes storage,
  // recomputes ingredient costs, or allocates establishment expenses.
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const finite=value=>typeof value==='number'&&Number.isFinite(value);
  const number=value=>finite(value)?new Intl.NumberFormat('ru-RU',{maximumFractionDigits:3}).format(value):'—';
  const money=value=>finite(value)?new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',minimumFractionDigits:2,maximumFractionDigits:2}).format(value):'Не рассчитано';
  function metrics(model,{packaging,total,complete,expenseResult,includeExpenses=false}={}){
    const {view,mode}=model;
    const result=[{key:'yield',label:'Выход готового блюда',value:view.yieldGrams,kind:'mass',note:finite(model.perPortionView?.yieldGrams)?number(model.perPortionView.yieldGrams)+' г на порцию':'Уточните коэффициенты массы'}];
    if(mode==='chef')return result;
    result.push({key:'food',label:'Продуктовая себестоимость',value:view.result.knownCost,kind:'money',emphasis:true,note:view.result.complete?'Только ингредиенты':'Известная часть · уточните цены и количества'},
      {key:'packaging',label:'Упаковка и фасовка',value:packaging?.knownCost,kind:'money',note:packaging?.complete?'Отдельно от ингредиентов':'Расчёт упаковки неполный'},
      {key:'base',label:'Продукты и упаковка',value:total,kind:'money',note:complete?'Без расходов заведения':'Известная часть · расчёт неполный'});
    if(!includeExpenses)result.push({key:'expenses',label:'Расходы заведения',value:null,kind:'disabled',note:'Не включены в калькуляцию'});
    else{
      result.push({key:'expenses',label:'Доля расходов заведения',value:expenseResult?.expenseTotal,kind:'money',note:finite(expenseResult?.expenseTotal)?'На выбранные порции':'Настройте расходы или уточните калькуляцию',categories:expenseResult?.categories||[]});
      result.push({key:'full',label:'Полная расчётная себестоимость',value:expenseResult?.totalCost,kind:'money',note:'Продукты + упаковка + учтённые расходы'});
    }
    return result;
  }
  function render(model,options={}){
    const {view}=model,count=view.recipe.portions;
    const cards=metrics(model,options).map(item=>`<div class="showcase-metric${item.emphasis?' showcase-metric-food':''}" data-showcase-metric="${item.key}"${item.kind==='disabled'?' data-disabled="true"':''}><dt>${esc(item.label)}</dt><dd>${esc(item.kind==='mass'?(finite(item.value)?number(item.value)+' г':'Не определён'):item.kind==='disabled'?'Не учитываются':money(item.value))}</dd><p>${esc(item.note)}</p>${item.categories?.length?`<details class="showcase-expense-details"><summary>По статьям · на ${esc(number(count))} порц.</summary><dl>${item.categories.map(c=>`<div><dt>${esc(c.label)}</dt><dd>${esc(money(c.perPortion*count))}</dd></div>`).join('')}</dl></details>`:''}</div>`).join('');
    return `<div class="recipe-showcase"><div class="showcase-visual"><div id="card-photos"></div><p class="showcase-photo-hint">Главное фото · нажмите для увеличения</p></div><section class="showcase-summary" aria-label="Краткие результаты калькуляции"><div class="showcase-basis"><span>${esc(number(count))} ${count===1?'порция':'порций'}</span><span>${model.mode==='chef'?'Готовая рецептура':'Все суммы — на выбранные порции'}</span></div><dl class="showcase-metrics">${cards}</dl><button type="button" class="showcase-edit" data-showcase-edit>Изменить рецепт</button></section></div>`;
  }
  return {metrics,render};
});
