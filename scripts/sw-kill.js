// THE ESCAPE HATCH. This file is not served — it lives here so that the fix for a
// bad service worker is a copy and a deploy, not an improvisation under pressure.
//
// To use it:
//   1. Set NEXT_PUBLIC_SW_ENABLED to something other than "true" in Vercel.
//   2. Copy this file over the live one:
//        Windows:  copy scripts\sw-kill.js public\sw.js
//        POSIX:    cp scripts/sw-kill.js public/sw.js
//   3. Commit and deploy.
//
// Step 1 alone is not enough. It stops NEW registrations, and it makes every page
// that loads unregister the worker (see src/components/service-worker.tsx) — but
// only for people who load a page whose JavaScript still runs. Step 2 is the one
// that cannot fail: the browser re-checks /sw.js on navigation, and because that
// file is served no-cache it always gets the current one. It finds this, and this
// removes itself.
//
// There is deliberately NO fetch handler below. From the moment this activates,
// every request goes to the network exactly as it would with no worker at all.

self.addEventListener('install', () => {
  // Do not wait for the old worker's tabs to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Take every cache, not just ours — this is the cleanup of last resort.
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();
      // Reload open tabs so they come back under no worker at all.
      const windows = await self.clients.matchAll({ type: 'window' });
      for (const client of windows) {
        client.navigate(client.url);
      }
    })()
  );
});
