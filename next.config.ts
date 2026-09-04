import type { NextConfig } from 'next';

const securityHeaders = [
  // Prevent clickjacking — page can only be framed by same origin
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Prevent MIME-type sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Legacy XSS filter for older browsers
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  // Control referrer information sent with requests
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Disable access to sensitive browser features
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  // Force HTTPS for 2 years (only applies once the site is served over HTTPS)
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Prevent DNS prefetch leaking visited URLs
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  // Note: Content-Security-Policy is set per-request in middleware.ts so it can
  // carry a unique nonce for scripts (instead of 'unsafe-inline'/'unsafe-eval').
];


// The Capacitor iOS webview serves the bundled app from its own scheme, so every
// request it makes to this API is cross-origin and needs CORS. `capacitor` is
// Capacitor's default iosScheme and `localhost` its default hostname, which makes
// this the app's origin as long as capacitor.config.ts leaves both alone.
//
// This exact string is the point: no browser can ever hold a `capacitor://` origin,
// so allowing it grants nothing to any website. Android's default scheme is
// `https`, so shipping to Play later means allowing `https://localhost` too —
// which a local dev server CAN hold, and is worth thinking about then rather than
// pre-allowing now. Play is deferred.
const NATIVE_ORIGIN = 'capacitor://localhost';

const corsHeaders = [
  { key: 'Access-Control-Allow-Origin', value: NATIVE_ORIGIN },
  { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, PATCH, DELETE, OPTIONS' },
  // What the native client actually sends: bearer tokens, JSON bodies, and the
  // x-client header that opts it into the native auth response shape.
  { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, x-client' },
  { key: 'Access-Control-Max-Age', value: '86400' },
  // Access-Control-Allow-Credentials is deliberately ABSENT. Native carries its
  // tokens in an Authorization header, never in cookies, so nothing needs
  // credentialed cross-origin requests — and leaving it off means the web's
  // httpOnly session cookies can never be sent from another origin at all.
];

const nextConfig: NextConfig = {
  images: {
    // Posters come from image.tmdb.org already resized — the app asks for w185,
    // w342, w500, w780 by name — and TMDB is a global CDN that has cached them.
    // Optimising them again means Vercel downloads an image that is already the
    // right size, re-encodes it, bills a transformation, and serves it as egress.
    // Unoptimised, the browser fetches TMDB directly: Vercel never touches the
    // image, so both the transformation count and the bandwidth go to zero.
    //
    // Layout is unaffected — width/height/fill/sizes still drive it. The cost is
    // the user's own data, a full JPEG instead of a downscaled WebP, which is
    // small next to a quota that can't be raised. Half the app already does this
    // with plain <img> tags and looks no different.
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'placehold.co', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'image.tmdb.org', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'images.unsplash.com', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'picsum.photos', port: '', pathname: '/**' },
      { protocol: 'https', hostname: '*.public.blob.vercel-storage.com', port: '', pathname: '/**' },
    ],
  },
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: '/(.*)',
        headers: securityHeaders,
      },
      {
        // CORS for the native app only. This sits in next.config rather than in
        // middleware because middleware deliberately does NOT run on /api (see the
        // matcher comment in middleware.ts) — routing every API read through it to
        // add four constant headers would be the cost that comment exists to avoid.
        //
        // Next answers the preflight itself: an OPTIONS request to a route handler
        // gets a 204 with an `allow` list, and these headers ride along with it.
        source: '/api/:path*',
        headers: corsHeaders,
      },
      {
        // The service worker script must NEVER be served from a cache. The whole
        // recovery path for a bad worker is "deploy a new sw.js and every browser
        // picks it up on its next navigation" — a cached copy would break exactly
        // the mechanism that fixes the problem. See scripts/sw-kill.js.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, must-revalidate' },
          // Lets the worker control the whole origin regardless of where it sits.
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        // Revalidated for the same reason, one step removed: the worker refetches
        // this on every version bump, and a stale copy would be what people see
        // when they are offline.
        source: '/offline.html',
        headers: [{ key: 'Cache-Control', value: 'no-cache, must-revalidate' }],
      },
    ];
  },
};

export default nextConfig;
