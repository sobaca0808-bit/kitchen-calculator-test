'use strict';
// Synthetic browser records only. This module is not included in app packages.
module.exports=()=>{
 const product=(id,name,price,unit='kg')=>({id,name,price,packQuantity:1,unit,massPerPiece:null,gramsPerMl:unit==='l'?1:null,aliases:'',note:''});
 const row=(id,refId,quantity,unit='g')=>({id,refId,quantity,unit,lossPercent:null,outputGrams:null,note:''});
 return {version:1,products:[product('rice','Рис арборио',420),product('mushrooms','Шампиньоны',280),product('onion','Лук репчатый',80),product('cheese','Пармезан',2500),product('cream','Сливки 33%',460,'l'),product('salt','Соль',100)],folders:[{id:'italy',name:'Итальянская кухня'}],packaging:[{id:'box',name:'Контейнер',price:3.9,packQuantity:1,unit:'pcs',note:''}],establishmentExpenses:{method:'planned-portions',period:'2026-11',plannedPortions:1000,rent:40000,utilities:10000,payroll:24000,other:0},futureField:{keep:['unchanged']},recipes:[
 {id:'stock',type:'prep',name:'Грибная основа',actualYield:1000,technology:'Подготовить основу.',note:'',ingredients:[row('stock-m','mushrooms',500),row('stock-c','cream',200,'ml')]},
 {id:'risotto',type:'dish',name:'Ризотто с грибами',folderId:'italy',portions:4,cookingMinutes:30,actualYield:1800,sellingPrice:420,includeEstablishmentExpenses:true,technology:'',note:'',ingredients:[row('r-rice','rice',320),row('r-m','mushrooms',400),row('r-onion','onion',120),row('r-cheese','cheese',80),row('r-cream','cream',200,'ml')],packaging:[{id:'r-box',refId:'box',quantity:1,unit:'pcs',costMode:'additional',freeForGuest:false}]},
 {id:'bowl',type:'dish',name:'Рис с грибной основой',portions:1,actualYield:200,sellingPrice:300,technology:'Смешать и подать.',note:'Тестовая запись.',ingredients:[row('b-rice','rice',100),row('b-stock','stock',100)]}
 ]};
};
