'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Showcase=require('../js/recipe-showcase'),Model=require('../js/recipe-card-model'),P=require('../js/packaging'),E=require('../js/establishment-expenses');
function fixture(){
  return {version:1,products:[{id:'raw',name:'Сырьё',price:753.76,packQuantity:1,unit:'kg',massPerPiece:null,gramsPerMl:null}],packaging:[{id:'box',name:'Упаковка',price:3.9,packQuantity:1,unit:'pcs'}],recipes:[
    {id:'prep',type:'prep',name:'Готовый полуфабрикат',actualYield:400,ingredients:[{id:'raw-row',refId:'raw',quantity:1000,unit:'g'}]},
    {id:'dish',type:'dish',name:'Гиро в булке куриное большое',portions:1,actualYield:100,sellingPrice:350,ingredients:[{id:'ready',refId:'prep',quantity:100,unit:'g'}],packaging:[{id:'use-box',refId:'box',quantity:1,unit:'pcs',costMode:'additional'}]}
  ],establishmentExpenses:{method:'planned-portions',period:'2026-11',plannedPortions:1000,rent:40000,utilities:10000,payroll:24000,other:0}};
}
function project(state,count=1,{mode='calculation',enabled=false}={}){
  const model=Model.create(state,'dish',count,mode),packaging=P.calculate(state,model.view.recipe,count);
  const options={packaging,total:model.view.result.knownCost+packaging.knownCost,complete:model.view.result.complete&&packaging.complete,includeExpenses:enabled,expenseResult:enabled?E.calculate(state,'dish',count):undefined};
  return {model,options,metrics:Showcase.metrics(model,options),html:Showcase.render(model,options)};
}
const metric=(p,key)=>p.metrics.find(m=>m.key===key),near=(a,b)=>assert(Math.abs(a-b)<1e-9,`${a} != ${b}`);
test('188.44 ingredients + 3.90 packaging, and 74 only after expenses are enabled',()=>{
  const state=fixture(),before=JSON.stringify(state),off=project(state),on=project(state,1,{enabled:true});
  near(metric(off,'food').value,188.44);near(metric(off,'packaging').value,3.9);near(metric(off,'base').value,192.34);
  assert.equal(metric(off,'expenses').kind,'disabled');assert.equal(metric(off,'full'),undefined);
  near(metric(on,'expenses').value,74);near(metric(on,'full').value,266.34);
  near(metric(on,'expenses').categories.reduce((n,c)=>n+c.perPortion,0),74);
  assert.equal(JSON.stringify(state),before,'Viewing never writes recipes or settings');
});
test('temporary portions show one explicit batch basis without compounded rounding',()=>{
  const state=fixture(),before=JSON.stringify(state);
  for(const count of [3,1,.5,10,1]){const p=project(state,count,{enabled:true});near(metric(p,'yield').value,100*count);near(metric(p,'base').value,192.34*count);near(metric(p,'full').value,266.34*count);near(metric(p,'expenses').value,74*count);}
  assert.equal(JSON.stringify(state),before);
});
test('chef has yield and photographs, with no financial projection or financial markup',()=>{
  const p=project(fixture(),2,{mode:'chef',enabled:true});assert.deepEqual(p.metrics.map(m=>m.key),['yield']);
  assert.doesNotMatch(p.html,/₽|себестоимост|упаковка|расходы заведения/i);assert.match(p.html,/card-photos/);
});
test('unconfigured expenses remain unknown instead of becoming zero or a full cost',()=>{
  const state=fixture();delete state.establishmentExpenses;const p=project(state,1,{enabled:true});
  assert.equal(metric(p,'expenses').value,null);assert.equal(metric(p,'full').value,null);assert.match(p.html,/Не рассчитано|Настройте расходы/);assert.doesNotMatch(p.html,/NaN|Infinity/);
});
test('missing procurement prices identify partial totals and never claim a complete full cost',()=>{
  const state=fixture();state.products[0].price=null;const p=project(state,1,{enabled:true});
  assert.match(metric(p,'food').note,/Известная часть/);assert.match(metric(p,'base').note,/неполный/);assert.equal(metric(p,'full').value,null);
});
test('zero-cost food, packaging and configured expenses are real zeroes',()=>{
  const state=fixture();state.products[0].price=0;state.packaging[0].price=0;for(const c of E.categories)state.establishmentExpenses[c.key]=0;
  const p=project(state,1,{enabled:true});for(const key of ['food','packaging','base','expenses','full'])assert.equal(metric(p,key).value,0);assert.doesNotMatch(p.html,/Не рассчитано/);
});
test('renamed categories remain text; no expense or photo metadata is persisted by rendering',()=>{
  const p=project(fixture(),1,{enabled:true});p.options.expenseResult.categories[0].label='<img src=x onerror=alert(1)>';
  const html=Showcase.render(p.model,p.options);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img src=x/);
});
test('old recipe without photos or portions uses the same one-portion model',()=>{
  const state=fixture();delete state.recipes[1].portions;const p=project(state);near(metric(p,'base').value,192.34);assert.match(p.html,/card-photos/);assert.equal(state.recipes[1].photoIds,undefined);
});
