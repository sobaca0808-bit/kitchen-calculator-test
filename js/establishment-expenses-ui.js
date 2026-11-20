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
    return `<section class="profitability-card establishment-costs" data-expense-status="${esc(r.status)}"><h2>С учётом расходов заведения</h2><p class="profitability-basis">${r.period?`Месяц: ${esc(r.period)} · План: ${esc(num(r.plannedPortions))} продаваемых порций. `:''}Упаковка учитывается один раз. Продуктовая маржа выше показана отдельно.</p>${detail}<dl class="profitability-grid">${metric('additional-per-portion','Дополнительные расходы на порцию',r.perPortion)}${batch?metric('additional-total','Дополнительные расходы на выбранные порции',r.expenseTotal):''}${metric('food','Продуктовая себестоимость порции',r.foodPerPortion)}${metric('packaging','Упаковка на порцию',r.packagingPerPortion)}${metric('full-per-portion','Расчётная себестоимость порции',r.fullCostPerPortion)}${batch?metric('full-total','Расчётная себестоимость выбранных порций',r.totalCost):''}${metric('result','Результат с порции после указанных затрат',r.profitPerPortion)}${metric('margin','Маржа с учётом расходов',r.marginPercent,percent)}</dl>${r.issues.length?`<div class="profitability-status" role="status">${r.issues.map(issue=>`<p>${esc(issue)}</p>`).join('')}</div>`:''}<p class="profitability-note">${esc(E.NOTE)}</p>${showBreakdown?'<button type="button" class="expenses-open">Открыть расходы заведения</button>':''}</section>`;
  }
  function mountAllocation(host,{config,onChange,onSave}){
    const initial=config||{method:'planned-portions',period:'',plannedPortions:null,rent:null,utilities:null,payroll:null,other:null};
    const input=(key,label)=>`<label>${esc(label)}<input id="expense-${key}" data-expense-field="${key}" type="text" inputmode="${key==='plannedPortions'?'numeric':'decimal'}" autocomplete="off" value="${esc(inputNumber(initial[key]))}" placeholder="Не задано"></label>`;
    host.innerHTML=`<div class="editor-head"><div class="editor-topline"><span class="badge">План на месяц</span><span id="save-state" class="save-state">${config?'Сохранено в браузере':'Не задано'}</span></div><h1>Расходы заведения</h1><p class="intro">Месячные расходы делятся поровну на плановое количество продаваемых порций всех блюд. Это средняя плановая оценка.</p></div><div class="editor-content expense-form"><div class="product-grid"><label>Расчётный месяц<input id="expense-period" type="month" value="${esc(initial.period)}"></label>${input('plannedPortions','План продаж за месяц, порций')}${E.categories.map(c=>input(c.key,c.label+' за месяц, ₽')).join('')}</div><p class="field-help">Если по статье расходов нет, введите 0. Пустое поле означает «Не задано». Закупочные продукты и упаковку сюда не включайте: они уже есть в калькуляции. Расходы не начисляются на полуфабрикаты повторно.</p><div id="expense-allocation" aria-live="polite"></div><p id="expense-form-error" class="inline-error" role="status"></p><p class="field-help">Итоги пересчитываются при вводе. Для применения к блюдам нажмите «Сохранить расходы». Рецепты и закупочные цены не меняются.</p></div><div class="form-actions"><button id="save-item" class="primary">Сохранить расходы</button></div>`;
    const $=selector=>host.querySelector(selector);
    function value(){
      const result={...initial,method:'planned-portions',period:$('#expense-period').value};
      for(const field of host.querySelectorAll('[data-expense-field]'))result[field.dataset.expenseField]=C.parseNumber(field.value);
      return S.expenseConfig(result);
    }
    function refresh(){
      let data,error;try{data=value();}catch(e){error=e.message;}
      for(const field of host.querySelectorAll('[data-expense-field]')){
        try{const n=C.parseNumber(field.value);if(field.dataset.expenseField==='plannedPortions'&&n!==null&&(!Number.isSafeInteger(n)||n<=0))throw Error('План продаж: целое число больше нуля.');field.removeAttribute('aria-invalid');field.setCustomValidity('');}
        catch(e){field.setAttribute('aria-invalid','true');field.setCustomValidity(e.message);}
      }
      $('#expense-form-error').textContent=error||'';
      const r=data?E.allocation(data):{issues:[error],status:'invalid'};
      $('#expense-allocation').innerHTML=r.status==='ready'?`<div class="base-price">Расходы за месяц<strong>${esc(money(r.monthlyTotal))}</strong><small>Дополнительные расходы на 1 продаваемую порцию: <strong data-expense="allocation">${esc(money(r.perPortion))}</strong></small></div>`:`<p class="field-help">${r.issues.map(esc).join(' ')}</p>`;
    }
    for(const field of host.querySelectorAll('input'))field.addEventListener('input',()=>{onChange();refresh();});
    $('#save-item').onclick=onSave;refresh();return {value,refresh};
  }
  function mount(host,options){
    let journalActive=false,active;
    host.innerHTML='<nav class="expense-workspace-tabs" aria-label="Инструменты расходов"><button type="button" id="expense-allocation-tab" aria-pressed="true">Распределение на блюда</button><button type="button" id="financial-journal-tab" aria-pressed="false">Финансовый журнал</button></nav><div class="expense-workspace-pane"></div>';
    const pane=host.querySelector('.expense-workspace-pane');
    function render(){
      active=journalActive?root.KitchenFinancialJournalUI.mount(pane,{journal:options.getJournal?.(),onChange:options.onChange,onSave:options.onSave,onReset:options.onReset||(()=>{})}):mountAllocation(pane,{...options,config:options.getConfig?options.getConfig():options.config});
      host.querySelector('#expense-allocation-tab').setAttribute('aria-pressed',String(!journalActive));host.querySelector('#financial-journal-tab').setAttribute('aria-pressed',String(journalActive));
    }
    for(const [id,mode]of [['expense-allocation-tab',false],['financial-journal-tab',true]])host.querySelector('#'+id).onclick=()=>{if(mode===journalActive||options.onSwitch&& !options.onSwitch())return;journalActive=mode;render();};
    render();return {value:()=>active.value(),candidate:state=>journalActive?{...state,financialJournal:active.value()}:{...state,establishmentExpenses:active.value()},committed:state=>{if(journalActive)active.committed(state.financialJournal);},get journalActive(){return journalActive;}};
  }
  root.KitchenExpensesUI={renderCard,renderControl,mount};
})(typeof globalThis!=='undefined'?globalThis:this);
