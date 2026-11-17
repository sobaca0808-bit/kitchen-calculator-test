/* Launcher only: recipe state and all calculations belong to the existing app. */
(function () {
  'use strict';
  const root=document.documentElement, navigation=globalThis.KitchenNavigation;
  const home=document.getElementById('sintez-home'), settings=document.getElementById('sintez-settings');
  if(!home || !navigation)return;
  const routes={recipes:'dish',products:'products',prep:'prep',calculator:'dish',expenses:'expenses',packaging:'packaging'};
  const status=document.getElementById('sintez-status');let visited=false;
  document.title='СИНТЕЗ МЕРЫ — кухонный калькулятор';
  function meta(){document.querySelector('meta[name="theme-color"]').content=root.dataset.sintezScreen==='workspace' ? KitchenAppearance.THEMES[KitchenAppearance.current()].color : '#0d141c';}
  function urlSection(value){const url=new URL(location.href);if(value)url.searchParams.set('section',value);else url.searchParams.delete('section');history.replaceState(history.state,'',url);}
  function work(focus=true){root.dataset.sintezScreen='workspace';visited=true;meta();if(focus){const el=document.querySelector('.workspace[data-section=expenses] #editor h2')||document.getElementById('section-title');if(el){el.tabIndex=-1;el.focus({preventScroll:true});}window.scrollTo({top:0,behavior:'instant'});}}
  function showHome(){
    if(root.dataset.sintezScreen==='workspace' && !navigation.park())return;
    root.dataset.sintezScreen='home';home.hidden=false;settings.hidden=true;status.textContent='';
    document.getElementById('sintez-resume').hidden=!visited;urlSection(null);meta();home.querySelector('h1').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});
  }
  function showSettings(){
    root.dataset.sintezScreen='settings';home.hidden=true;settings.hidden=false;urlSection('settings');meta();
    for(const input of settings.querySelectorAll('[name=sintez-theme]'))input.checked=input.value===KitchenAppearance.current();
    document.getElementById('sintez-settings-title').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});
  }
  function open(route){
    if(route==='settings'){showSettings();return;}
    const section=routes[route];if(!section)return;
    if(!navigation.open(section,route==='calculator')){showHome();status.textContent='Переход отменён. Открытая запись остаётся на месте — можно продолжить работу.';return;}
    status.textContent='';work(route!=='calculator');urlSection(section);
  }
  document.querySelectorAll('[data-sintez-route]').forEach(button=>button.addEventListener('click',()=>open(button.dataset.sintezRoute)));
  document.querySelectorAll('[data-sintez-home]').forEach(button=>button.addEventListener('click',showHome));
  document.getElementById('sintez-resume').addEventListener('click',()=>{work(false);urlSection(navigation.current().section);});
  settings.querySelectorAll('[name=sintez-theme]').forEach(input=>input.addEventListener('change',()=>{if(!input.checked)return;const result=KitchenAppearance.select(input.value);document.getElementById('sintez-theme-status').textContent=result.ok?'Тема рабочих разделов сохранена.':result.error;meta();}));
  settings.querySelectorAll('[data-sintez-action]').forEach(button=>button.addEventListener('click',()=>{work(false);urlSection(navigation.current().section);document.getElementById(button.dataset.sintezAction).click();}));
  document.addEventListener('keydown',event=>{if(event.key==='Escape' && root.dataset.sintezScreen==='settings'){event.preventDefault();showHome();}});
  new MutationObserver(()=>{if(root.dataset.sintezScreen==='workspace')urlSection(navigation.current().section);}).observe(document.querySelector('.workspace'),{attributes:true,attributeFilter:['data-section']});
  const initial=new URL(location.href).searchParams.get('section');
  if(initial==='settings')showSettings();
  else if(['dish','prep','products','packaging','expenses'].includes(initial)){navigation.open(initial);work(false);}
  else if(location.hash==='#storage-diagnostics')work(false);
  else {root.dataset.sintezScreen='home';meta();}
})();
