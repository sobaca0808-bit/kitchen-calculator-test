'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/recipe-card-model.js');
const C = require('../js/calculations.js');
const Seed = require('../js/seed.js');
const row = (id,refId,quantity,unit='g',extra={}) => ({id,refId,quantity,unit,lossPercent:null,outputGrams:null,note:'',...extra});
const product = (id,name,price=500,extra={}) => ({id,name,price,packQuantity:1,unit:'kg',massPerPiece:null,gramsPerMl:null,aliases:'',note:'',...extra});
function fixture() {
  return {version:1,products:[product('raw','Сырое мясо'),product('sauce','Покупной кетчуп',200)],recipes:[
    {id:'prep',type:'prep',name:'Жареное мясо',actualYield:600,note:'',ingredients:[row('prep-raw','raw',1000,'g',{lossPercent:40,outputGrams:600})]},
    {id:'dish',type:'dish',name:'Блюдо',actualYield:null,note:'',ingredients:[row('dish-prep','prep',100),row('dish-sauce','sauce',20)]}
  ]};
}
const near = (value, expected) => assert(Math.abs(value-expected)<1e-10,`${value} differs from ${expected}`);

test('a cook takes 100g of ready prep; production yield affects cost only once',()=>{
  const state=fixture(),before=JSON.stringify(state),chef=M.create(state,'dish',10,'chef');
  assert.deepEqual(chef.rows[0].perPortion,{quantity:100,unit:'g'});
  assert.deepEqual(chef.rows[0].total,{quantity:1000,unit:'g'});
  assert.equal(chef.rows[0].isPrep,true);
  near(chef.view.result.rows[0].knownCost,500/600*1000);
  near(chef.view.result.knownCost,500/600*1000+40);
  assert.equal(JSON.stringify(state),before);
});
test('calculation retains raw quantity, output and all existing financial results',()=>{
  const state=fixture();state.recipes[1].ingredients=[row('direct','raw',160,'g',{lossPercent:37.5,outputGrams:100})];
  const before=C.calcRecipe(state,'dish'),card=M.create(state,'dish',1,'calculation');
  assert.deepEqual(card.view.result,before);
  assert.equal(card.view.recipe.ingredients[0].quantity,160);
  assert.equal(card.view.result.rows[0].massGrams,100);
  assert.equal(card.view.result.knownCost,80);
  assert.deepEqual(card.rows[0].perPortion,{quantity:100,unit:'g'});
});
test('ready quantities stay per serving when the saved recipe has several portions',()=>{
  const state=fixture(),dish=state.recipes[1];dish.portions=5;
  dish.actualYield=600;
  dish.ingredients[0].quantity=.5;dish.ingredients[0].unit='kg';dish.ingredients[1].quantity=100;
  const card=M.create(state,'dish',20,'chef');
  assert.deepEqual(card.rows.map(r=>r.perPortion.quantity),[100,20]);
  assert.deepEqual(card.rows.map(r=>r.total.quantity),[2000,400]);
  assert.equal(card.view.recipe.ingredients[0].quantity,2);
  assert.equal(card.perPortionView.yieldGrams,120);
  assert.equal(card.view.yieldGrams,2400);
});
test('classification follows the saved reference, not the ingredient name',()=>{
  const state=fixture();state.products[1].name='Полуфабрикат покупной кетчуп';state.recipes[0].name='Позиция без подсказки';
  const card=M.create(state,'dish',1,'chef');
  assert.equal(card.rows[0].isPrep,true);assert.equal(card.rows[1].isPrep,false);
  assert.equal(card.rows[1].name,'Полуфабрикат покупной кетчуп');
});
test('nested preparations remain a single assembly row',()=>{
  const state=fixture();state.recipes.push({id:'nested',type:'prep',name:'Готовая смесь',actualYield:100,note:'',ingredients:[row('nested-row','prep',100)]});
  state.recipes[1].ingredients=[row('assembly','nested',60)];
  const card=M.create(state,'dish',2,'chef');
  assert.equal(card.rows.length,1);assert.equal(card.rows[0].name,'Готовая смесь');
  assert.equal(card.rows[0].isPrep,true);assert.equal(card.rows[0].perPortion.quantity,60);
});
test('litres, kilograms and pieces use assembly base units without coefficient mixing',()=>{
  const state=fixture();state.products.push(product('oil','Масло',100,{unit:'l',gramsPerMl:.9}),product('bun','Булочка',30,{unit:'pcs',massPerPiece:75}));
  state.recipes[1].ingredients=[row('oil-row','oil',.02,'l'),row('bun-row','bun',2,'pcs'),row('raw-row','raw',.05,'kg')];
  const card=M.create(state,'dish',3,'chef');
  assert.deepEqual(card.rows.map(r=>r.perPortion),[{quantity:20,unit:'ml'},{quantity:2,unit:'pcs'},{quantity:50,unit:'g'}]);
  assert.deepEqual(card.rows.map(r=>r.total.unit),['ml','pcs','g']);
  card.rows.forEach((row,index)=>near(row.total.quantity,[60,6,150][index]));
});
test('processed ordinary product shows ready output, including a valid zero output',()=>{
  const state=fixture();state.recipes[1].ingredients=[row('fry','raw',160,'g',{lossPercent:37.5,outputGrams:100}),row('zero','sauce',20,'g',{lossPercent:100,outputGrams:0})];
  const card=M.create(state,'dish',10,'chef');
  assert.deepEqual(card.rows.map(r=>r.perPortion.quantity),[100,0]);
  assert.deepEqual(card.rows.map(r=>r.total.quantity),[1000,0]);
});
test('missing prices or prep yield do not hide a known ready portion or leak cost issues',()=>{
  const state=fixture();state.products[0].price=null;state.products[1].price=null;state.recipes[0].actualYield=null;
  const card=M.create(state,'dish',1,'chef');
  assert.equal(card.view.result.complete,false);assert.equal(card.rows[0].perPortion.quantity,100);
  assert.deepEqual(card.rows.flatMap(r=>r.issues),[]);
  assert(!Object.hasOwn(card.rows[0],'knownCost'));
});
test('unknown quantities stay unknown; a missing reference is never labelled as prep',()=>{
  const state=fixture();state.recipes[1].ingredients=[row('empty','prep',null),row('missing','unknown',20)];
  const card=M.create(state,'dish',1,'chef');
  assert.equal(card.rows[0].perPortion.quantity,null);assert(card.rows[0].issues.length);
  assert.equal(card.rows[1].isPrep,false);assert.equal(card.rows[1].name,'Ингредиент не выбран');
  assert.match(card.rows[1].issues.join(' '),/Выберите/);
});
test('repeated fresh scaling preserves decimal quantities without cumulative rounding',()=>{
  const state=fixture();state.recipes[1].portions=3;state.recipes[1].ingredients[0].quantity=100;
  const before=JSON.stringify(state);
  for(let i=0;i<100;i++) {
    near(M.create(state,'dish',10,'chef').rows[0].perPortion.quantity,100/3);
    near(M.create(state,'dish',1,'calculation').rows[0].total.quantity,100/3);
  }
  assert.equal(JSON.stringify(state),before);
});
test('old recipes without portions and optional metadata still use one serving',()=>{
  const state=Seed.create(),before=JSON.stringify(state),card=M.create(state,'dish-gyro',1,'chef');
  assert.equal(card.rows[0].perPortion.quantity,100);assert.equal(card.rows[0].isPrep,true);
  assert.equal(card.rows[3].isPrep,false);assert.equal(card.rows[3].perPortion.quantity,20);
  assert.equal(JSON.stringify(state),before);
});
test('invalid modes, portions and arithmetic overflow cannot create misleading quantities',()=>{
  for(const mode of ['technology','unknown',null])assert.throws(()=>M.create(fixture(),'dish',1,mode),/Неизвестная форма/);
  for(const portions of [0,-1,null,NaN,Infinity])assert.throws(()=>M.create(fixture(),'dish',portions,'chef'));
  const state=fixture();state.products[0].price=0;state.recipes[1].ingredients=[row('overflow','raw',Number.MAX_VALUE,'kg')];
  assert.throws(()=>M.create(state,'dish',1,'chef'),/слишком/i);
  const tiny=fixture();tiny.recipes[1].portions=10;tiny.recipes[1].ingredients=[row('underflow','sauce',Number.MIN_VALUE)];
  assert.throws(()=>M.create(tiny,'dish',10,'chef'),/слишком/i);
});
