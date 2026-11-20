/* One selected overhead source. No recipe recursion, storage or price mutation. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./financial-journal.js'):root.KitchenFinancialJournal);if(typeof module==='object'&&module.exports)module.exports=api;else root.KitchenExpenseAllocation=api;})(typeof globalThis!=='undefined'?globalThis:this,function(J){
  'use strict';
  const BASE_LABELS={cash:'оплаченные расходы',accrual:'оплаченные и начисленные расходы',forecast:'плановые расходы, включая оценки'};
  function resolve(input,sellingPrice){
    const r={status:'missing',source:'journal',method:null,period:null,plannedPortions:null,monthlyTotal:null,perPortion:null,categories:[],issues:[],revenue:null,ratePercent:null,basis:null,note:''};
    let j;try{j=J.validate(input);}catch(e){r.status='invalid';r.issues.push(e.message);return r;}
    const p=j.allocationPeriod;if(!p){r.issues.push('Выберите и примените месяц распределения расходов.');return r;}
    const cfg=j.months[p].allocation,s=J.summary(j,p),eligible=s.rows.filter(e=>e.included&&J.overhead(e));
    Object.assign(r,{period:p,method:cfg.method,basis:cfg.basis,plannedPortions:cfg.plannedPortions,revenue:s.revenueCents===null?null:s.revenueCents/100});
    if(cfg.basis!=='forecast'&&eligible.some(e=>J.accounting(e)==='unclassified')){r.status='incomplete';r.issues.push('Укажите метод учёта старых накладных расходов PR41: оплачено, начислено или оценка.');return r;}
    const rows=eligible.filter(e=>J.inBasis(e,cfg.basis)),total=J.sum(rows.map(e=>e.amountCents));r.monthlyTotal=total/100;
    let factor;
    if(cfg.method==='planned-portions'){
      if(!Number.isSafeInteger(cfg.plannedPortions)||cfg.plannedPortions<=0){r.status='incomplete';r.issues.push('План порций: укажите целое число больше нуля.');return r;}
      factor=1/cfg.plannedPortions;
    }else{
      if(!(s.revenueCents>0)){r.status='incomplete';r.issues.push('Для распределения по выручке нужна положительная выручка выбранного месяца.');return r;}
      r.ratePercent=total/s.revenueCents*100;
      if(typeof sellingPrice!=='number'||!Number.isFinite(sellingPrice)||sellingPrice<0){r.status='missing-price';r.issues.push('Укажите цену продажи блюда для распределения по выручке.');return r;}
      factor=sellingPrice/(s.revenueCents/100);
    }
    r.perPortion=total/100*factor;
    r.categories=J.categories(j).map(c=>({key:c.id,label:c.name,monthly:J.sum(rows.filter(e=>e.categoryId===c.id).map(e=>e.amountCents))/100})).filter(c=>rows.some(e=>e.categoryId===c.key)).map(c=>({...c,perPortion:c.monthly*factor}));
    if(!Number.isFinite(r.perPortion)||r.perPortion<0||r.categories.some(c=>!Number.isFinite(c.perPortion))||(total>0&&factor>0&&r.perPortion===0)){
      r.status='overflow';r.perPortion=null;r.categories=[];r.issues.push('Значения слишком велики или малы для точного распределения.');return r;
    }
    r.note=(cfg.method==='by-revenue'?'Накладные расходы / месячная выручка × цена продажи порции.':'Накладные расходы / плановые порции.')+' Источник: '+BASE_LABELS[cfg.basis]+'. Упаковка исключена из накладных; на полуфабрикаты расходы повторно не начисляются. Это расчётная оценка, а не чистая прибыль.';
    r.status='ready';return r;
  }
  function previewLegacy(journal,config){
    const j=J.validate(journal),rows=[],issues=[];if(!config?.period){return {rows,issues:['Прежний план отсутствует или месяц не задан.']};}
    try{J.month(config.period);}catch(e){return {rows,issues:[e.message]};}
    for(const key of ['rent','utilities','payroll','other']){
      const value=config[key],id='fj-legacy-'+key+'-'+config.period,categoryId='fj-cat-'+key,category=J.BUILTINS.find(c=>c.id===categoryId);
      if(typeof value!=='number'||!Number.isFinite(value)||value<0){issues.push('Заполните прежний план: '+category.name+'.');continue;}
      const amount=Math.round(value*100);
      if(!Number.isSafeInteger(amount)||amount>J.MAX_CENTS||Math.abs(value-amount/100)>Math.max(1e-10,Math.abs(value)*Number.EPSILON*2)){issues.push(category.name+': сумма содержит доли копейки; прежний план сохранён без округления.');continue;}
      const existing=j.expenses.some(e=>e.id===id)||J.occurrences(j,config.period).some(e=>e.categoryId===categoryId);
      rows.push({id,categoryId,name:category.name,amountCents:amount,existing});
    }
    return {rows,issues,period:config.period};
  }
  function adoptLegacy(journal,config){const p=previewLegacy(journal,config);if(p.issues.length)throw Error(p.issues.join(' '));let j=J.validate(journal);for(const row of p.rows)if(!row.existing)j=J.putExpense(j,{id:row.id,name:'Прежний план: '+row.name,categoryId:row.categoryId,amountCents:row.amountCents,date:p.period+'-01',repeat:'once',until:null,included:true,allocate:true,status:'estimated',accounting:'estimated',note:'Явно перенесён прежний план. Это оценка, не подтверждённая оплата.',overrides:{},legacySource:'establishmentExpenses'});return j;}
  return {BASE_LABELS,resolve,previewLegacy,adoptLegacy};
});
