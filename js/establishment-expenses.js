(function(root,factory){
  const node=typeof module==='object'&&module.exports;
  const api=factory(node?require('./storage.js'):root.KitchenStorage,node?require('./calculations.js'):root.KitchenCalc,node?require('./packaging.js'):root.KitchenPackaging,node?require('./expense-allocation.js'):root.KitchenExpenseAllocation);
  if(node)module.exports=api;else root.KitchenExpenses=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(S,C,P,A){
  'use strict';
  const categories=Object.freeze([{key:'rent',label:'Аренда'},{key:'utilities',label:'Коммунальные платежи'},{key:'payroll',label:'Зарплаты'},{key:'other',label:'Прочие расходы'}].map(Object.freeze));
  const valid=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
  const positive=value=>valid(value)&&value>0;
  const NOTE='Плановая оценка: месячные расходы распределены поровну на плановые продаваемые порции всех блюд. Учтены только указанные расходы; результат не является чистой прибылью заведения.';
  function allocation(config){
    const result={status:'missing',period:null,plannedPortions:null,monthlyTotal:null,perPortion:null,categories:[],issues:[]};
    if(config===undefined){result.issues.push('Сначала заполните и сохраните раздел «Расходы заведения».');return result;}
    let clean;try{clean=S.expenseConfig(config);}catch(error){result.status='invalid';result.issues.push(error.message);return result;}
    result.period=clean.period;result.plannedPortions=clean.plannedPortions;
    if(!clean.period||!positive(clean.plannedPortions)||categories.some(c=>clean[c.key]===null)){
      result.status='incomplete';result.issues.push('Укажите месяц, план продаж и каждую статью расходов. Если расходов по статье нет, введите 0.');return result;
    }
    const monthlyTotal=categories.reduce((sum,c)=>sum+clean[c.key],0),perPortion=monthlyTotal/clean.plannedPortions;
    if(!valid(monthlyTotal)||!valid(perPortion)||(monthlyTotal>0&&perPortion===0)){
      result.status='overflow';result.issues.push('Суммы слишком велики или малы для точного расчёта.');return result;
    }
    result.categories=categories.map(c=>({...c,monthly:clean[c.key],perPortion:clean[c.key]/clean.plannedPortions}));
    if(result.categories.some(c=>c.monthly>0&&c.perPortion===0)){
      result.categories=[];result.status='overflow';result.issues.push('Доля статьи слишком мала для расчёта.');return result;
    }
    Object.assign(result,{status:'ready',monthlyTotal,perPortion});return result;
  }
  function calculate(state,id,portions){
    const recipe=state?.recipes?.find(r=>r.id===id);
    const distribution=state?.financialJournal?.allocationPeriod?A.resolve(state.financialJournal,recipe?.sellingPrice):allocation(state?.establishmentExpenses);
    const result={...distribution,foodPerPortion:null,packagingPerPortion:null,fullCostPerPortion:null,totalCost:null,expenseTotal:null,sellingPrice:null,profitPerPortion:null,marginPercent:null,portions:null};
    if(!recipe||recipe.type!=='dish'){result.status='invalid-recipe';result.issues=['Расходы распределяются только на готовое блюдо, без начисления на полуфабрикаты.'];return result;}
    const base=recipe.portions===undefined?1:recipe.portions,count=portions===undefined?base:portions;
    if(!positive(base)||!positive(count)){result.status='invalid-portions';result.issues=['Укажите количество порций больше нуля.'];return result;}
    result.portions=count;
    if(distribution.status!=='ready')return result;
    let food,packaging;try{food=C.calcRecipe(state,id);packaging=P.calculate(state,recipe,base);}catch(error){result.status='incomplete-food';result.issues=['Не удалось рассчитать ингредиенты и упаковку: '+error.message];return result;}
    if(!food.complete||!packaging.complete){result.status='incomplete-food';result.issues=['Уточните цены, количества, выход полуфабрикатов и упаковку. Неполная калькуляция не считается полной себестоимостью.'];return result;}
    const foodCost=food.knownCost/base,packCost=packaging.knownCost/base,full=foodCost+packCost+distribution.perPortion,total=full*count,expenseTotal=distribution.perPortion*count;
    if(![foodCost,packCost,full,total,expenseTotal].every(valid)||(food.knownCost>0&&foodCost===0)||(packaging.knownCost>0&&packCost===0)||(full>0&&total===0)||(distribution.perPortion>0&&expenseTotal===0)){
      result.status='overflow';result.issues=['Значения слишком велики или малы для расчёта себестоимости.'];return result;
    }
    Object.assign(result,{foodPerPortion:foodCost,packagingPerPortion:packCost,fullCostPerPortion:full,totalCost:total,expenseTotal});
    const price=recipe.sellingPrice;
    if(price==null){result.status='missing-price';result.issues=['Укажите цену продажи за одну порцию для расчёта результата и маржи.'];return result;}
    if(!valid(price)){result.status='invalid-price';result.issues=['Цена продажи должна быть конечным неотрицательным числом.'];return result;}
    const profit=price-full;
    if(!Number.isFinite(profit)){result.status='overflow';result.issues=['Результат слишком велик для расчёта.'];return result;}
    result.sellingPrice=price;result.profitPerPortion=Object.is(profit,-0)?0:profit;
    if(price===0)result.issues.push('Маржа не рассчитывается при нулевой цене продажи.');
    else{
      const margin=Math.abs(profit)<=Number.MAX_VALUE/100?profit*100/price:profit/price*100;
      if(Number.isFinite(margin)&&(profit===0||margin!==0))result.marginPercent=Object.is(margin,-0)?0:margin;
      else result.issues.push('Маржа слишком велика или мала для расчёта.');
    }
    result.status='ready';return result;
  }
  return {categories,NOTE,allocation,calculate};
});
