(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.KitchenWorkspacePolicy=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const MODES=Object.freeze(['home','chef','business']);
  const menus=Object.freeze({home:Object.freeze(['dashboard','calculator','recipes','products','prep','favorites']),chef:Object.freeze(['dashboard','calculator','recipes','products','prep','cards','processing','scaling','favorites']),business:Object.freeze(['dashboard','calculator','recipes','products','prep','cards','processing','scaling','analysis','packaging','expenses','financials','favorites'])});
  const valid=mode=>MODES.includes(mode);
  const business=mode=>mode==='business';
  const professional=mode=>mode==='chef'||business(mode);
  const allowed=(section,mode)=>['dish','prep','products'].includes(section)||(business(mode)&&['packaging','expenses'].includes(section));
  const initial=url=>{const u=new URL(url);return valid(u.searchParams.get('mode'))?u.searchParams.get('mode'):['dish','prep','products','packaging','expenses'].includes(u.searchParams.get('section'))?'business':'home';};
  const favorite=recipe=>recipe?.favorite===true;
  const minutes=recipe=>typeof recipe?.cookingMinutes==='number'&&Number.isSafeInteger(recipe.cookingMinutes)&&recipe.cookingMinutes>=0?recipe.cookingMinutes:null;
  const timing=value=>{if(value===null)return null;if(!Number.isSafeInteger(value)||value<0||value>525600)throw Error('Время приготовления: целое число минут от 0 до 525600.');return value;};
  // Read-only backup comparison for Home. Full records still reach the existing
  // importer/exporter; this projection never becomes application state.
  const financialFields=new Set(['price','packQuantity','sellingPrice','packaging','includeEstablishmentExpenses','establishmentExpenses','financialJournal']);
  const backupExtra=entry=>entry?.kind==='packaging'||(entry?.kind==='extension'&&(entry.id==='establishmentExpenses'||entry.id?.startsWith('financialJournal')));
  function backupPreview(value){
    if(Array.isArray(value))return value.map(backupPreview);
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!financialFields.has(key)).map(([key,item])=>[key,backupPreview(item)]));
    return value;
  }
  return {MODES,menus,valid,business,professional,allowed,initial,favorite,minutes,timing,backupExtra,backupPreview};
});
