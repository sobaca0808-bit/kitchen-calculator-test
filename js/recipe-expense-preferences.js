(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./storage.js'):root.KitchenStorage);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.KitchenRecipeExpensePreferences=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(S){
  'use strict';
  const enabled=recipe=>recipe?.type==='dish'&&recipe.includeEstablishmentExpenses===true;
  function update(state,id,included){
    if(typeof included!=='boolean')throw Error('Выбор расходов должен быть включён или выключен.');
    const next=S.validate(state),recipe=next.recipes.find(r=>r.id===id&&r.type==='dish');
    if(!recipe)throw Error('Сохранённое блюдо не найдено.');
    recipe.includeEstablishmentExpenses=included;return next;
  }
  function restorePreference(draft,saved){
    if(!saved||draft?.type!=='dish'||saved.type!=='dish'||draft.id!==saved.id)return draft;
    const result={...draft};
    if(Object.hasOwn(saved,'includeEstablishmentExpenses'))result.includeEstablishmentExpenses=saved.includeEstablishmentExpenses;
    else delete result.includeEstablishmentExpenses;
    return result;
  }
  return {enabled,update,restorePreference};
});
