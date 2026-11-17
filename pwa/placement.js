/* Existing PWA controls remain live in Settings; no data access or SW changes. */
(function () {
  'use strict';
  const root=document.documentElement,host=document.getElementById('sintez-pwa-settings'),control=document.getElementById('pwa-control'),notice=document.getElementById('pwa-update-notice'),status=document.getElementById('pwa-status');
  if(!root.dataset.pwaBuild||!host||!control||!notice||!status)return;
  host.append(control,notice);
  document.getElementById('pwa-panel').addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();document.getElementById('pwa-close').click();}});
  function reflect(){const text=status.textContent;const error=/^(Автономный режим недоступен|Автономная копия пока не готова|Новую автономную копию загрузить не удалось)/.test(text)?text:'';root.dispatchEvent(new CustomEvent('sintez-pwa-status',{detail:{error}}));}
  new MutationObserver(reflect).observe(status,{childList:true,subtree:true});reflect();
})();
