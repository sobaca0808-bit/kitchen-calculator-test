/* Navigation only: all modes share the existing calculator and its data. */
(function () {
  'use strict';
  if(document.documentElement.hasAttribute('data-sintez-unified'))return;
  const root=document.documentElement, navigation=globalThis.KitchenNavigation;
  const home=document.getElementById('sintez-home'), settings=document.getElementById('sintez-settings'), panel=document.getElementById('sintez-mode-panel');
  if(!home||!navigation||!panel)return;
  const tools={
    recipes:['Мои рецепты','Сохранённые блюда и их карточки','dish'],
    products:['Продукты','Ингредиенты, цены и единицы измерения','products'],
    prep:['Полуфабрикаты','Составы, выход и себестоимость заготовок','prep'],
    calculator:['Калькулятор','Новый расчёт себестоимости блюда','dish'],
    cards:['Техкарты','Просмотр и печать сохранённых рецептов','dish'],
    photos:['Фотографии блюд','Просмотр и загрузка фото в рецептах','dish'],
    expenses:['Расходы заведения','Аренда, зарплаты и расходы на порцию','expenses'],
    packaging:['Упаковка и фасовка','Справочник упаковки и её стоимости','packaging']
  };
  const modes={
    home:{name:'Для дома',description:'Продукты, рецепты и простые расчёты',primary:['products','recipes','calculator']},
    chef:{name:'Для повара',description:'Рецепты, техкарты и профессиональная работа',primary:['recipes','cards','prep','products','calculator','photos']},
    business:{name:'Для бизнеса',description:'Себестоимость, расходы и управление затратами',primary:['recipes','calculator','expenses','products','prep','packaging']}
  };
  const status=document.getElementById('sintez-status');let visited=false,currentMode=null,pwaError='';
  document.title='СИНТЕЗ МЕРЫ — кухонный калькулятор';
  function meta(){document.querySelector('meta[name="theme-color"]').content=KitchenAppearance.THEMES[KitchenAppearance.current()].color;}
  function route(section,mode=currentMode,clearHash=false){const u=new URL(location.href);if(section)u.searchParams.set('section',section);else u.searchParams.delete('section');if(mode)u.searchParams.set('mode',mode);else u.searchParams.delete('mode');if(clearHash)u.hash='';history.replaceState(history.state,'',u);}
  function resumeState(){document.querySelectorAll('[data-sintez-resume]').forEach(b=>b.hidden=!visited);document.querySelector('[data-sintez-mode-back]').hidden=!currentMode;document.getElementById('sintez-work-context').textContent=currentMode?modes[currentMode].name:'СИНТЕЗ МЕРЫ';}
  function surface(name,focus){root.dataset.sintezScreen=name;home.hidden=name!=='home';panel.hidden=name!=='mode';settings.hidden=name!=='settings';resumeState();meta();if(focus){focus.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}}
  function park(){return root.dataset.sintezScreen!=='workspace'||navigation.park();}
  function showHome(){if(!park())return;currentMode=null;status.textContent='';route('home',null,true);surface('home',home.querySelector('h1'));}
  function toolMarkup(id){const t=tools[id];return '<button type="button" class="sintez-tool" data-sintez-route="'+id+'"><span><strong>'+t[0]+'</strong><small>'+t[1]+'</small></span><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></button>';}
  function showMode(id,focus=true){
    if(!Object.hasOwn(modes,id)||!park())return;currentMode=id;const mode=modes[id];
    document.getElementById('sintez-mode-title').textContent=mode.name;document.getElementById('sintez-mode-description').textContent=mode.description;
    document.getElementById('sintez-mode-primary').innerHTML=mode.primary.map(toolMarkup).join('');
    document.getElementById('sintez-mode-extra').innerHTML=Object.keys(tools).filter(key=>!mode.primary.includes(key)).map(toolMarkup).join('');
    panel.querySelector('details').open=false;route('mode',id,true);surface('mode',focus?document.getElementById('sintez-mode-title'):null);
  }
  function work(focus=true){surface('workspace');visited=true;resumeState();if(focus){const el=document.querySelector('.workspace[data-section=expenses] #editor h2')||document.getElementById('section-title');if(el){el.tabIndex=-1;el.focus({preventScroll:true});}window.scrollTo({top:0,behavior:'instant'});}}
  function showSettings(openPwa=false){
    if(!park())return;route('settings',currentMode,true);surface('settings',document.getElementById('sintez-settings-title'));
    for(const input of settings.querySelectorAll('[name=sintez-theme]'))input.checked=input.value===KitchenAppearance.current();
    if(openPwa&&document.getElementById('pwa-panel')?.hidden)document.getElementById('pwa-toggle')?.click();
  }
  function open(id){
    if(id==='settings'){showSettings();return;}if(!Object.hasOwn(tools,id))return;const tool=tools[id];
    if(!navigation.open(tool[2],id==='calculator')){
      if(currentMode)showMode(currentMode);else surface('home');status.textContent='Переход отменён. Открытая запись остаётся на месте — можно продолжить работу.';return;
    }
    status.textContent='';work(id!=='calculator');if(id==='calculator')document.getElementById('item-name')?.focus();route(tool[2]);
    const hint=document.getElementById('sintez-work-hint');hint.hidden=!['cards','photos'].includes(id);hint.textContent=id==='cards'?'Выберите сохранённый рецепт для просмотра и печати техкарты.':'Откройте рецепт, чтобы просмотреть фотографии или добавить их при редактировании.';
  }
  function diagnostics(){work(false);route(navigation.current().section);document.getElementById('storage-diagnostics-open').click();}
  function critical(){
    const message=document.getElementById('message');const storageError=!message.hidden&&message.classList.contains('error');
    const alert=document.getElementById('sintez-alert');alert.hidden=!storageError&&!pwaError;
    document.getElementById('sintez-settings-error').hidden=alert.hidden;
    document.getElementById('sintez-alert-text').textContent=storageError?'Возникла проблема с сохранением данных. Откройте сообщение и диагностику.':pwaError;
    document.getElementById('sintez-alert-action').onclick=storageError?diagnostics:()=>showSettings(true);
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||!button.closest('#sintez-shell,#sintez-workbar'))return;
    if(button.hasAttribute('data-sintez-mode'))showMode(button.dataset.sintezMode);
    else if(button.hasAttribute('data-sintez-home'))showHome();
    else if(button.hasAttribute('data-sintez-mode-back'))showMode(currentMode);
    else if(button.hasAttribute('data-sintez-route'))open(button.dataset.sintezRoute);
    else if(button.hasAttribute('data-sintez-resume')){work(false);route(navigation.current().section);}
    else if(button.hasAttribute('data-sintez-diagnostics'))diagnostics();
    else if(['export','import'].includes(button.dataset.sintezAction)){work(false);route(navigation.current().section);document.getElementById(button.dataset.sintezAction).click();}
  });
  settings.querySelectorAll('[name=sintez-theme]').forEach(input=>input.addEventListener('change',()=>{if(!input.checked)return;const result=KitchenAppearance.select(input.value);document.getElementById('sintez-theme-status').textContent=result.ok?'Тема приложения сохранена.':result.error;meta();}));
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&root.dataset.sintezScreen==='settings'&&!document.querySelector('#sintez-presentation[open]')&&document.getElementById('pwa-panel')?.hidden!==false){event.preventDefault();currentMode?showMode(currentMode):showHome();}});
  root.addEventListener('sintez-pwa-status',event=>{pwaError=event.detail.error||'';critical();});
  new MutationObserver(critical).observe(document.getElementById('message'),{attributes:true,childList:true,subtree:true});critical();
  new MutationObserver(()=>{if(root.dataset.sintezScreen==='workspace')route(navigation.current().section);}).observe(document.querySelector('.workspace'),{attributes:true,attributeFilter:['data-section']});
  const initialURL=new URL(location.href),initial=initialURL.searchParams.get('section');currentMode=Object.hasOwn(modes,initialURL.searchParams.get('mode'))?initialURL.searchParams.get('mode'):null;
  if(initial==='settings')showSettings();
  else if(['dish','prep','products','packaging','expenses'].includes(initial)){navigation.open(initial);work(false);}
  else if(location.hash==='#storage-diagnostics')work(false);
  else if(initial==='mode'&&currentMode)showMode(currentMode,false);
  else {
    currentMode=null;surface('home');
    // Normal entry selects a mode; approved presentation/recovery URLs stay independent.
    if(!initialURL.pathname.endsWith('/presentation.html')&&!initialURL.searchParams.has('presentation')&&!initialURL.hash&&!['import','restore','recovery'].some(k=>initialURL.searchParams.has(k)))route('home',null);
  }
})();
