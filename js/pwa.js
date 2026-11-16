/* Installation and offline status only. Never reads or writes the recipe stores. */
(function () {
  'use strict';
  const build = document.documentElement.dataset.pwaBuild;
  if (!build || !('serviceWorker' in navigator) || !window.isSecureContext) return;
  const control = document.getElementById('pwa-control'), toggle = document.getElementById('pwa-toggle'), panel = document.getElementById('pwa-panel');
  const install = document.getElementById('pwa-install'), status = document.getElementById('pwa-status'), notice = document.getElementById('pwa-update-notice');
  const check = document.getElementById('pwa-check'), base = new URL('./', location.href);
  let registration, promptEvent, ready = false, error = '';
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  function render() {
    control.hidden = false;install.hidden = !promptEvent || standalone();
    toggle.textContent = navigator.onLine ? 'Приложение' : 'Без интернета';
    notice.hidden = !registration?.waiting;
    status.textContent = error || (registration?.waiting ? 'Обновление готово. Сохраните работу и закройте все окна этого приложения. Новая версия откроется при следующем запуске.' : ready ? (navigator.onLine ? 'Готово к запуску без интернета.' : 'Нет сети. Автономная копия готова; данные сохраняются на устройстве.') : 'Подготавливаем автономную копию…');
    if (standalone() && !error) status.textContent += ' Открыто в окне приложения.';
  }
  function close(focus = false) {panel.hidden = true;toggle.setAttribute('aria-expanded', 'false');if (focus) toggle.focus();}
  function open() {panel.hidden = false;toggle.setAttribute('aria-expanded', 'true');document.getElementById('pwa-close').focus();}
  toggle.addEventListener('click', () => panel.hidden ? open() : close());
  document.getElementById('pwa-close').addEventListener('click', () => close(true));
  document.getElementById('pwa-update-help').addEventListener('click', open);
  document.addEventListener('keydown', event => {if (event.key === 'Escape' && !panel.hidden) close(true);});
  document.addEventListener('pointerdown', event => {if (!panel.hidden && !control.contains(event.target) && !notice.contains(event.target)) close();});
  window.addEventListener('beforeinstallprompt', event => {event.preventDefault();promptEvent = event;render();});
  window.addEventListener('appinstalled', () => {promptEvent = null;render();});
  install.addEventListener('click', async () => {
    if (!promptEvent) return;const pending = promptEvent;promptEvent = null;render();
    try {await pending.prompt();await pending.userChoice;} catch (_) {error = 'Установку можно открыть через меню Chrome: «Установить приложение» или «Добавить на главный экран».';}render();
  });
  function workerStatus(worker) {
    return new Promise(resolve => {
      if (!worker) {resolve(null);return;}
      const channel = new MessageChannel(), timer = setTimeout(() => {channel.port1.close();resolve(null);}, 4000);
      channel.port1.onmessage = event => {clearTimeout(timer);channel.port1.close();resolve(event.data);};
      try {worker.postMessage({type: 'PWA_STATUS'}, [channel.port2]);} catch (_) {clearTimeout(timer);resolve(null);}
    });
  }
  async function refresh() {const state = await workerStatus(registration?.active);ready = state?.ready === true;render();}
  function watch(worker) {
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'redundant') error = ready ? 'Новую автономную копию загрузить не удалось. Прежняя версия и данные сохранены; попробуйте позже с интернетом.' : 'Автономная копия пока не готова. Попробуйте ещё раз с интернетом; сохранённые данные не удалены.';
      if (worker.state === 'activated' || worker.state === 'installed') refresh();else render();
    });
  }
  check.addEventListener('click', async () => {
    if (!registration || !navigator.onLine) {error = 'Для проверки обновлений нужно подключение к интернету.';render();return;}
    check.disabled = true;error = '';
    try {await registration.update();await refresh();} catch (_) {error = 'Обновления сейчас недоступны. Сохранённая автономная копия и данные остаются на устройстве.';}
    finally {check.disabled = false;render();}
  });
  window.addEventListener('online', () => {error = '';refresh();});window.addEventListener('offline', render);
  navigator.serviceWorker.addEventListener('controllerchange', refresh); // Deliberately never reload the page.
  (async () => {
    const existing = await navigator.serviceWorker.getRegistration(base.href);
    if (!navigator.onLine && existing?.scope === base.href) return existing;
    return navigator.serviceWorker.register(new URL('sw.js', base).href, {scope: base.href, updateViaCache: 'none'});
  })().then(async result => {
    registration = result;watch(result.installing);result.addEventListener('updatefound', () => watch(result.installing));
    await refresh();if (result.active && navigator.onLine) result.update().catch(() => {});
    navigator.serviceWorker.ready.then(refresh).catch(() => {});
  }).catch(() => {error = 'Автономный режим недоступен в этом браузере или профиле. Калькулятор работает как обычный сайт; для переноса данных используйте JSON.';render();});
  render();
})();
