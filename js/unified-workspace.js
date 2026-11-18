/* One mounted calculator, expanded by role. Navigation never creates data copies. */
(function(){
  'use strict';
  const root=document.documentElement;if(!root.hasAttribute('data-sintez-unified'))return;
  const nav=globalThis.KitchenNavigation,P=KitchenWorkspacePolicy,$=s=>document.querySelector(s);
  let mode=P.initial(location.href),active='dashboard',visited=false,pwaError='';
  const titles={dashboard:'Главная',calculator:'Калькулятор',recipes:'Мои рецепты',products:'Продукты',prep:'Заготовки',cards:'Технологические карты',processing:'Выходы и потери',scaling:'Пересчёт порций',analysis:'Себестоимость',packaging:'Упаковка и фасовка',expenses:'Расходы заведения',financials:'Финансовые показатели',favorites:'Избранное'};
  const paths={dashboard:'M3 11 12 3l9 8M5 10v11h14V10M9 21v-8h6v8',calculator:'M5 2h14v20H5zM8 6h8M8 11h2m4 0h2M8 15h2m4 0h2M8 19h2m4 0h2',recipes:'M3 3c4-1 6 0 9 2 3-2 5-3 9-2v17c-4-1-6 0-9 2-3-2-5-3-9-2zM12 5v17',products:'M4 9c-1-5 6-6 8-3 4-4 9-1 8 4l-4 10H8zM12 5V2',prep:'m2 7 10-5 10 5-10 5zM2 12l10 5 10-5M2 17l10 5 10-5',favorites:'m12 2 3 6 7 1-5 5 1 8-6-4-6 4 1-8-5-5 7-1z',analysis:'M3 22V12h4v10m3 0V7h4v15m3 0V2h4v20',expenses:'M3 4h18v16H3zM3 8h18M7 13h4m-4 3h7',cards:'M5 2h14v20H5zM8 7h8M8 12h8m-8 5h5'};
  const icon=id=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="${paths[id]||paths.cards}"/></svg>`;
  const sidebar=$('#unified-sidebar'),menu=$('#unified-menu'),frame=$('#unified-layout'),content=$('#unified-content');
  // Move the actual nodes with their existing event handlers. No iframe/clone.
  for(const selector of ['#message','#import-panel','#import-backups','#damaged-source','#storage-help','#storage-diagnostics','#drafts-panel','.workspace'])content.append($(selector));
  const coreTabs=$('.tabs');menu.append(coreTabs);coreTabs.classList.add('unified-core-tabs');
  const originalButtons=new Map([...coreTabs.querySelectorAll('[data-tab]')].map(b=>[b.dataset.tab,b]));
  const coreIds={dish:'recipes',prep:'prep',products:'products',packaging:'packaging',expenses:'expenses'};
  for(const [section,button]of originalButtons){const id=coreIds[section],counter=button.querySelector('span');button.replaceChildren();button.insertAdjacentHTML('afterbegin',icon(id)+`<span class="unified-menu-label">${titles[id]}</span>`);if(counter)button.append(counter);button.dataset.unifiedTool=id;}
  for(const id of Object.keys(titles))if(!Object.values(coreIds).includes(id)){const button=document.createElement('button');button.type='button';button.dataset.unifiedTool=id;button.dataset.sintezRoute=id;button.innerHTML=icon(id)+`<span class="unified-menu-label">${titles[id]}</span>`;coreTabs.append(button);}
  const backup=$('#sintez-settings [data-sintez-action=export]').parentElement;
  backup.replaceChildren($('#export'),$('#import'),$('#import-file'));
  const appearance=$('#sintez-settings fieldset.sintez-setting');
  const legend=document.createElement('legend');legend.textContent='Оформление приложения';appearance.replaceChildren(legend,$('#appearance-control'));
  for(const [section,button]of originalButtons)button.dataset.sintezRoute=coreIds[section];
  $('#import').addEventListener('click',()=>paint(),true);
  function notice(text){$('#sintez-status').textContent=text;}
  function route(section=nav.current().section){const u=new URL(location.href);u.searchParams.set('mode',mode);u.searchParams.set('section',section);u.searchParams.set('tool',active);u.hash='';history.replaceState(history.state,'',u);}
  function paint(){
    root.dataset.sintezScreen='workspace';root.dataset.sintezWorkspaceMode=mode;root.dataset.unifiedTool=active;
    $('#sintez-home').hidden=false;$('#sintez-mode-panel').hidden=true;$('#sintez-settings').hidden=true;
    $('#sintez-home').querySelectorAll('[data-sintez-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.sintezMode===mode)));
    for(const id of P.menus[mode])coreTabs.append(coreTabs.querySelector('[data-unified-tool='+id+']'));
    for(const b of coreTabs.querySelectorAll('[data-unified-tool]')){b.hidden=!P.menus[mode].includes(b.dataset.unifiedTool);b.setAttribute('aria-current',b.dataset.unifiedTool===active?'page':'false');}
    sidebar.classList.remove('is-open');$('#unified-menu-toggle').setAttribute('aria-expanded','false');
    visited=true;route();
  }
  function show(id,{create=false,focus=true}={}){
    if(!P.menus[mode].includes(id))return false;
    const section={dashboard:'dish',calculator:'dish',recipes:'dish',products:'products',prep:'prep',cards:'dish',processing:'prep',scaling:'dish',analysis:'dish',packaging:'packaging',expenses:'expenses',financials:'dish',favorites:'dish'}[id];
    if(nav.current().dirty&&(create||id==='calculator'||section!==nav.current().section)&&!confirm('Есть несохранённые изменения. Продолжить переход?'))return false;
    if(!nav.open(section,create||id==='calculator'))return false;
    nav.favorites(id==='favorites');active=id;paint();notice('');
    if(focus){const target=id==='calculator'?$('#item-name'):['scaling'].includes(id)?$('#view-portions'):$('#section-title');target?.focus({preventScroll:true});}
    if(['scaling','analysis','financials'].includes(id))requestAnimationFrame(()=>{const el=id==='scaling'?$('#view-portions'):id==='financials'?$('.profitability-card'):$('.food-ingredients');if(el)el.scrollIntoView({block:'center'});else notice('Сначала откройте сохранённый рецепт в «Мои рецепты».');});
    return true;
  }
  function select(next){
    if(!P.valid(next))return;
    const current=nav.current();
    if(current.dirty&&!P.allowed(current.section,next)){notice('Сохраните открытую запись перед переключением режима. Введённые значения остаются на экране.');return;}
    if(next!==mode&&current.dirty&&!confirm('Есть несохранённые изменения. Переключить режим? Введённые поля останутся в редакторе. Сохраните запись кнопкой «Сохранить».'))return;
    if(!nav.park()||!nav.setMode(next))return;mode=next;
    if(!P.menus[mode].includes(active))active={dish:'recipes',prep:'prep',products:'products'}[nav.current().section]||'dashboard';
    paint();notice('');
  }
  function settings(){if(root.dataset.sintezScreen==='workspace'&&nav.current().dirty&&!confirm('Есть несохранённые изменения. Открыть настройки? Введённые поля останутся в редакторе.'))return;if(!nav.park())return;$('#sintez-settings').hidden=false;root.dataset.sintezScreen='settings';$('#sintez-settings-title').focus({preventScroll:true});for(const input of $('#sintez-settings').querySelectorAll('[name=sintez-theme]'))input.checked=input.value===KitchenAppearance.current();}
  function leaveSettings(){paint();}
  document.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.sintezMode){select(b.dataset.sintezMode);return;}
    if(b.dataset.unifiedTool){if(b.hasAttribute('data-tab')){if(nav.current().section!==b.dataset.tab)return;active=b.dataset.unifiedTool;nav.favorites(false);paint();}else show(b.dataset.unifiedTool);return;}
    if(b.dataset.sintezRoute==='settings'){settings();return;}
    if(b.hasAttribute('data-sintez-home')){leaveSettings();return;}
    if(b.hasAttribute('data-sintez-diagnostics')){paint();$('#storage-diagnostics-open').click();return;}
    if(['export','import'].includes(b.dataset.sintezAction)){paint();$('#'+b.dataset.sintezAction).click();return;}
    if(b.dataset.info){openInfo(b.dataset.info);return;}
    if(b.id==='unified-menu-toggle'){const open=sidebar.classList.toggle('is-open');b.setAttribute('aria-expanded',String(open));}
  });
  // Warn before leaving a recipe even when autosave can preserve its draft.
  document.addEventListener('click',e=>{
    if(!nav.current().dirty||!['dish','prep'].includes(nav.current().section))return;
    if(e.target.closest('#library-list [data-open],#create,#view-recipe,.unified-core-tabs [data-tab]')&&!confirm('Есть несохранённые изменения. Продолжить? Текущая рецептура будет сохранена отдельно как черновик.')){e.preventDefault();e.stopImmediatePropagation();}
  },true);
  $('#sintez-settings').querySelectorAll('[name=sintez-theme]').forEach(input=>input.addEventListener('change',()=>{if(input.checked){const r=KitchenAppearance.select(input.value);$('#sintez-theme-status').textContent=r.ok?'Оформление сохранено.':r.error;}}));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.defaultPrevented&&root.dataset.sintezScreen==='settings'&&!$('#sintez-presentation').open&&!$('#unified-info').open&&$('#appearance-panel')?.hidden!==false&&$('#pwa-panel')?.hidden!==false)leaveSettings();});
  function critical(){const message=$('#message'),error=!message.hidden&&message.classList.contains('error');$('#sintez-alert').hidden=!error&&!pwaError;$('#sintez-settings-error').hidden=!error&&!pwaError;$('#sintez-alert-text').textContent=error?message.textContent:pwaError;$('#sintez-alert-action').onclick=error?()=>{paint();$('#storage-diagnostics-open').click();}:()=>{settings();if($('#pwa-panel')?.hidden)$('#pwa-toggle').click();};}
  new MutationObserver(critical).observe($('#message'),{attributes:true,childList:true,subtree:true});critical();
  root.addEventListener('sintez-pwa-status',e=>{pwaError=e.detail.error||'';critical();});
  new MutationObserver(()=>{if(root.dataset.sintezScreen==='workspace'){route();for(const b of coreTabs.querySelectorAll('[data-unified-tool]'))b.setAttribute('aria-current',b.dataset.unifiedTool===active?'page':'false');}}).observe($('.workspace'),{attributes:true,attributeFilter:['data-section']});
  function updateBuild(){const b=globalThis.KitchenBuildInfo||{};$('#unified-build').textContent=(b.version?'Версия '+b.version+(b.source?' · '+b.source.slice(0,7):''):'Исходный код')+(b.builtAt?' · Сборка '+new Intl.DateTimeFormat('ru-RU',{dateStyle:'short'}).format(new Date(b.builtAt)):' · дата сборки не задана');}
  const info=$('#unified-info');let infoTrigger;
  function openInfo(kind){infoTrigger=document.activeElement;const h=$('#unified-info-title'),body=$('#unified-info-body');body.replaceChildren();
    h.textContent={about:'О программе',help:'Помощь',feedback:'Обратная связь'}[kind];
    const text=document.createElement('p');text.textContent=kind==='about'?'СИНТЕЗ МЕРЫ — кухонный калькулятор. Один справочник продуктов и рецептов для трёх режимов. Данные хранятся на вашем устройстве. '+$('#unified-build').textContent:kind==='help'?'Добавьте продукты с ценами, затем создайте заготовку или рецепт. Сохраните карточку. Для переноса между устройствами используйте JSON в настройках. Режимы расширяют инструменты и используют одну базу.':'Внешний сервис отправки пока не подключён. Опишите проблему и скопируйте текст обращения, чтобы передать его владельцу приложения. Данные базы автоматически не отправляются.';body.append(text);
    if(kind==='feedback'){const label=document.createElement('label');label.textContent='Ваше сообщение';const area=document.createElement('textarea');area.id='feedback-text';area.rows=5;area.maxLength=10000;label.append(area);body.append(label);const button=document.createElement('button');button.textContent='Скопировать обращение';button.onclick=async()=>{let timer;button.disabled=true;button.textContent='Копирование…';try{await Promise.race([navigator.clipboard.writeText(area.value+'\n'+$('#unified-build').textContent),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Clipboard unavailable')),1800);})]);button.textContent='Скопировано ✓';}catch(_){area.focus();area.select();button.textContent='Выделено — скопируйте текст';}finally{clearTimeout(timer);button.disabled=false;}};body.append(button);}
    else{const button=document.createElement('button');button.textContent='Резервная копия и настройки';button.onclick=()=>{info.close();settings();};body.append(button);}
    if(!info.open)info.showModal();}
  $('#unified-info-close').onclick=()=>info.close();info.addEventListener('close',()=>infoTrigger?.focus());
  nav.setMode(mode);const u=new URL(location.href),section=u.searchParams.get('section'),requested=u.searchParams.get('tool');
  if(P.menus[mode].includes(requested))show(requested,{focus:false});
  else if(section&&P.allowed(section,mode)){nav.open(section);active={dish:'recipes',products:'products',prep:'prep',packaging:'packaging',expenses:'expenses'}[section];paint();}
  else{active='dashboard';nav.open('dish');paint();}
  globalThis.KitchenUnifiedUI=Object.freeze({mode:()=>mode,open:show,settings,select});
  updateBuild();if(section==='settings')settings();
})();
