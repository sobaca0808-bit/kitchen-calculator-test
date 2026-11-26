/* Presentation only: move existing nodes, retaining their original handlers.
   No database, calculation, navigation or persistence API is used here. */
(function(){
  'use strict';
  if(!document.documentElement.hasAttribute('data-classic-glass'))return;
  function ingredients(card){
    for(const cell of card.querySelectorAll('.food-ingredients tbody tr[data-ingredient-id] > td:first-child')){
      if(cell.querySelector(':scope > .classic-ingredient-label'))continue;
      const badge=cell.querySelector(':scope > .prep-label');if(!badge)continue;
      const wrapper=document.createElement('span'),name=document.createElement('span');
      wrapper.className='classic-ingredient-label';name.className='classic-ingredient-title';
      // Default print layout is unchanged, even while screen CSS is disabled.
      wrapper.style.display='contents';name.style.display='contents';
      for(const node of [...cell.childNodes])if(node!==badge&&!node.classList?.contains('ingredient-note'))name.append(node);
      wrapper.append(name,badge,...[...cell.childNodes].filter(node=>node!==badge));cell.append(wrapper);
    }
  }
  const editor=document.getElementById('editor');
  const decorate=()=>{const card=editor.querySelector('#recipe-card');if(card)ingredients(card);};
  new MutationObserver(records=>{
    if(records.some(record=>record.target===editor||record.target.id==='recipe-card'))decorate();
  }).observe(editor,{childList:true,subtree:true});
  decorate();document.documentElement.dataset.classicLayout='ready';
})();
