const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../js/recipe-view.js');
const S = require('../js/storage.js');
const Seed = require('../js/seed.js');
const row = (id,refId,quantity,unit='g',extra={}) => ({id,refId,quantity,unit,lossPercent:null,outputGrams:null,note:'',...extra});
function fixture() {
  return {version:1,products:[{id:'raw',name:'Сырьё',price:500,packQuantity:1,unit:'kg',massPerPiece:null,gramsPerMl:null,note:'',aliases:''}],recipes:[
    {id:'prep',type:'prep',name:'Готовое',actualYield:600,note:'',ingredients:[row('p','raw',1000,'g',{lossPercent:40,outputGrams:600})]},
    {id:'dish',type:'dish',name:'Блюдо',actualYield:null,note:'',ingredients:[row('d','prep',100)]}
  ]};
}
test('ten portions multiply ready prep cost and mass without changing source or reapplying loss',()=>{
  const state = fixture(), before = JSON.stringify(state);
  const view = V.scale(state,'dish',10);
  assert.equal(view.recipe.ingredients[0].quantity,1000);
  assert.ok(Math.abs(view.result.knownCost-500/600*1000)<1e-10);
  assert.equal(view.yieldGrams,1000);assert.equal(view.rawMass,1000);
  assert.equal(JSON.stringify(state),before);
});
test('base portions, explicit final yield, loss and decimals scale consistently',()=>{
  const state = fixture();const dish=state.recipes[1];
  dish.portions=2;dish.actualYield=500;dish.ingredients=[row('d','raw',.8,'kg',{lossPercent:37.5,outputGrams:500})];
  const view = V.scale(state,'dish',10);
  assert.equal(view.recipe.ingredients[0].quantity,4);
  assert.equal(view.recipe.ingredients[0].lossPercent,37.5);
  assert.equal(view.recipe.ingredients[0].outputGrams,2500);
  assert.equal(view.result.knownCost,2000);assert.equal(view.rawMass,4000);assert.equal(view.yieldGrams,2500);
});
test('piece and volume coefficients preserved; missing mass stays unknown',()=>{
  const state=fixture(), product=state.products[0];
  product.unit='pcs';product.packQuantity=10;product.massPerPiece=50;
  state.recipes[1].ingredients=[row('d','raw',2,'pcs')];
  assert.equal(V.scale(state,'dish',10).rawMass,1000);
  product.unit='l';product.packQuantity=1;product.gramsPerMl=.9;product.massPerPiece=null;
  state.recipes[1].ingredients=[row('d','raw',100,'ml')];
  assert.equal(V.scale(state,'dish',10).rawMass,900);
  product.gramsPerMl=null;assert.equal(V.scale(state,'dish',10).yieldGrams,null);
});
test('invalid portions and numeric overflow are rejected',()=>{
  for(const value of [0,-1,null,NaN,Infinity]) assert.throws(()=>V.scale(fixture(),'dish',value));
  assert.throws(()=>V.scale(fixture(),'dish',Number.MAX_VALUE));
});
test('old backups retain fields; new optional metadata survives import/export',()=>{
  const old=Seed.create();assert.deepEqual(S.parseJSON(S.stringify(old)),old);
  const state=fixture();state.recipes[1].portions=2;state.recipes[1].technology='Готовить <аккуратно>\nПодать';
  assert.deepEqual(S.parseJSON(S.stringify(state)).recipes[1],state.recipes[1]);
  for(const value of [0,-1,Infinity,'2']) {state.recipes[1].portions=value;assert.throws(()=>S.validate(state));}
});
