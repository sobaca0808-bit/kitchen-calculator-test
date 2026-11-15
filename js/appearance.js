(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KitchenAppearance = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const KEY = 'kitchen-calculator-appearance-test-v1';
  const THEMES = Object.freeze({
    berry: Object.freeze({name:'Ягодная кухня',color:'#fff9f4'}),
    graphite: Object.freeze({name:'Графит',color:'#17212b'}),
    sage: Object.freeze({name:'Шалфей',color:'#f5f8f0'})
  });
  const valid = value => typeof value === 'string' && Object.hasOwn(THEMES, value);
  function read(storage) {
    try {const value=storage.getItem(KEY);return {theme:valid(value)?value:'berry',error:null};}
    catch (_) {return {theme:'berry',error:'Браузер не разрешил прочитать оформление.'};}
  }
  function save(theme,storage) {
    if(!valid(theme))return {ok:false,error:'Неизвестное оформление.'};
    try {storage.setItem(KEY,theme);return {ok:true,error:null};}
    catch (_) {return {ok:false,error:'Не удалось запомнить оформление. Выбор действует в этом окне.'};}
  }
  let current='berry',initialError=null,control,panel,toggle,status;
  function apply(theme) {
    if(!valid(theme))return false;
    current=theme;
    if(theme==='berry')root.document.documentElement.removeAttribute('data-kitchen-theme');
    else root.document.documentElement.setAttribute('data-kitchen-theme',theme);
    const meta=root.document.querySelector('meta[name="theme-color"]');
    if(meta)meta.content=THEMES[theme].color;
    if(control){
      for(const input of control.querySelectorAll('input[name="kitchen-appearance"]'))input.checked=input.value===theme;
      toggle.setAttribute('aria-label','Оформление. Сейчас: '+THEMES[theme].name);
    }
    return true;
  }
  function select(theme) {
    if(!apply(theme))return {ok:false,error:'Неизвестное оформление.'};
    let result;
    try {result=save(theme,root.localStorage);}catch(_){result={ok:false,error:'Не удалось запомнить оформление. Выбор действует в этом окне.'};}
    if(status){status.textContent=result.ok?'Выбрано: '+THEMES[theme].name+'. Оформление сохранено.':result.error;status.classList.toggle('appearance-error',!result.ok);}
    return result;
  }
  function close(restoreFocus=false) {
    if(!panel||panel.hidden)return;
    panel.hidden=true;toggle.setAttribute('aria-expanded','false');
    if(restoreFocus)toggle.focus({preventScroll:true});
  }
  function mount() {
    control=root.document.getElementById('appearance-control');if(!control)return;
    panel=root.document.getElementById('appearance-panel');toggle=root.document.getElementById('appearance-toggle');status=root.document.getElementById('appearance-status');
    apply(current);
    if(initialError){status.textContent=initialError+' Можно выбрать тему для текущего окна.';status.classList.add('appearance-error');}
    toggle.addEventListener('click',()=>{
      if(!panel.hidden){close();return;}
      panel.hidden=false;toggle.setAttribute('aria-expanded','true');
      control.querySelector('input[name="kitchen-appearance"]:checked').focus({preventScroll:true});
    });
    for(const input of control.querySelectorAll('input[name="kitchen-appearance"]'))input.addEventListener('change',()=>{if(input.checked)select(input.value);});
    root.document.addEventListener('pointerdown',event=>{if(!control.contains(event.target))close();});
    root.document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){event.preventDefault();close(true);}});
    control.addEventListener('focusout',()=>{root.setTimeout(()=>{if(!control.contains(root.document.activeElement))close();},0);});
    root.addEventListener('storage',event=>{
      if(event.key!==KEY)return;
      const theme=valid(event.newValue)?event.newValue:'berry';apply(theme);
      if(status){status.textContent='Оформление обновлено: '+THEMES[theme].name;status.classList.remove('appearance-error');}
    });
  }
  if(root.document){
    let saved;
    try {saved=read(root.localStorage);}catch(_){saved={theme:'berry',error:'Браузер не разрешил прочитать оформление.'};}
    initialError=saved.error;apply(saved.theme);
    if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
  }
  return {KEY,THEMES,valid,read,save,current:()=>current,select};
});
