"use client"

import { useEffect } from 'react';

// Registers the service worker in public/sw.js — the thing that shows a real
// page instead of a white screen when a navigation fails offline.
//
// It is behind a flag on purpose. A service worker is the only thing on the web
// that survives a deploy and an ordinary cache clear, so it ships dark: verified
// on a preview deployment first, then switched on in production by setting one
// environment variable. NEXT_PUBLIC_ values are inlined at build time, so
// changing it requires a redeploy either way.
//
// KILL SWITCH ONE lives here: set NEXT_PUBLIC_SW_ENABLED to anything but "true"
// and redeploy, and every page load removes the worker and its caches. That
// covers browsers whose pages still run. KILL SWITCH TWO covers the ones whose
// pages do not — see scripts/sw-kill.js. Use both.
const ENABLED = process.env.NEXT_PUBLIC_SW_ENABLED === 'true';

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    if (!ENABLED) {
      void removeWorker();
      return;
    }

    // Registering during load competes with the page's own requests for
    // bandwidth, and this worker is needed on the NEXT visit, not this one.
    const register = () => {
      navigator.serviceWorker
        // updateViaCache: 'none' makes the browser revalidate sw.js itself on
        // every update check rather than trusting an HTTP-cached copy. Without
        // it a stale sw.js could outlive the fix for a stale sw.js.
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .catch(() => {
          // Best effort. A blocked or failed registration must never break the
          // page — everything still works with no worker at all.
        });
    };

    if (document.readyState === 'complete') {
      register();
      return;
    }
    window.addEventListener('load', register);
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}

async function removeWorker() {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith('cinephilers-')).map((key) => caches.delete(key)));
    }
  } catch {
    // Nothing to do if the browser refuses; the worker stays until sw.js changes.
  }
}
