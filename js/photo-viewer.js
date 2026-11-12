(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KitchenPhotoViewer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  let active = null;
  const MAX_SCALE = 5;
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

  // The caller owns the local blob URL. Viewing never reads or changes recipes.
  function open({url, alt = 'Фотография готового блюда', trigger} = {}) {
    if (typeof url !== 'string' || !url.startsWith('blob:')) {
      throw Error('Для просмотра нужна локальная фотография из браузера.');
    }
    active?.close();
    const previousFocus = trigger || document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.id = 'photo-viewer';
    dialog.className = 'photo-viewer';
    dialog.setAttribute('aria-labelledby', 'photo-viewer-title');
    dialog.innerHTML = '<div class="photo-viewer-toolbar"><h2 id="photo-viewer-title">Фотография блюда</h2><button id="photo-viewer-close" type="button" aria-label="Закрыть фотографию">Закрыть</button></div>' +
      '<div class="photo-viewer-zoom" aria-label="Масштаб фотографии"><button id="photo-zoom-out" type="button" aria-label="Уменьшить фотографию">−</button><output id="photo-zoom-value" aria-live="polite">100%</output><button id="photo-zoom-in" type="button" aria-label="Увеличить фотографию">+</button><button id="photo-zoom-reset" type="button">Целиком</button></div>' +
      '<div class="photo-viewer-stage" tabindex="0" data-scale="1" aria-label="Фотография: увеличение кнопками или двумя пальцами, перемещение увеличенного снимка"><img class="photo-viewer-image" draggable="false"></div>' +
      '<p class="photo-viewer-error inline-error" role="status" hidden></p><p class="photo-viewer-help">Увеличьте кнопками, колесом мыши или двумя пальцами. Увеличенный снимок можно перемещать. Escape — закрыть.</p>';
    const stage = dialog.querySelector('.photo-viewer-stage');
    const image = dialog.querySelector('.photo-viewer-image');
    const zoomIn = dialog.querySelector('#photo-zoom-in');
    const zoomOut = dialog.querySelector('#photo-zoom-out');
    const zoomValue = dialog.querySelector('#photo-zoom-value');
    const pointers = new Map();
    let scale = 1, panX = 0, panY = 0, gesture = null, disposed = false;
    let observer;
    image.alt = String(alt);
    image.style.transformOrigin = 'center center';
    image.style.objectFit = 'contain';
    stage.style.touchAction = 'none';

    function position(event) {
      const bounds = stage.getBoundingClientRect();
      return {x: event.clientX - bounds.left - bounds.width / 2, y: event.clientY - bounds.top - bounds.height / 2};
    }
    function render() {
      if (disposed) return;
      const width = stage.clientWidth, height = stage.clientHeight;
      const ratio = image.naturalWidth && image.naturalHeight
        ? Math.min(width / image.naturalWidth, height / image.naturalHeight) : 0;
      const limitX = Math.max(0, (image.naturalWidth * ratio * scale - width) / 2);
      const limitY = Math.max(0, (image.naturalHeight * ratio * scale - height) / 2);
      panX = clamp(panX, -limitX, limitX);
      panY = clamp(panY, -limitY, limitY);
      image.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
      stage.dataset.scale = String(scale);
      stage.dataset.panX = String(panX);
      stage.dataset.panY = String(panY);
      stage.style.cursor = scale > 1 ? (pointers.size ? 'grabbing' : 'grab') : 'zoom-in';
      zoomIn.disabled = scale >= MAX_SCALE;
      zoomOut.disabled = scale <= 1;
      zoomValue.textContent = Math.round(scale * 100) + '%';
    }
    function zoom(nextScale, anchor = {x:0,y:0}) {
      const next = clamp(nextScale, 1, MAX_SCALE), factor = next / scale;
      panX = anchor.x - (anchor.x - panX) * factor;
      panY = anchor.y - (anchor.y - panY) * factor;
      scale = next;
      render();
    }
    function reset() {scale = 1;panX = panY = 0;render();}
    function beginGesture() {
      const points = [...pointers.values()];
      if (points.length >= 2) {
        const [a,b] = points;
        gesture = {kind:'pinch', distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)), scale, panX, panY,
          mid:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}};
      } else if (points.length === 1) gesture = {kind:'pan', point:points[0], panX, panY};
      else gesture = null;
    }
    function pointerDown(event) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      stage.focus({preventScroll:true});
      pointers.set(event.pointerId,position(event));
      try {stage.setPointerCapture(event.pointerId);} catch (_) { /* Synthetic events need no capture. */ }
      beginGesture();render();
    }
    function pointerMove(event) {
      if (!pointers.has(event.pointerId)) return;
      event.preventDefault();pointers.set(event.pointerId,position(event));
      const points = [...pointers.values()];
      if (points.length >= 2 && gesture?.kind === 'pinch') {
        const [a,b] = points, mid = {x:(a.x+b.x)/2,y:(a.y+b.y)/2};
        const next = clamp(gesture.scale * Math.hypot(a.x-b.x,a.y-b.y) / gesture.distance,1,MAX_SCALE);
        const factor = next / gesture.scale;
        panX = mid.x - (gesture.mid.x - gesture.panX) * factor;
        panY = mid.y - (gesture.mid.y - gesture.panY) * factor;
        scale = next;
      } else if (points.length === 1 && gesture?.kind === 'pan' && scale > 1) {
        panX = gesture.panX + points[0].x - gesture.point.x;
        panY = gesture.panY + points[0].y - gesture.point.y;
      }
      render();
    }
    function pointerUp(event) {
      pointers.delete(event.pointerId);
      try {if(stage.hasPointerCapture(event.pointerId))stage.releasePointerCapture(event.pointerId);} catch (_) { /* Capture may already be gone. */ }
      beginGesture();render();
    }
    function close() {
      if (disposed) return;
      disposed = true;pointers.clear();observer?.disconnect();
      image.onload = image.onerror = null;
      if (active === handle) active = null;
      if (dialog.open) dialog.close();
      dialog.remove();
      if (previousFocus?.isConnected && typeof previousFocus.focus === 'function') previousFocus.focus({preventScroll:true});
    }
    const handle = {close};
    active = handle;
    dialog.querySelector('#photo-viewer-close').addEventListener('click',close);
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    dialog.addEventListener('close',close);
    dialog.addEventListener('click',event=>{
      if(event.target!==dialog)return;
      const bounds=dialog.getBoundingClientRect();
      if(event.clientX<bounds.left || event.clientX>bounds.right || event.clientY<bounds.top || event.clientY>bounds.bottom)close();
    });
    zoomIn.addEventListener('click',()=>zoom(scale * 1.4));
    zoomOut.addEventListener('click',()=>zoom(scale / 1.4));
    dialog.querySelector('#photo-zoom-reset').addEventListener('click',reset);
    stage.addEventListener('wheel',event=>{event.preventDefault();zoom(scale * Math.exp(-event.deltaY * .002),position(event));},{passive:false});
    stage.addEventListener('dblclick',event=>{if(scale>1)reset();else zoom(2,position(event));});
    stage.addEventListener('pointerdown',pointerDown);
    stage.addEventListener('pointermove',pointerMove);
    stage.addEventListener('pointerup',pointerUp);
    stage.addEventListener('pointercancel',pointerUp);
    stage.addEventListener('lostpointercapture',event=>{if(pointers.has(event.pointerId))pointerUp(event);});
    stage.addEventListener('keydown',event=>{
      if (['+','='].includes(event.key)) {event.preventDefault();zoom(scale * 1.4);}
      else if (['-','_'].includes(event.key)) {event.preventDefault();zoom(scale / 1.4);}
      else if (event.key === '0') {event.preventDefault();reset();}
      else if (scale > 1 && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
        event.preventDefault();
        if(event.key==='ArrowLeft')panX+=40;if(event.key==='ArrowRight')panX-=40;
        if(event.key==='ArrowUp')panY+=40;if(event.key==='ArrowDown')panY-=40;
        render();
      }
    });
    image.onload = render;
    image.onerror = ()=>{
      if(disposed)return;
      const error=dialog.querySelector('.photo-viewer-error');error.hidden=false;error.textContent='Не удалось открыть фотографию. Закройте просмотр и попробуйте снова.';
    };
    image.src = url;
    document.body.append(dialog);
    try {dialog.showModal();} catch(error) {close();throw error;}
    if(typeof ResizeObserver==='function'){observer=new ResizeObserver(render);observer.observe(stage);}
    render();dialog.querySelector('#photo-viewer-close').focus({preventScroll:true});
    return handle;
  }
  return {open,MAX_SCALE};
});
