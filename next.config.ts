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
    ];
  },
};

export default nextConfig;
