const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/packaging.js');
const S = require('../js/storage.js');
const C = require('../js/calculations.js');
const Seed = require('../js/seed.js');
const near = (actual,expected) => assert.ok(Math.abs(actual-expected) < 1e-10,`${actual} differs from ${expected}`);
const material = (id,name,price,packQuantity,unit) => ({id,name,price,packQuantity,unit,note:''});
const row = (id,refId,quantity,unit,extra={}) => ({id,refId,quantity,unit,freeForGuest:false,costMode:'auto',...extra});
function fixture() {
  return {version:1,products:[{id:'food-ketchup',name:'Кетчуп',aliases:'',price:200,packQuantity:1,unit:'kg',massPerPiece:null,gramsPerMl:null,note:''}],
    packaging:[material('foil','Фольга',500,100,'m'),material('box','Бокс',500,50,'pcs'),material('napkin','Салфетки',50,100,'pcs'),material('ketchup','Кетчуп',200,1,'kg')],
    recipes:[{id:'dish',type:'dish',name:'Проверочная порция',portions:1,actualYield:null,note:'',ingredients:[],packaging:[
      row('foil-row','foil',60,'cm'),row('box-row','box',1,'pcs'),row('napkin-row','napkin',2,'pcs'),row('ketchup-row','ketchup',30,'g',{freeForGuest:true})]}]};
}
test('foil 60cm=3, box=10, two napkins=1, guest-free ketchup=6; total20 per portion',()=>{
  const state=fixture(), before=JSON.stringify(state);
  const result=P.calculate(state,state.recipes[0]);
  assert.deepEqual(result.rows.map(item=>item.knownCost),[3,10,1,6]);
  assert.equal(result.knownCost,20);assert.equal(result.complete,true);
  assert.equal(result.rows[3].freeForGuest,true);
  assert.equal(JSON.stringify(state),before,'Calculator never mutates the saved catalog or recipe');
  const ten=P.calculate(state,state.recipes[0],10);
  assert.deepEqual(ten.rows.map(item=>item.quantity),[600,10,20,300]);
  assert.equal(ten.knownCost,200);assert.equal(ten.rows[0].perPortionQuantity,60);
});
test('unit conversion is dimensional: metres/centimetres, grams/kg, ml/l and pieces only',()=>{
  near(P.convert(60,'cm','m'),.6);assert.equal(P.convert(2,'m','cm'),200);
  assert.equal(P.convert(1,'kg','g'),1000);assert.equal(P.convert(1,'l','ml'),1000);
  assert.equal(P.convert(2,'pcs','pcs'),2);
  for(const [from,to] of [['m','g'],['pcs','cm'],['g','ml']]) assert.equal(P.convert(1,from,to),null);
  for(const quantity of [-1,NaN,Infinity,'1',null]) assert.equal(P.convert(quantity,'m','cm'),null);
  assert.equal(C.units.m,undefined,'Food unit dictionary remains unchanged');
});
test('base prices preserve zero, unknown values and finite arithmetic',()=>{
  assert.deepEqual(P.basePrice(material('foil','Фольга',500,100,'m')),{value:5,unit:'m'});
  assert.deepEqual(P.basePrice(material('x','Ноль',0,50,'pcs')),{value:0,unit:'pcs'});
  for(const patch of [{price:null},{packQuantity:null},{packQuantity:0},{price:-1},{unit:'unknown'}]) {
    assert.equal(P.basePrice({...material('x','X',500,100,'cm'),...patch}).value,null);
  }
  assert.equal(P.convert(Number.MAX_VALUE,'m','m'),Number.MAX_VALUE);
  assert.equal(P.convert(Number.MAX_VALUE,'m','cm'),null);
  assert.equal(P.convert(Number.MIN_VALUE,'cm','m'),null);
  assert.equal(P.basePrice(material('x','X',Number.MAX_VALUE,Number.MIN_VALUE,'pcs')).value,null);
});
test('default portions belong to the recipe and fresh recalculation never compounds rounding',()=>{
  const state=fixture(), recipe=state.recipes[0];recipe.portions=5;
  assert.equal(P.calculate(state,recipe).knownCost,100);
  const before=JSON.stringify(state);
  for(let i=0;i<100;i++){near(P.calculate(state,recipe,1/3).knownCost,20/3);assert.equal(P.calculate(state,recipe,20).knownCost,400);}
  assert.equal(P.calculate(state,recipe,1).knownCost,20);assert.equal(JSON.stringify(state),before);
});
test('a matching ingredient is not charged twice, even when names differ by case, spaces and ё',()=>{
  const state=fixture(), dish=state.recipes[0];
  dish.ingredients=[{id:'food-row',refId:'food-ketchup',quantity:30,unit:'g',lossPercent:null,outputGrams:null,note:''}];
  state.packaging[3].name='  КЕТЧУП  ';
  const food=C.calcRecipe(state,'dish');const packing=P.calculate(state,dish);
  assert.equal(food.knownCost,6);assert.equal(packing.knownCost,14);
  assert.equal(packing.rows[3].included,true);assert.equal(packing.rows[3].duplicate,true);
  assert.equal(food.knownCost+packing.knownCost,20);
  assert.match(packing.warnings.join(' '),/повторно не добавлена/);
  state.products[0].name='Зелёный соус';state.packaging[3].name='зеленый   соус';
  assert(P.calculate(state,dish).rows[3].duplicate);
});
test('duplicate detection follows prep ingredients and explicit additional/included modes are respected',()=>{
  const state=fixture(), dish=state.recipes[0];
  const prep={id:'prep',type:'prep',name:'Соусная заготовка',actualYield:100,note:'',ingredients:[{id:'prep-row',refId:'food-ketchup',quantity:100,unit:'g',lossPercent:null,outputGrams:null,note:''}]};
  state.recipes.push(prep);dish.ingredients=[{id:'dish-row',refId:'prep',quantity:20,unit:'g',lossPercent:null,outputGrams:null,note:''}];
  assert.equal(P.calculate(state,dish).rows[3].included,true);
  dish.packaging[3].costMode='additional';
  const extra=P.calculate(state,dish);assert.equal(extra.rows[3].knownCost,6);assert.equal(extra.rows[3].included,false);assert.equal(extra.knownCost,20);
  assert.match(extra.warnings.join(' '),/дополнительный расход/);
  dish.packaging[0].costMode='included';assert.equal(P.calculate(state,dish).rows[0].knownCost,0);
  // Traversal stays bounded even if an unvalidated caller passes a prep cycle.
  prep.ingredients.push({id:'cycle',refId:'prep',quantity:1,unit:'g'});
  assert(P.calculate(state,dish).warnings.length>0);
});
test('zero or unknown food quantity does not exempt an actual packaging serving',()=>{
  for(const quantity of [0,null,undefined]) {
    const state=fixture(), dish=state.recipes[0];
    dish.ingredients=[{id:'food-row',refId:'food-ketchup',quantity,unit:'g',lossPercent:null,outputGrams:null,note:''}];
    const result=P.calculate(state,dish);
    assert.equal(result.rows[3].duplicate,false,'An unconsumed ingredient is not already accounted for');
    assert.equal(result.rows[3].included,false);assert.equal(result.rows[3].knownCost,6);assert.equal(result.knownCost,20);
  }
});
test('zero or unknown nested prep consumption cannot hide packaging cost',()=>{
  for(const missingAt of ['parent','child'])for(const quantity of [0,null]) {
    const state=fixture(), dish=state.recipes[0];
    state.recipes.push({id:'prep',type:'prep',name:'Соусная заготовка',actualYield:100,note:'',ingredients:[
      {id:'prep-row',refId:'food-ketchup',quantity:missingAt==='child'?quantity:100,unit:'g',lossPercent:null,outputGrams:null,note:''}
    ]});
    dish.ingredients=[{id:'dish-row',refId:'prep',quantity:missingAt==='parent'?quantity:20,unit:'g',lossPercent:null,outputGrams:null,note:''}];
    const result=P.calculate(state,dish);
    assert.equal(result.rows[3].duplicate,false);assert.equal(result.rows[3].knownCost,6);assert.equal(result.knownCost,20);
  }
});
test('packaging and food yield are independent and guest-free flag does not change procurement cost',()=>{
  const state=fixture(), dish=state.recipes[0];
  dish.ingredients=[{id:'food-row',refId:'food-ketchup',quantity:30,unit:'g',lossPercent:null,outputGrams:null,note:''}];
  dish.packaging[3].costMode='additional';
  const before=C.calcRecipe(state,'dish');P.calculate(state,dish,100);
  assert.deepEqual(C.calcRecipe(state,'dish'),before);assert.equal(before.massGrams,30);
  dish.packaging[3].freeForGuest=false;assert.equal(P.calculate(state,dish).rows[3].knownCost,6);
  dish.packaging[3].freeForGuest=true;assert.equal(P.calculate(state,dish).rows[3].knownCost,6);
});
test('missing prices, quantities, references and mismatched units remain incomplete rather than zero-valued complete',()=>{
  for(const patch of [{quantity:null},{quantity:0},{quantity:-1},{quantity:Infinity},{quantity:'60'},{unit:'g'},{unit:'unknown'},{refId:null}]) {
    const state=fixture();Object.assign(state.recipes[0].packaging[0],patch);
    const result=P.calculate(state,state.recipes[0]);assert.equal(result.complete,false);assert(result.issues.length>0);
  }
  for(const patch of [{price:null},{packQuantity:null},{packQuantity:0}]) {
    const state=fixture();Object.assign(state.packaging[0],patch);const result=P.calculate(state,state.recipes[0]);assert.equal(result.complete,false);assert(result.issues.length>0);
  }
  for(const portions of [0,-1,Infinity,NaN,null])assert.equal(P.calculate(fixture(),fixture().recipes[0],portions).complete,false);
});
test('included duplicate needs no second price but still requires valid consumption and units',()=>{
  const state=fixture(), dish=state.recipes[0];
  dish.ingredients=[{id:'food-row',refId:'food-ketchup',quantity:30,unit:'g',lossPercent:null,outputGrams:null,note:''}];
  state.packaging[3].price=null;state.packaging[3].packQuantity=null;
  assert.equal(P.calculate(state,dish).complete,true);
  dish.packaging[3].quantity=null;assert.equal(P.calculate(state,dish).complete,false);
  dish.packaging[3].quantity=30;dish.packaging[3].unit='m';assert.equal(P.calculate(state,dish).complete,false);
});
test('overflow and underflow never produce a complete infinite or silently free result',()=>{
  const state=fixture(), dish=state.recipes[0];
  assert.equal(P.calculate(state,dish,Number.MAX_VALUE).complete,false);
  state.packaging[0].price=Number.MAX_VALUE;state.packaging[0].packQuantity=1;dish.packaging[0].quantity=Number.MAX_VALUE;
  const big=P.calculate(state,dish);assert.equal(big.complete,false);assert(Number.isFinite(big.knownCost));
  dish.packaging[0].quantity=Number.MIN_VALUE;dish.packaging[0].unit='cm';
  assert.equal(P.calculate(state,dish).complete,false);
});
test('old version1 backups stay byte-structure compatible and optional fields are not inserted',()=>{
  const original=Seed.create(), roundtrip=S.parseJSON(S.stringify(original));
  assert.deepEqual(roundtrip,original);assert.equal(Object.hasOwn(roundtrip,'packaging'),false);
  assert(roundtrip.recipes.every(recipe=>!Object.hasOwn(recipe,'packaging')));
  assert.equal(S.KEY,'kitchen-calculator-pr2-browser-test-v1');
  assert.equal(P.calculate(original,original.recipes[0]).knownCost,0);
});
test('new packaging catalog and per-portion rows survive JSON/save/load without touching old data',()=>{
  const state=fixture(), serialized=S.stringify(state), entries=new Map([['kitchen-calculator-v1','{"fictional":"protected"}']]);
  const writes=[];const storage={getItem:key=>entries.get(key)??null,setItem(key,value){writes.push(key);entries.set(key,value);}};
  assert.equal(S.save(state,storage).ok,true);assert.deepEqual(S.load(storage).data,state);
  assert.deepEqual(S.parseJSON(serialized),state);assert.deepEqual(writes,[S.KEY]);
  assert.equal(entries.get('kitchen-calculator-v1'),'{"fictional":"protected"}');
  const denied={getItem:storage.getItem,setItem(){throw Error('QuotaExceededError');}};
  assert.equal(S.save(state,denied).ok,false);assert.equal(entries.get(S.KEY),serialized);
});
test('packaging schema validates lengths, dimensions, references, uniqueness and flags independently of food units',()=>{
  const cases=[
    state=>{state.packaging=null;},state=>{state.packaging[0].id=state.products[0].id;},
    state=>{state.packaging[0].name='';},state=>{state.packaging[0].price=-1;},
    state=>{state.packaging[0].packQuantity=0;},state=>{state.packaging[0].unit='mm';},
    state=>{state.recipes[0].packaging=null;},state=>{state.recipes[0].packaging[0].refId='food-ketchup';},
    state=>{state.recipes[0].packaging[0].quantity=0;},state=>{state.recipes[0].packaging[0].quantity='60';},
    state=>{state.recipes[0].packaging[0].unit='pcs';},state=>{state.recipes[0].packaging[0].freeForGuest='yes';},
    state=>{state.recipes[0].packaging[0].costMode='hidden';},state=>{state.recipes[0].packaging[0].id='food-ketchup';},
    state=>{state.recipes[0].ingredients=[{id:'bad-food-row',refId:'foil',quantity:1,unit:'g',lossPercent:null,outputGrams:null,note:''}];}
  ];
  for(const change of cases){const state=fixture();change(state);assert.throws(()=>S.validate(state));}
  const state=fixture();state.recipes[0].packaging[0].refId=null;state.recipes[0].packaging[0].quantity=null;
  assert.equal(S.validate(state).recipes[0].packaging[0].refId,null,'Incomplete packing rows remain savable drafts');
});

