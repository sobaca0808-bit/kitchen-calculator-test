/* Generated BUILD is injected by scripts/build-pwa.py after the final packaging.
 * The unbuilt source deliberately cannot replace a working offline application.
 */
'use strict';
const BUILD = null; // PWA_BUILD
const BASE = new URL('./', self.location.href);
const PREFIX = 'kitchen-pwa:' + self.registration.scope + ':';
const META = new URL('__pwa_complete__', BASE).href;
const revisionPrefix = () => PREFIX + BUILD.revision + ':';
let selected;
const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
async function metadata(name) {
  const cache = await caches.open(name), response = await cache.match(META);
  if (!response) return null;
  try {const data = await response.json();return data.scope === self.registration.scope && typeof data.installedAt === 'number' ? data : null;} catch (_) {return null;}
}
async function currentCache() {
  if (selected) return caches.open(selected);
  const candidates = [];
  for (const name of await caches.keys()) if (name.startsWith(revisionPrefix())) {
    const data = await metadata(name);if (data?.revision === BUILD.revision) candidates.push({name, ...data});
  }
  candidates.sort((a, b) => b.installedAt - a.installedAt);
  if (!candidates.length) throw Error('No complete offline application');
  selected = candidates[0].name;return caches.open(selected);
}
function assetURL(path) {
  const url = new URL(path, BASE);
  if (url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname) || path.startsWith('/') || path.includes('..') || url.search || url.hash) throw Error('Unsafe offline asset');
  return url.href;
}
async function verifiedFetch(asset) {
  const requested = new URL(assetURL(asset.url));requested.searchParams.set('pwa-build', BUILD.revision);
  const response = await fetch(requested.href, {cache: 'no-store', credentials: 'same-origin'});
  if (!response.ok || response.type === 'opaque') throw Error('Offline asset is unavailable: ' + asset.url);
  const finalURL = new URL(response.url);
  if (finalURL.origin !== BASE.origin || !finalURL.pathname.startsWith(BASE.pathname)) throw Error('Unexpected offline asset redirect');
  if (await digest(await response.clone().arrayBuffer()) !== asset.sha256) throw Error('Offline asset belongs to another build: ' + asset.url);
  return response;
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    if (!BUILD || !/^[a-f0-9]{64}$/.test(BUILD.revision) || !BUILD.assets?.length) throw Error('PWA must be packaged before publication');
    const name = revisionPrefix() + Date.now() + '-' + crypto.randomUUID();
    try {
      const cache = await caches.open(name), queue = [...BUILD.assets];
      const results = await Promise.allSettled(Array.from({length: Math.min(4, queue.length)}, async () => {
        while (queue.length) {const asset = queue.shift();await cache.put(assetURL(asset.url), await verifiedFetch(asset));}
      }));
      const failed = results.find(result => result.status === 'rejected');if (failed) throw failed.reason;
      await cache.put(META, new Response(JSON.stringify({scope: self.registration.scope, revision: BUILD.revision, installedAt: Date.now()}), {headers: {'Content-Type': 'application/json'}}));
    } catch (error) {await caches.delete(name);throw error;}
    // No skipWaiting: open forms and all other tabs keep their existing version.
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const cache = await currentCache(), own = await (await cache.match(META)).json();
    for (const name of await caches.keys()) if (name.startsWith(PREFIX) && name !== selected) {
      const data = await metadata(name);
      // Keep newer waiting installations and incomplete concurrent installations.
      if (data && data.installedAt < own.installedAt) await caches.delete(name);
    }
    // No clients.claim or reload: an already open page is never replaced.
  })());
});
self.addEventListener('fetch', event => {
  if (!BUILD || event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== BASE.origin || !['https:', 'http:'].includes(url.protocol)) return;
  const navigation = event.request.mode === 'navigate' && (url.pathname === BASE.pathname || url.pathname === new URL('index.html', BASE).pathname);
  const asset = navigation ? BUILD.assets.find(item => item.url === 'index.html') : BUILD.assets.find(item => new URL(item.url, BASE).pathname === url.pathname);
  if (!asset) return; // Other calculators, user JSON, blobs and unknown routes use the network normally.
  event.respondWith((async () => {
    try {
      const cache = await currentCache(), key = assetURL(asset.url), cached = await cache.match(key);
      if (cached) return cached;
      const response = await verifiedFetch(asset);await cache.put(key, response.clone());return response;
    } catch (_) {
      return new Response(navigation ? '<!doctype html><html lang="ru"><meta name="viewport" content="width=device-width"><title>Кухонный калькулятор</title><h1>Автономная копия недоступна</h1><p>Подключитесь к интернету и откройте приложение снова. Сохранённые рецепты остаются в браузере.</p></html>' : 'Offline asset unavailable', {status: 503, headers: {'Content-Type': navigation ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8'}});
    }
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type !== 'PWA_STATUS' || !event.ports?.[0]) return;
  event.waitUntil((async () => {
    let ready = false;try {await currentCache();ready = true;} catch (_) {}
    event.ports[0].postMessage({type: 'PWA_STATUS', ready, revision: BUILD?.revision || null, scope: self.registration.scope});
  })());
});
