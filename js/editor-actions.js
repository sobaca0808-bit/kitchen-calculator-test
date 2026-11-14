(function(root) {
  'use strict';
  const mounted=new WeakMap();

  function mount(editor) {
    if(mounted.has(editor))return mounted.get(editor);
    const workspace=editor.closest('.workspace'), viewport=root.visualViewport;
    let bar=null,frame=0,disposed=false,reveal=false;
    const setStyle=(node,key,value)=>{if(node.style.getPropertyValue(key)!==value)node.style.setProperty(key,value);};
    function schedule(shouldReveal=false) {
      if(disposed)return;
      reveal=reveal||shouldReveal;
      if(!frame)frame=requestAnimationFrame(update);
    }
    function release() {
      if(bar)resize?.unobserve(bar);
      bar=null;
      editor.classList.remove('actions-managed','actions-visible','actions-small-viewport');
      for(const key of ['height','left','width','bottom'])editor.style.removeProperty('--editor-actions-'+key);
      document.documentElement.style.removeProperty('--editor-actions-gap');
    }
    function focusAbovePanel(top,bottom) {
      const active=document.activeElement;
      if(!active || !editor.contains(active) || bar?.contains(active) || !active.matches('input,textarea,select,[contenteditable]'))return;
      const rect=active.getBoundingClientRect(),available=bottom-top;
      // Oversized textareas scroll internally; keep their start reachable rather
      // than bouncing between two edges which cannot both fit the viewport.
      const delta=rect.height>available ? rect.top-top
        :rect.bottom>bottom ? rect.bottom-bottom :rect.top<top ? rect.top-top :0;
      if(Math.abs(delta)>1)root.scrollBy({top:delta,behavior:'instant'});
    }
    function update() {
      frame=0;
      if(disposed)return;
      const next=editor.querySelector(':scope > .form-actions');
      if(next!==bar) {
        release();bar=next;
        if(bar) {
          editor.classList.add('actions-managed');
          bar.setAttribute('role','group');bar.setAttribute('aria-label','Действия редактора');
          resize?.observe(bar);
        }
      }
      if(!bar) {reveal=false;return;}
      const rect=editor.getBoundingClientRect(),border=getComputedStyle(editor);
      const top=viewport?.offsetTop||0,viewHeight=viewport?.height||root.innerHeight;
      const bottom=top+viewHeight;
      const layoutHeight=Math.max(root.innerHeight,document.documentElement.clientHeight);
      setStyle(editor,'--editor-actions-left',(rect.left+parseFloat(border.borderLeftWidth||0))+'px');
      setStyle(editor,'--editor-actions-width',Math.max(0,rect.width-parseFloat(border.borderLeftWidth||0)-parseFloat(border.borderRightWidth||0))+'px');
      setStyle(editor,'--editor-actions-bottom',Math.max(0,layoutHeight-bottom)+'px');
      const height=bar.getBoundingClientRect().height;
      const small=viewHeight-height<96;
      editor.classList.toggle('actions-small-viewport',small);
      setStyle(editor,'--editor-actions-height',(small?0:height)+'px');
      const visible=rect.top<bottom && rect.bottom>top && rect.width>0 && !workspace?.inert;
      editor.classList.toggle('actions-visible',visible&&!small);
      setStyle(document.documentElement,'--editor-actions-gap',(visible&&!small?height:0)+'px');
      bar.dataset.fixed=visible&&!small?'true':'false';
      if(reveal) {
        reveal=false;
        const panelTop=visible&&!small?bar.getBoundingClientRect().top:bottom;
        focusAbovePanel(top+12,panelTop-12);
      }
    }
    const resize=typeof ResizeObserver==='function'?new ResizeObserver(()=>schedule(true)):null;
    resize?.observe(editor);
    // Observing the existing workspace ancestor also catches import's inert
    // switch; backup folding can move the editor without changing its size.
    const mutations=new MutationObserver(()=>schedule());
    mutations.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','inert','open']});
    const scroll=()=>schedule(),resized=()=>schedule(true),focused=()=>schedule(true);
    root.addEventListener('scroll',scroll,{passive:true});root.addEventListener('resize',resized,{passive:true});
    viewport?.addEventListener('resize',resized,{passive:true});viewport?.addEventListener('scroll',scroll,{passive:true});
    editor.addEventListener('focusin',focused);document.addEventListener('toggle',scroll,true);
    const controller={
      refresh:()=>schedule(true),
      dispose() {
        disposed=true;if(frame)cancelAnimationFrame(frame);
        mutations.disconnect();resize?.disconnect();
        root.removeEventListener('scroll',scroll);root.removeEventListener('resize',resized);
        viewport?.removeEventListener('resize',resized);viewport?.removeEventListener('scroll',scroll);
        editor.removeEventListener('focusin',focused);document.removeEventListener('toggle',scroll,true);
        release();mounted.delete(editor);
      }
    };
    mounted.set(editor,controller);schedule();return controller;
  }
  root.KitchenEditorActions={mount};
})(typeof globalThis!=='undefined'?globalThis:this);
