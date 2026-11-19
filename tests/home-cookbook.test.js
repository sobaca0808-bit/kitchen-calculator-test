'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../js/calculations'),M=require('../js/recipe-card-model'),S=require('../js/storage'),P=require('../js/workspace-policy'),U=require('../js/unified-card'),fixture=require('./helpers/unified-fixture');
const context={KitchenCalc:C,KitchenUnifiedCard:U};vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../js/recipe-card-templates'),'utf8'),context);
const finance=/₽|[Цц]ен[аыу]|стоимост|нацен|марж|прибыл|фудкост|рентабельн|расход|[Ff]oodcost/;
for(const mode of ['chef','calculation'])test('Home renderer never includes finance, even with a '+mode+' model',()=>{
 const data=fixture(),before=S.stringify(data),model=M.create(data,'risotto',8,mode);
 const html=context.KitchenRecipeCardTemplates.render(data,model,{home:true,unified:true,showBusiness:false});
 assert.doesNotMatch(html,finance);assert.match(html,/РЕЦЕПТ/);assert.match(html,/Рис арборио/);assert.match(html,/80 г/);assert.match(html,/640 г/);assert.match(html,/3600 г/);assert.match(html,/30 мин/);assert.match(html,/card-photos/);
 assert.equal(model.mode,mode);assert.equal(S.stringify(data),before);
});
test('Home keeps quantities and instructions of preps without unfolding or charging them',()=>{
 const data=fixture(),model=M.create(data,'bowl',3,'chef'),before=S.stringify(data);
 const html=context.KitchenRecipeCardTemplates.render(data,model,{home:true,showBusiness:false});
 assert.match(html,/Грибная основа.*Полуфабрикат/s);assert.match(html,/100 г/);assert.match(html,/300 г/);assert.match(html,/Смешать и подать/);assert.match(html,/Тестовая запись/);assert.doesNotMatch(html,/Шампиньоны|₽|[Сс]тоимост/);assert.equal(S.stringify(data),before);
});
test('Missing prices cannot hide a usable Home recipe; viewing does not migrate legacy records',()=>{
 const data=fixture();for(const p of data.products)p.price=null;delete data.recipes[1].sellingPrice;delete data.recipes[1].cookingMinutes;data.recipes[1].photoId='old-photo';
 const before=S.stringify(data),html=context.KitchenRecipeCardTemplates.render(data,M.create(data,'risotto',4,'chef'),{home:true,unified:true,showBusiness:false});
 assert.match(html,/80 г/);assert.match(html,/Время не задано/);assert.doesNotMatch(html,finance);assert.equal(S.stringify(data),before);
});
test('Home backup comparison is a read-only projection, full JSON remains financially complete',()=>{
 const data=fixture();data.recipes[1].photoIds=['one','two'];data.recipes[1].futureField={keep:true};const before=S.stringify(data),view=P.backupPreview(data);
 for(const field of ['price','packQuantity','sellingPrice','packaging','includeEstablishmentExpenses','establishmentExpenses'])assert(!JSON.stringify(view).includes('"'+field+'"'));
 assert.deepEqual(view.recipes[1].photoIds,['one','two']);assert.deepEqual(view.recipes[1].futureField,{keep:true});assert.equal(S.stringify(data),before);
 const restored=S.validate(JSON.parse(before));assert.deepEqual(restored.establishmentExpenses,data.establishmentExpenses);assert.deepEqual(restored.packaging,data.packaging);assert.equal(restored.recipes[1].sellingPrice,420);assert.equal(restored.products[0].price,420);
 assert(P.backupExtra({kind:'packaging'}));assert(P.backupExtra({kind:'extension',id:'establishmentExpenses'}));assert(!P.backupExtra({kind:'products'}));assert(!P.backupExtra({kind:'recipes'}));
});
