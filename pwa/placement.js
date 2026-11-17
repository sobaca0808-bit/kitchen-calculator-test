/* Move the existing install controls between existing headers; no data access. */
(function () {
  'use strict';
  const root = document.documentElement;
  const control = document.getElementById('pwa-control');
  const notice = document.getElementById('pwa-update-notice');
  if (!root.dataset.pwaBuild || !control || !notice) return;
  document.getElementById('pwa-panel').addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.stopPropagation(); document.getElementById('pwa-close').click(); }
  });
  function place() {
    const workspace = root.dataset.sintezScreen === 'workspace';
    document.querySelector(workspace ? '.backup-actions' : '#sintez-shell .sintez-header').append(control);
    if (workspace) document.getElementById('message').before(notice);
    else document.querySelector('#sintez-shell .sintez-header').after(notice);
  }
  place();
  new MutationObserver(place).observe(root, {attributes:true, attributeFilter:['data-sintez-screen']});
})();
