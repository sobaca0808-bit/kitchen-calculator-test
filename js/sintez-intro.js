/* Presentation only. The existing calculator owns all data and calculations. */
(function () {
  'use strict';
  const KEY = 'kitchen-calculator-sintez-presentation-seen-v1';
  const HISTORY = 'sintezPresentationV1';
  const dialog = document.getElementById('sintez-presentation');
  const replay = document.getElementById('sintez-presentation-replay');
  if (!dialog || !replay || !globalThis.KitchenNavigation) return;
  const slides = [...dialog.querySelectorAll('[data-intro-slide]')];
  const dots = [...dialog.querySelectorAll('[data-intro-dot]')];
  const next = dialog.querySelector('[data-intro-next]');
  const previous = dialog.querySelector('[data-intro-previous]');
  const play = dialog.querySelector('[data-intro-play]');
  const fullscreen = dialog.querySelector('[data-intro-fullscreen]');
  const fullscreenTarget = dialog.querySelector('.sx-intro-shell');
  const status = document.getElementById('sintez-presentation-status');
  let current = 0, timer = null, returnFocus = null, scroll = 0, mode = 'first';
  let gesture = null;

  function pause() {
    clearInterval(timer); timer = null;
    play.textContent = '▶ Авто'; play.setAttribute('aria-pressed', 'false');
  }
  function show(index) {
    current = Math.max(0, Math.min(slides.length - 1, index));
    const moveFocus = dialog.open && current === 0 && document.activeElement === previous;
    slides.forEach((slide, i) => {
      slide.classList.toggle('is-active', i === current);
      slide.setAttribute('aria-hidden', String(i !== current));
    });
    dots.forEach((dot, i) => dot.setAttribute('aria-current', i === current ? 'step' : 'false'));
    previous.disabled = current === 0;
    if (moveFocus) next.focus({preventScroll: true});
    next.textContent = current === slides.length - 1 ? 'Начать работу →' : 'Далее →';
    dialog.querySelector('[data-intro-count]').textContent = (current + 1) + ' / ' + slides.length;
    dialog.querySelector('[data-intro-announcement]').textContent = 'Слайд ' + (current + 1) + ' из ' + slides.length + ': ' + slides[current].dataset.introSlide;
    if (current === slides.length - 1) pause();
  }
  function open(pushHistory = true, nextMode = 'replay') {
    if (dialog.open) return;
    mode = nextMode; returnFocus = document.activeElement; scroll = window.scrollY;
    show(0);
    dialog.showModal();
    document.documentElement.classList.add('sintez-presentation-open');
    if (pushHistory) {
      try { history.pushState({...history.state, [HISTORY]: mode}, '', location.href); }
      catch (_) { /* The dialog remains usable when history is unavailable. */ }
    }
    dialog.querySelector('[data-intro-skip]').focus({preventScroll: true});
  }
  function close(remember = false, back = true) {
    if (!dialog.open) return;
    pause();
    if (document.fullscreenElement === fullscreenTarget) document.exitFullscreen().catch(() => {});
    dialog.close();
    document.documentElement.classList.remove('sintez-presentation-open');
    if (returnFocus?.isConnected) returnFocus.focus({preventScroll: true});
    window.scrollTo({top: scroll, behavior: 'instant'});
    if (remember) {
      try {
        localStorage.setItem(KEY, 'seen');
        if (localStorage.getItem(KEY) !== 'seen') throw new Error('Unconfirmed write');
        status.textContent = '';
      } catch (_) {
        status.textContent = 'Не удалось запомнить просмотр презентации. Работа доступна; при следующем входе презентация может появиться снова. База не изменена.';
        document.getElementById('sintez-status').textContent = status.textContent;
      }
    }
    if (back && history.state?.[HISTORY]) history.back();
  }
  function move(delta) { pause(); show(current + delta); }
  previous.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => current === slides.length - 1 ? close(true) : move(1));
  dialog.querySelector('[data-intro-skip]').addEventListener('click', () => close(true));
  replay.addEventListener('click', () => open());
  dots.forEach((dot, i) => dot.addEventListener('click', () => { pause(); show(i); }));
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.stopPropagation(); return; }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation(); pause();
    show(event.key === 'Home' ? 0 : event.key === 'End' ? slides.length - 1 : current + (event.key === 'ArrowRight' ? 1 : -1));
  });
  const stage = dialog.querySelector('.sx-intro-stage');
  stage.addEventListener('touchstart', event => {
    gesture = event.touches.length === 1 ? {x: event.touches[0].clientX, y: event.touches[0].clientY} : null;
  }, {passive: true});
  stage.addEventListener('touchend', event => {
    if (!gesture || event.touches.length || !event.changedTouches.length) { gesture = null; return; }
    const dx = event.changedTouches[0].clientX - gesture.x, dy = event.changedTouches[0].clientY - gesture.y;
    if (Math.abs(dx) >= 45 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1);
    gesture = null;
  }, {passive: true});
  stage.addEventListener('touchcancel', () => { gesture = null; }, {passive: true});
  play.addEventListener('click', () => {
    if (timer) { pause(); return; }
    if (current === slides.length - 1) show(0);
    play.textContent = 'Ⅱ Пауза'; play.setAttribute('aria-pressed', 'true');
    timer = setInterval(() => show(current + 1), 6000);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  fullscreen.hidden = !document.fullscreenEnabled || !fullscreenTarget.requestFullscreen;
  fullscreen.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement === fullscreenTarget) await document.exitFullscreen();
      else await fullscreenTarget.requestFullscreen();
    } catch (_) { dialog.querySelector('[data-intro-announcement]').textContent = 'Полноэкранный режим недоступен. Презентация работает в обычном окне.'; }
  });
  document.addEventListener('fullscreenchange', () => {
    fullscreen.textContent = document.fullscreenElement === fullscreenTarget ? '⛶ Обычный экран' : '⛶ На весь экран';
    fullscreen.setAttribute('aria-pressed', String(document.fullscreenElement === fullscreenTarget));
  });
  window.addEventListener('popstate', event => {
    if (['first', 'replay'].includes(event.state?.[HISTORY])) open(false, event.state[HISTORY]);
    else close(false, false);
  });

  // Read only this app's existing keys. Any record (even damaged/empty) or read
  // error means this is NOT a first run. Never initialize, migrate or clear data.
  const url = new URL(location.href);
  const direct = url.searchParams.has('section') || url.hash || ['import', 'restore', 'recovery'].some(key => url.searchParams.has(key));
  if (!direct) {
    try {
      const existing = [KitchenStorage.KEY, KitchenDrafts.KEY, KitchenAppearance.KEY].some(key => localStorage.getItem(key) !== null);
      if (!existing && localStorage.getItem(KEY) === null) open(!history.state?.[HISTORY], 'first');
    } catch (_) { /* Unreadable storage must never be treated as a new user. */ }
  }
})();
