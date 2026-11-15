'use strict';
function fixture(long=false){
 const product=(id,name,price,packQuantity=1,unit='kg',massPerPiece=null)=>({id,name,price,packQuantity,unit,massPerPiece,gramsPerMl:null,aliases:'',note:'Вымышленные данные для проверки оформления.'});
 const row=(id,refId,quantity,unit='g')=>({id,refId,quantity,unit,lossPercent:null,outputGrams:null,note:''});
 return {version:1,folders:[{id:'baking',name:'Выпечка'},{id:'menu',name:'Основное меню'}],products:[product('flour','Пшеничная мука',75),product('apple','Яблоки',140),product('butter','Сливочное масло',210,180,'g'),product('egg','Яйцо куриное',110,10,'pcs',55),product('sugar','Сахар',70),product('spice','Корица',160,20,'g')],packaging:[{id:'box',name:'Коробка для пирога',price:50,packQuantity:10,unit:'pcs',note:''}],recipes:[
 {id:'dough',type:'prep',name:'Песочное тесто',actualYield:900,note:'Охладить перед раскаткой.',technology:'1. Соединить компоненты.\n2. Охладить.',ingredients:[row('d-flour','flour',500),row('d-butter','butter',180),row('d-egg','egg',1,'pcs'),row('d-sugar','sugar',120)]},
 {id:'pie',type:'dish',name:'Яблочный пирог с корицей',folderId:'baking',portions:8,actualYield:1400,sellingPrice:190,note:'Вымышленный рецепт. Перед подачей остудить.',technology:'1. Подготовить яблоки.\n2. Раскатать тесто и выложить начинку.\n3. Выпечь и разделить на порции.',ingredients:[row('p-dough','dough',700),row('p-apple','apple',600),row('p-sugar','sugar',60),row('p-spice','spice',3),...(long?Array.from({length:40},(_,i)=>row('long-'+i,'apple',1)):[])],packaging:[{id:'p-box',refId:'box',quantity:1,unit:'pcs',freeForGuest:false,costMode:'additional'}]},
 {id:'tart',type:'dish',name:'Яблочная тарталетка',folderId:'menu',portions:1,actualYield:150,sellingPrice:230,note:'',technology:'Собрать и выпечь.',ingredients:[row('t-dough','dough',80),row('t-apple','apple',70)]}]};
}
module.exports=fixture;
