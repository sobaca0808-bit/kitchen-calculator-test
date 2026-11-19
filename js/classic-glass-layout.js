/* Presentation only: move existing nodes, retaining their original handlers.
   No database, calculation, navigation or persistence API is used here. */
(function(){
  'use strict';
  if(!document.documentElement.hasAttribute('data-classic-glass'))return;
  let draftsOpen=false;
  function drafts(){
    const host=document.getElementById('drafts-panel');
    if(!host||host.querySelector(':scope > .classic-drafts-disclosure'))return;
    const count=host.querySelectorAll('.draft-entry').length;
    // Important read/storage errors stay visible; never fold them as drafts.
    if(!count||host.querySelector('.inline-error'))return;
    const details=document.createElement('details');details.className='classic-drafts-disclosure';details.open=draftsOpen;
    const summary=document.createElement('summary'),title=document.createElement('span'),badge=document.createElement('span');
    title.textContent='Незавершённые рецепты';badge.className='classic-disclosure-count';badge.textContent=String(count);
    summary.append(title,badge);const content=document.createElement('div');content.className='classic-drafts-content';
    content.append(...host.childNodes);details.append(summary,content);host.append(details);
    details.addEventListener('toggle',()=>{if(details.isConnected)draftsOpen=details.open;});
  }
  function ingredients(){
    for(const cell of document.querySelectorAll('.food-ingredients tbody tr[data-ingredient-id] > td:first-child')){
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
  function decorate(){drafts();ingredients();}
  const content=document.getElementById('unified-content');
  if(content)new MutationObserver(decorate).observe(content,{childList:true,subtree:true});
  decorate();document.documentElement.dataset.classicLayout='ready';
})();
