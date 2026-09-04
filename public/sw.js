// Cinephilers service worker.
//
// Its entire job: when a page navigation fails with a network error, show one
// static page instead of the browser's dinosaur. That is all. It exists because
// Apple's Guideline 4.2 rejects webview wrappers that show a white screen when
// the connection drops, and because Chrome will not offer to install an app that
// has no worker with a fetch handler.
//
// THREE RULES, and the reasons they are rules:
//
//  1. It caches NOTHING but the files in PRECACHE below — never HTML, never an
//     API response. Cinephilers is multi-user: a cached page could serve one
//     account's watchlist to the next person on a shared device. And Next.js
//     embeds build-specific chunk URLs in its HTML, so a page cached before a
//     deploy would ask for chunks that no longer exist — a white screen caused
//     by the very thing meant to prevent one.
//
//  2. It declines every request that is not a page navigation. No respondWith
//     means the browser handles it exactly as it does with no worker installed,
//     so a bug in here cannot reach scripts, images, API calls, auth, Sentry or
//     analytics.
//
//  3. It falls back ONLY when the network throws. A 500 from the server is not
//     the user being offline, and telling them it is would send them to check a
//     router that works fine.
//
// To remove this worker from browsers that already have it, see scripts/sw-kill.js.

// Bump this on any change to the file. The old cache is deleted on activate.
const VERSION = 'v1';
const CACHE = `cinephilers-${VERSION}`;

const OFFLINE_URL = '/offline.html';

// Static, build-independent, and public. Nothing here is user-specific.
const PRECACHE = [OFFLINE_URL, '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // cache: 'reload' bypasses the HTTP cache so a new worker version always
      // precaches the current files rather than whatever the browser kept.
      await cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop every cache this app made under a previous version.
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith('cinephilers-') && key !== CACHE).map((key) => caches.delete(key))
      );
      // Let the browser start the navigation request in parallel with waking
      // this worker up, so an installed worker costs nothing on a good network.
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Rule 2. Everything that is not a plain page navigation is left alone.
  if (request.method !== 'GET') return;
  if (request.mode !== 'navigate') return;

  event.respondWith(handleNavigation(event));
});

async function handleNavigation(event) {
  try {
    // navigationPreload's response, if the browser started one for us.
    const preloaded = await event.preloadResponse;
    if (preloaded) return preloaded;
    // Otherwise a normal network request, returned untouched. A 404 or a 500 is
    // a real answer from the server and is passed straight through (rule 3).
    return await fetch(event.request);
  } catch {
    // Only a thrown request — genuinely no network — reaches here.
    const cache = await caches.open(CACHE);
    const offline = await cache.match(OFFLINE_URL);
    if (offline) return offline;
    // Precache somehow missing: fail the way the browser would on its own.
    return Response.error();
  }
}