test('nonempty packaging on a prep is rejected rather than importing hidden serving costs',()=>{
  const state=fixture();state.recipes[0].type='prep';state.recipes[0].actualYield=100;
  assert.throws(()=>S.validate(state),/при выдаче блюда/);
  state.recipes[0].packaging=[];
  assert.deepEqual(S.validate(state).recipes[0].packaging,[],'An explicit empty array remains compatible');
});
test('resolveLinks persists stable auto dedup identities without mutating the input',()=>{
  const state=fixture(), dish=state.recipes[0];
  dish.ingredients=[{id:'food-row',refId:'food-ketchup',quantity:30,unit:'g',lossPercent:null,outputGrams:null,note:''}];
  const before=JSON.stringify(state);
  assert.equal(P.calculate(state,dish).rows[3].matchedIngredientRefId,'food-ketchup');
  const resolved=P.resolveLinks(state);
  assert.equal(JSON.stringify(state),before);
  assert.equal(Object.hasOwn(dish.packaging[3],'ingredientRefId'),false);
  assert.equal(resolved.recipes[0].packaging[3].ingredientRefId,'food-ketchup');
  assert.equal(P.resolveLinks(resolved),resolved,'Already resolved state needs no further copy');
  const imported=S.parseJSON(S.stringify(resolved));
  assert.equal(imported.recipes[0].packaging[3].ingredientRefId,'food-ketchup');
  imported.products[0].name='Томатный соус';
  imported.packaging[3].name='Порционный соус к заказу';
  const packing=P.calculate(imported,imported.recipes[0]);
  assert.equal(packing.rows[3].duplicate,true);assert.equal(packing.rows[3].included,true);
  assert.equal(packing.rows[3].matchedIngredientRefId,'food-ketchup');
  assert.equal(packing.rows[3].knownCost,0);assert.equal(packing.knownCost,14);
});
test('stable identities follow nested positive food consumption but do not exempt removed or zeroed food',()=>{
  const state=fixture(), dish=state.recipes[0];
  state.recipes.push({id:'prep',type:'prep',name:'Соусная заготовка',actualYield:100,note:'',ingredients:[
    {id:'prep-row',refId:'food-ketchup',quantity:100,unit:'g',lossPercent:null,outputGrams:null,note:''}
  ]});
  dish.ingredients=[{id:'dish-row',refId:'prep',quantity:20,unit:'g',lossPercent:null,outputGrams:null,note:''}];
  const resolved=P.resolveLinks(state);resolved.packaging[3]={...resolved.packaging[3],name:'Порционный томатный соус'};
  assert.equal(resolved.recipes[0].packaging[3].ingredientRefId,'food-ketchup');
  assert.equal(P.calculate(resolved,resolved.recipes[0]).rows[3].knownCost,0);
  for(const quantity of [0,null]) {
    const changed=structuredClone(resolved);changed.recipes[0].ingredients[0].quantity=quantity;
    const result=P.calculate(changed,changed.recipes[0]);
    assert.equal(result.rows[3].included,false);assert.equal(result.rows[3].knownCost,6);
  }
  const removed=structuredClone(resolved);removed.recipes[0].ingredients=[];removed.recipes=removed.recipes.slice(0,1);removed.products=[];
  assert.equal(S.validate(removed).recipes[0].packaging[3].ingredientRefId,'food-ketchup','Stale metadata is not a hard food foreign key');
  assert.equal(P.calculate(removed,removed.recipes[0]).rows[3].knownCost,6);
});
test('inactive identity falls back to a current same-name ingredient; explicit modes do not gain auto links',()=>{
  const state=fixture(), dish=state.recipes[0];
  dish.ingredients=[{id:'food-row',refId:'food-ketchup',quantity:30,unit:'g',lossPercent:null,outputGrams:null,note:''}];
  dish.packaging[3].ingredientRefId='old-deleted-id';
  const resolved=P.resolveLinks(state);
  assert.equal(resolved.recipes[0].packaging[3].ingredientRefId,'food-ketchup');
  for(const mode of ['additional','included']) {
    const explicit=fixture();explicit.recipes[0].ingredients=structuredClone(dish.ingredients);explicit.recipes[0].packaging[3].costMode=mode;
    const clean=P.resolveLinks(explicit);
    assert.equal(Object.hasOwn(clean.recipes[0].packaging[3],'ingredientRefId'),false);
  }
  const original=Seed.create(), before=JSON.stringify(original);
  assert.equal(P.resolveLinks(original),original);assert.equal(JSON.stringify(original),before);
});
test('dedup identity metadata is optional text, never an unchecked object or numeric coercion',()=>{
  for(const value of [null,0,12,true,{},[], '', ' '.repeat(2), 'a'.repeat(201)]) {
    const state=fixture();state.recipes[0].packaging[3].ingredientRefId=value;
    assert.throws(()=>S.validate(state));
    assert.equal(P.calculate(state,state.recipes[0]).complete,false);
  }
  const state=fixture();state.recipes[0].packaging[3].ingredientRefId='deleted-or-unavailable-food';
  assert.equal(S.validate(state).recipes[0].packaging[3].ingredientRefId,'deleted-or-unavailable-food');
  assert.equal(P.calculate(state,state.recipes[0]).rows[3].knownCost,6);
});
