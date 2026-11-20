(function(root){
  'use strict';
  const E=root.KitchenExpenses,C=root.KitchenCalc,S=root.KitchenStorage;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=value=>value==null?'':new Intl.NumberFormat('ru-RU',{maximumFractionDigits:8,useGrouping:false}).format(value);
  // Raw inputs round-trip the saved number; only displayed money is rounded.
  const inputNumber=value=>value==null?'':new Intl.NumberFormat('ru-RU',{maximumSignificantDigits:21,useGrouping:false}).format(value);
  const money=value=>typeof value==='number'&&Number.isFinite(value)?new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',minimumFractionDigits:2,maximumFractionDigits:2}).format(Math.abs(value)<.005?0:value):'—';
  const percent=value=>value==null?'—':new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(value)+' %';
  function metric(key,label,value,format=money){return `<div><dt>${esc(label)}</dt><dd data-expense="${key}">${esc(format(value))}</dd></div>`;}
  function breakdown(r,css='expense-breakdown'){
    const batch=r.portions!=null&&r.portions!==1;
    return r.categories.length?`<table class="${css}"><thead><tr><th>Статья</th><th>На 1 порцию</th>${batch?`<th>Всего на ${esc(num(r.portions))} порц.</th>`:''}</tr></thead><tbody>${r.categories.map(c=>`<tr><td>${esc(c.label)}</td><td>${esc(money(c.perPortion))}</td>${batch?`<td>${esc(money(c.perPortion*r.portions))}</td>`:''}</tr>`).join('')}</tbody></table>`:'';
  }
  function renderControl(state,id,portions,{enabled=false,result}={}){
    const label=`<label class="expenses-toggle"><input id="include-establishment-expenses" type="checkbox" ${enabled?'checked':''}>Учитывать расходы заведения</label>`;
    if(!enabled)return `<section class="expense-switch-block" aria-label="Учёт расходов заведения">${label}</section>`;
    const r=result||E.calculate(state,id,portions);
    return `<section class="expense-switch-block" aria-label="Учёт расходов заведения">${label}<div class="expense-control-summary" aria-live="polite"><p>Дополнительные расходы на порцию: <strong data-expense="control-per-portion">${esc(money(r.perPortion))}</strong></p>${r.perPortion==null?`<p class="field-help">Расходы пока не настроены или заполнены не полностью. ${r.issues.map(esc).join(' ')}</p>`:''}</div>${r.categories.length?`<details class="expense-breakdown-details"><summary>Расходы по статьям</summary>${breakdown(r)}</details>`:''}<button class="expenses-open" type="button">Открыть расходы заведения</button></section>`;
  }
  function renderCard(state,id,portions,{invalid=false,result,showBreakdown=true}={}){
    const r=result?{...result,issues:[...result.issues]}:E.calculate(state,id,portions);
    if(invalid){r.status='invalid-input';r.issues=['Исправьте числовые поля перед оценкой полной себестоимости.'];for(const key of ['foodPerPortion','packagingPerPortion','fullCostPerPortion','totalCost','expenseTotal','profitPerPortion','marginPercent'])r[key]=null;}
    const batch=r.portions!=null&&r.portions!==1;
    const table=breakdown(r,showBreakdown?'expense-breakdown':'expense-print-table');
    const detail=table?(showBreakdown?`<details class="expense-breakdown-details"><summary>Расходы по статьям</summary>${table}</details>`:`<div class="expense-print-breakdown">${table}</div>`):'';
    return `<section class="profitability-card establishment-costs" data-expense-status="${esc(r.status)}"><h2>С учётом расходов заведения</h2><p class="profitability-basis">${r.period?`Месяц: ${esc(r.period)} · ${r.method==='by-revenue'?`По выручке: ${esc(money(r.revenue))}; доля накладных ${esc(percent(r.ratePercent))}.`:`План: ${esc(num(r.plannedPortions))} продаваемых порций.`} `:''}Упаковка учитывается один раз. Продуктовая маржа выше показана отдельно.</p>${detail}<dl class="profitability-grid">${metric('additional-per-portion','Дополнительные расходы на порцию',r.perPortion)}${batch?metric('additional-total','Дополнительные расходы на выбранные порции',r.expenseTotal):''}${metric('food','Продуктовая себестоимость порции',r.foodPerPortion)}${metric('packaging','Упаковка на порцию',r.packagingPerPortion)}${metric('full-per-portion','Расчётная себестоимость порции',r.fullCostPerPortion)}${batch?metric('full-total','Расчётная себестоимость выбранных порций',r.totalCost):''}${metric('result','Результат с порции после указанных затрат',r.profitPerPortion)}${metric('margin','Маржа с учётом расходов',r.marginPercent,percent)}</dl>${r.issues.length?`<div class="profitability-status" role="status">${r.issues.map(issue=>`<p>${esc(issue)}</p>`).join('')}</div>`:''}<p class="profitability-note">${esc(r.note||E.NOTE)}</p>${showBreakdown?'<button type="button" class="expenses-open">Открыть расходы заведения</button>':''}</section>`;
  }
  function mount(host,options){
    let view='entry',active,period;
    host.innerHTML='<nav class="expense-workspace-tabs" aria-label="Расходы и история"><button type="button" id="expense-entry-tab" aria-pressed="true">Расходы заведения</button><button type="button" id="financial-journal-tab" aria-pressed="false">Журнал и календарь</button></nav><div class="expense-workspace-pane"></div>';
    const pane=host.querySelector('.expense-workspace-pane');
    function render(edit){active=KitchenFinancialJournalUI.mount(pane,{journal:options.getJournal?.(),legacy:options.getConfig?.(),onChange:options.onChange,onSave:options.onSave,onReset:options.onReset||(()=>{}),view,period,edit,onEdit:target=>{period=active.period;view='entry';render(target);}});host.querySelector('#expense-entry-tab').setAttribute('aria-pressed',String(view==='entry'));host.querySelector('#financial-journal-tab').setAttribute('aria-pressed',String(view==='journal'));}
    function switchView(next){if(next===view)return;if(active.dirty&&(!confirm('Сохранить изменения перед открытием другого представления? Отмена оставит форму на экране.')||!options.onSave()))return;period=active.period;view=next;render();}
    host.querySelector('#expense-entry-tab').onclick=()=>switchView('entry');host.querySelector('#financial-journal-tab').onclick=()=>switchView('journal');render();
    return {value:()=>active.value(),candidate:state=>({...state,financialJournal:active.value()}),committed:state=>active.committed(state.financialJournal),get journalActive(){return true;}};
  }
  root.KitchenExpensesUI={renderCard,renderControl,mount};
})(typeof globalThis!=='undefined'?globalThis:this);
