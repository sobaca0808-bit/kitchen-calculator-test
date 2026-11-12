'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const F=require('../js/profitability.js');
const C=require('../js/calculations.js');
const S=require('../js/storage.js');
const Seed=require('../js/seed.js');
const Drafts=require('../js/drafts.js');
const near=(actual,expected)=>assert(Math.abs(actual-expected)<=Math.max(1e-12,Math.abs(expected)*1e-12),`${actual} differs from ${expected}`);
const copy=value=>JSON.parse(JSON.stringify(value));
function fixture(cost=100,sellingPrice=300,portions=1) {
  return {version:1,products:[{id:'food',name:'Тестовый продукт',aliases:'',price:cost,packQuantity:1,unit:'pcs',massPerPiece:100,gramsPerMl:null,note:''}],
    packaging:[{id:'box',name:'Тестовая упаковка',price:10000,packQuantity:1,unit:'pcs',note:''}],
    recipes:[{id:'dish',type:'dish',name:'Вымышленное блюдо',note:'',technology:'Приготовить.',portions,actualYield:100*portions,sellingPrice,
      ingredients:[{id:'food-row',refId:'food',quantity:portions,unit:'pcs',lossPercent:null,outputGrams:null,note:''}],
      packaging:[{id:'box-row',refId:'box',quantity:1,unit:'pcs',freeForGuest:true,costMode:'auto'}]}]};
}
function onlyNumbersOrNull(result) {
  for (const field of ['sellingPrice','foodCostPerPortion','grossProfitPerPortion','markupPercent','grossMarginPercent','foodCostPercent']) {
    assert(result[field]===null || Number.isFinite(result[field]),field+' must be finite or null');
  }
}
test('300 selling price and 100 food cost give the four requested per-portion metrics',()=>{
  const data=fixture(),before=JSON.stringify(data),result=F.calculate(data,'dish');
  assert.equal(result.status,'ready');assert.equal(result.sellingPrice,300);assert.equal(result.foodCostPerPortion,100);
  assert.equal(result.grossProfitPerPortion,200);assert.equal(result.markupPercent,200);
  near(result.grossMarginPercent,200/300*100);near(result.foodCostPercent,100/300*100);
  assert.deepEqual(result.issues,[]);assert.equal(JSON.stringify(data),before);
});
test('packaging is excluded even when its procurement cost exceeds food and it is free for the guest',()=>{
  const data=fixture(),result=F.calculate(data,'dish');
  assert.equal(result.foodCostPerPortion,100);assert.equal(result.grossProfitPerPortion,200);
  data.packaging[0].price=Number.MAX_VALUE;data.recipes[0].packaging[0].quantity=Number.MAX_VALUE;
  assert.deepEqual(F.calculate(data,'dish'),result);
});
test('selling price remains per portion when a saved recipe has several portions',()=>{
  for(const portions of [1,2,5,10,.5]){
    const result=F.calculate(fixture(100,300,portions),'dish');
    assert.equal(result.sellingPrice,300);assert.equal(result.foodCostPerPortion,100);assert.equal(result.grossProfitPerPortion,200);
    assert.equal(result.markupPercent,200);
  }
});
test('gross losses and negative percentages are valid, not storage or calculation errors',()=>{
  const result=F.calculate(fixture(60,50),'dish');
  assert.equal(result.status,'ready');assert.equal(result.grossProfitPerPortion,-10);
  near(result.markupPercent,-10/60*100);assert.equal(result.grossMarginPercent,-20);assert.equal(result.foodCostPercent,120);
});
test('zero selling price retains the loss and markup but has no margin or foodcost denominator',()=>{
  const result=F.calculate(fixture(100,0),'dish');
  assert.equal(result.status,'ready');assert.equal(result.grossProfitPerPortion,-100);assert.equal(result.markupPercent,-100);
  assert.equal(result.grossMarginPercent,null);assert.equal(result.foodCostPercent,null);assert.match(result.issues.join(' '),/нулевой цене продажи/);
});
test('zero food cost has no markup denominator; zero price and zero cost do not invent percentages',()=>{
  const free=F.calculate(fixture(0,300),'dish');
  assert.equal(free.status,'ready');assert.equal(free.grossProfitPerPortion,300);assert.equal(free.markupPercent,null);
  assert.equal(free.grossMarginPercent,100);assert.equal(free.foodCostPercent,0);
  const both=F.calculate(fixture(0,0),'dish');
  assert.equal(both.grossProfitPerPortion,0);for(const key of ['markupPercent','grossMarginPercent','foodCostPercent'])assert.equal(both[key],null);
  assert(both.issues.length>=2);
});
test('absent or explicitly empty selling price preserves known food cost but never assumes zero sales',()=>{
  for(const value of [undefined,null]){
    const data=fixture();if(value===undefined)delete data.recipes[0].sellingPrice;else data.recipes[0].sellingPrice=value;
    const result=F.calculate(data,'dish');assert.equal(result.status,'missing-price');assert.equal(result.sellingPrice,null);assert.equal(result.foodCostPerPortion,100);
    for(const key of ['grossProfitPerPortion','markupPercent','grossMarginPercent','foodCostPercent'])assert.equal(result[key],null);
  }
});
test('partial food costs never become apparently complete profit metrics',()=>{
  for(const change of [data=>data.products[0].price=null,data=>data.recipes[0].ingredients[0].quantity=null,data=>data.recipes[0].ingredients=[]]){
    const data=fixture();change(data);const result=F.calculate(data,'dish');
    assert.equal(result.status,'incomplete');assert.equal(result.sellingPrice,300);
    for(const key of ['foodCostPerPortion','grossProfitPerPortion','markupPercent','grossMarginPercent','foodCostPercent'])assert.equal(result[key],null);
  }
});
test('nested ready preparations follow purchase price, ingredient amounts and actual prep yield exactly once',()=>{
  const data=fixture();data.products[0]={...data.products[0],price:500,unit:'kg',massPerPiece:null};
  data.recipes.unshift({id:'prep',type:'prep',name:'Готовая заготовка',note:'',actualYield:600,ingredients:[{id:'prep-row',refId:'food',quantity:1000,unit:'g',lossPercent:40,outputGrams:600,note:''}]});
  const dish=data.recipes[1];dish.ingredients[0]={...dish.ingredients[0],refId:'prep',quantity:100,unit:'g'};
  let result=F.calculate(data,'dish');near(result.foodCostPerPortion,500/600*100);near(result.grossProfitPerPortion,300-500/600*100);
  data.products[0].price=600;assert.equal(F.calculate(data,'dish').foodCostPerPortion,100);
  data.recipes[0].actualYield=500;assert.equal(F.calculate(data,'dish').foodCostPerPortion,120);
  dish.ingredients[0].quantity=150;assert.equal(F.calculate(data,'dish').foodCostPerPortion,180);
  data.recipes[0].actualYield=null;assert.equal(F.calculate(data,'dish').status,'incomplete');
});
test('dish final output does not invent portions or change the existing per-portion food-cost rule',()=>{
  const data=fixture(100,300,5),before=C.calcRecipe(data,'dish');
  data.recipes[0].actualYield=1000;
  assert.equal(F.calculate(data,'dish').foodCostPerPortion,before.knownCost/5);
  assert.equal(F.calculate(data,'dish').grossProfitPerPortion,200);
  data.recipes[0].portions=10;assert.equal(F.calculate(data,'dish').foodCostPerPortion,50);
});
test('full precision is kept internally rather than compounding display rounding',()=>{
  const data=fixture(.1,.3,3);data.recipes[0].ingredients[0].quantity=1;
  const before=JSON.stringify(data),expected=C.calcRecipe(data,'dish').knownCost/3;
  for(let i=0;i<100;i++){
    const result=F.calculate(data,'dish');assert.equal(result.foodCostPerPortion,expected);near(result.grossProfitPerPortion,.3-expected);
    near(result.foodCostPercent,expected/.3*100);
  }
  assert.equal(JSON.stringify(data),before);
});
test('direct invalid prices and malformed recipe inputs report unavailable metrics without throwing',()=>{
  for(const value of [-1,NaN,Infinity,'300','',false,{}]){
    const data=fixture();data.recipes[0].sellingPrice=value;const result=F.calculate(data,'dish');
    assert.equal(result.status,'invalid-price');assert.equal(result.grossProfitPerPortion,null);onlyNumbersOrNull(result);
  }
  for(const portions of [0,-1,null,NaN,Infinity,'2']){
    const data=fixture();data.recipes[0].portions=portions;assert.equal(F.calculate(data,'dish').status,'invalid-recipe');
  }
  for(const state of [null,{}, {products:[],recipes:[]}, {products:[],recipes:[{id:'prep',type:'prep'}]}])assert.equal(F.calculate(state,'dish').status,'invalid-recipe');
});
test('unrepresentable per-portion cost is unavailable instead of Infinity or a silent zero',()=>{
  const large=fixture(Number.MAX_VALUE,300);large.recipes[0].portions=Number.MIN_VALUE;
  assert.equal(F.calculate(large,'dish').status,'overflow');onlyNumbersOrNull(F.calculate(large,'dish'));
  const tiny=fixture(Number.MIN_VALUE,300);tiny.recipes[0].portions=Number.MAX_VALUE;
  assert.equal(F.calculate(tiny,'dish').status,'overflow');assert.equal(F.calculate(tiny,'dish').foodCostPerPortion,null);
});
test('extreme percentage arithmetic retains representable tiny values and leaves overflow unavailable',()=>{
  const tiny=F.calculate(fixture(Number.MIN_VALUE,100),'dish');
  assert.equal(tiny.foodCostPercent,Number.MIN_VALUE);assert.equal(tiny.markupPercent,null);onlyNumbersOrNull(tiny);
  const large=F.calculate(fixture(Number.MAX_VALUE,Number.MAX_VALUE),'dish');
  assert.equal(large.grossProfitPerPortion,0);assert.equal(large.markupPercent,0);assert.equal(large.grossMarginPercent,0);assert.equal(large.foodCostPercent,100);
  const loss=F.calculate(fixture(Number.MAX_VALUE,Number.MIN_VALUE),'dish');
  assert.equal(loss.grossMarginPercent,null);assert.equal(loss.foodCostPercent,null);onlyNumbersOrNull(loss);
});
test('the required explanation is exported verbatim and is not a net-profit claim',()=>{
  assert.equal(F.NOTE,'Расчёт основан на продуктовой себестоимости. Зарплата, аренда, коммунальные расходы, налоги и другие затраты не учитываются. Указанная прибыль не является чистой прибылью заведения');
});
test('old JSON remains structurally identical and missing sale price is not inserted automatically',()=>{
  const old=Seed.create(),roundtrip=S.parseJSON(S.stringify(old));assert.deepEqual(roundtrip,old);
  assert(roundtrip.recipes.every(recipe=>!Object.hasOwn(recipe,'sellingPrice')));
  assert.equal(S.KEY,'kitchen-calculator-pr2-browser-test-v1');assert.equal(roundtrip.version,1);
});
test('selling price persists through browser-style save/load and portable JSON with photos and packaging',()=>{
  const data=fixture();data.recipes[0].photoIds=['photo-first','photo-second'];const entries=new Map([['kitchen-calculator-v1','protected']]);
  const storage={getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value)};
  assert.equal(S.save(data,storage).ok,true);assert.deepEqual(S.load(storage).data,data);assert.equal(entries.get('kitchen-calculator-v1'),'protected');
  assert.deepEqual(S.parseJSON(S.stringify(data)),data);
  for(const value of [0,null,123.45]){const next=copy(data);next.recipes[0].sellingPrice=value;assert.equal(S.parseJSON(S.stringify(next)).recipes[0].sellingPrice,value);}
});
test('invalid sale-price imports or saves never overwrite the prior database',()=>{
  const good=fixture(),entries=new Map(),storage={getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value)};
  assert.equal(S.save(good,storage).ok,true);const original=entries.get(S.KEY);
  for(const value of [-1,NaN,Infinity,'300','',false,{},[]]){
    const bad=copy(good);bad.recipes[0].sellingPrice=value;assert.throws(()=>S.validate(bad),/цена продажи/);
    assert.equal(S.save(bad,storage).ok,false);assert.equal(entries.get(S.KEY),original);
    // JSON cannot encode NaN/Infinity; the direct validation above covers them.
    if(Number.isFinite(value)||typeof value!=='number')assert.throws(()=>S.parseJSON(JSON.stringify(bad)),/цена продажи/);
  }
  const prep=copy(good);prep.recipes[0].type='prep';prep.recipes[0].actualYield=100;prep.recipes[0].packaging=[];
  assert.throws(()=>S.validate(prep),/только для блюда/);assert.equal(entries.get(S.KEY),original);
});
test('the existing draft format preserves optional selling price and raw invalid selling-price input independently',()=>{
  const data=fixture(),record={id:'dish',type:'dish',isNew:false,data:data.recipes[0],updatedAt:123,invalidValues:[['selling-price','-20']],errors:[['selling-price','Исправьте цену']],formValues:[{id:'selling-price',value:'-20'}],details:[]};
  const entries=new Map([[S.KEY,S.stringify(data)]]),storage={getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value)};
  const original=entries.get(S.KEY);assert.equal(Drafts.save(record,storage).ok,true);assert.deepEqual(Drafts.load(storage).items[0],record);assert.equal(entries.get(S.KEY),original);
});
