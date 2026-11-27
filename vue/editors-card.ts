import { cloneVNode, createStaticVNode, defineComponent, Fragment, h, type VNodeChild } from 'vue'

interface Amount {quantity: number | null; unit:string}
interface CardRow {id:string; refId:string|null; name:string; note:string; isPrep:boolean; total:Amount; perPortion:Amount}
const quantityFormatter=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:8,useGrouping:false})
const massFormatter=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:3,useGrouping:false})
const moneyFormatter=new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',minimumFractionDigits:2,maximumFractionDigits:2})
const count=(v:number)=>quantityFormatter.format(v)
const mass=(v:number)=>massFormatter.format(v)
const money=(v:number)=>Number.isFinite(v)?moneyFormatter.format(v):'Значение слишком велико'
const kitchen=globalThis as any

// These pure domain views already encode the same calculations and text as print.
// Only trusted generated sections enter this adapter. User strings in them are
// escaped by the original modules; recipe text below is rendered as Vue text.
function section(markup:string) {return markup ? cloneVNode(createStaticVNode(markup,1),{key:markup}) : null}
function serving(value:Amount) {
  const label=kitchen.KitchenCalc.units[value?.unit]?.label
  return value?.quantity==null||!label?'Не задано':count(value.quantity)+' '+label
}
function header(model:any, title:string, options:any) {
  const {recipe,result,yieldGrams}=model.view
  const minutes=kitchen.KitchenWorkspacePolicy.minutes(recipe)
  const favorite=kitchen.KitchenWorkspacePolicy.favorite(recipe)
  const icon=(type:string)=>section(kitchen.KitchenUnifiedCard.icon(type))
  const metric=(label:string,value:number,isMass=false)=>h('div',{class:'unified-metric'},[
    h('dt',[icon(isMass?'yield':'cost'),h('span',label)]),
    h('dd',isMass ? (Number.isFinite(value)?count(value):'—')+' г' : Number.isFinite(value)?money(value):'Не задано')
  ])
  const metrics=model.mode==='chef' ? [metric('Выход блюда',yieldGrams,true)] : [
    metric('Продуктовая себестоимость порции',model.perPortionView.result.knownCost),metric('Ингредиенты на '+count(recipe.portions)+' порц.',result.knownCost),
    options.showBusiness?metric('Цена продажи порции',recipe.sellingPrice):metric('Выход блюда',yieldGrams,true)
  ]
  return [h('p',{class:'eyebrow'},title),h('div',{class:'unified-recipe-hero'},[
    h('div',{class:'unified-recipe-name'},[h('h1',recipe.name),h('div',{class:'unified-recipe-chips'},[
      h('span',[icon('portion'),count(recipe.portions)+' порции']),h('span',[icon('clock'),minutes==null?'Время не задано':count(minutes)+' мин'])]),
      !result.complete&&model.mode!=='chef'&&h('p',{class:'unified-incomplete'},'Стоимость неполная · уточните ингредиенты'),
      h('button',{type:'button',class:'favorite-recipe','aria-pressed':String(favorite)},favorite?'★ В избранном':'☆ В избранное')]),
    h('div',{class:'unified-recipe-photo'},[h('div',{id:'card-photos'}),h('button',{type:'button',class:'unified-photo-edit','aria-label':'Добавить или изменить фотографии блюда'},'▧')]),
    h('dl',{class:'unified-recipe-metrics'},metrics)
  ]),h('p',{class:'card-portions'},'Количество порций: '+count(recipe.portions)),minutes!=null&&h('p',{class:'unified-print-time'},'Время приготовления: '+count(minutes)+' мин')]
}
function details(recipe:any) {
  return [recipe.technology?.trim() && h('h2','Способ приготовления'),recipe.technology?.trim() && h('div',{class:'card-text recipe-technology'},recipe.technology),
    recipe.note?.trim()&&h('h2','Примечания'),recipe.note?.trim()&&h('div',{class:'card-text recipe-notes'},recipe.note)]
}
function ingredientName(row:CardRow) {
  const note=row.note && h('div',{class:'card-text ingredient-note'},row.note)
  if(!row.isPrep)return h('td',[row.name,note])
  return h('td',[h('span',{class:'classic-ingredient-label',style:{display:'contents'}},[
    h('span',{class:'classic-ingredient-title',style:{display:'contents'}},row.name),
    h('span',{class:'prep-label'},'Полуфабрикат'),note])])
}
function table(model:any,chef:boolean) {
  const {recipe,result}=model.view, batch=recipe.portions!==1
  const columns=chef ? ['Ингредиент','На 1 порцию',...(batch?['Всего на '+count(recipe.portions)+' порций']:[])] : ['Ингредиент','Кол-во','Выход, г','Цена за ед.','Сумма']
  const td=(klass:string,text:string)=>h('td',{class:klass},text)
  const rows=model.rows.map((row:CardRow,index:number)=>{
    const values:VNodeChild[]=[ingredientName(row)]
    if(chef){values.push(td('chef-per-portion',serving(row.perPortion)));if(batch)values.push(td('chef-total',serving(row.total)))}
    else {
      const source=recipe.ingredients[index], calc=result.rows[index]
      values.push(td('calculation-quantity',serving(source)),td('calculation-output',calc.massGrams==null?'Неизвестен':mass(calc.massGrams)),
        td('unified-unit-price',kitchen.KitchenUnifiedCard.unitPrice(source,calc)),td('calculation-cost',money(calc.knownCost)+(calc.complete?'':' (неполно)')))
    }
    return h('tr',{key:row.id,'data-ingredient-id':row.id,'data-ref-id':row.refId||''},values)
  })
  return h('table',{class:['food-ingredients',chef?'chef-ingredients':'calculation-ingredients']},[
    h('thead',[h('tr',columns.map((title,i)=>h('th',{class:!chef&&i===3?'unified-unit-price':undefined},title)))]),h('tbody',rows)
  ])
}
function chefCard(state:any,model:any,options:any) {
  const {recipe,yieldGrams}=model.view, one=model.perPortionView?.yieldGrams
  return [...header(model,options.home?'РЕЦЕПТ':'КАРТА ПОВАРА',options), table(model,true),
    options.showBusiness&&section(kitchen.KitchenPackagingUI.renderCard(state,recipe,recipe.portions,false)),
    one!=null&&h('p',{class:'chef-yield'},['Выход на 1 порцию: ',h('strong',mass(one)+' г')]),
    recipe.portions!==1&&yieldGrams!=null&&h('p',{class:'chef-yield'},['Выход на '+count(recipe.portions)+' порций: ',h('strong',mass(yieldGrams)+' г')]),
    ...details(recipe)]
}
function businessCard(state:any,model:any,options:any) {
  const {recipe,result,rawMass,yieldGrams}=model.view,n=recipe.portions,business=options.showBusiness
  const packaging=business?kitchen.KitchenPackaging.calculate(state,recipe,n):{knownCost:0,complete:true}
  const total=result.knownCost+packaging.knownCost,complete=result.complete&&packaging.complete
  const adjusted=options.expenseResult, computed=(v:number)=>Number.isFinite(v)?money(v):'не рассчитано'
  if(!Number.isFinite(total))throw Error('Слишком большая полная себестоимость. Уменьшите количество порций.')
  return [...header(model,'КАЛЬКУЛЯЦИОННАЯ КАРТА',options),table(model,false),
    business&&section(kitchen.KitchenPackagingUI.renderCard(state,recipe,n,true)),business&&h('div',{id:'recipe-expense-control',class:'recipe-expense-control'}),
    h('p',{class:'card-raw-mass'},'Общая масса ингредиентов: '+(rawMass==null?'неизвестна — задайте коэффициенты массы':mass(rawMass)+' г')),
    h('p',{class:'card-yield'},[h('strong','Выход готового блюда: '+(yieldGrams==null?'неизвестен — уточните массу компонентов':mass(yieldGrams)+' г'))]),
    business&&recipe.packaging?.length>0&&h('p',{class:'food-cost'},'Себестоимость ингредиентов: '+money(result.knownCost)+(result.complete?'':' (неполно)')),
    ...(adjusted ? [h('p',{class:'card-base-cost'},'Продукты и упаковка без расходов: '+money(total)+(complete?'':' (неполно)')),
      h('p',{class:'card-cost','data-cost-basis':'with-expenses'},'Расчётная себестоимость с расходами: '+computed(adjusted.totalCost)),
      h('p',{class:'portion-cost'},'На одну порцию с расходами: '+computed(adjusted.fullCostPerPortion))]
    : [h('p',{class:'card-cost'},(complete?'Общая себестоимость':'Известная часть стоимости (расчёт неполный)')+': '+money(total)),h('p',{class:'portion-cost'},'На одну порцию: '+money(total/n)+(complete?'':' (неполно)'))]),
    business&&section(kitchen.KitchenProfitabilityView.render(state,recipe.id)),
    adjusted&&section(kitchen.KitchenExpensesUI.renderCard(state,recipe.id,n,{result:adjusted,showBreakdown:false})),
    ...details(recipe)]
}
export const RecipeCard=defineComponent({
  name:'RecipeCard',props:['state','model','options'],
  setup(p) {return ()=>h(Fragment,null,p.options.home||p.model.mode==='chef'?chefCard(p.state,p.model,p.options):businessCard(p.state,p.model,p.options))}
})
