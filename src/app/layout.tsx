
import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/contexts/auth-context';
import { OfflineBanner } from '@/components/offline-banner';

export const metadata: Metadata = {
  title: 'Cinephilers | Track, Rate & Discuss with Friends',
  description: 'Log every movie and show you watch. Rate them, write reviews, build lists, and see what your friends are watching.',
  metadataBase: new URL('https://cinephilers.app'),
  openGraph: {
    type: 'website',
    siteName: 'Cinephilers',
    title: 'Cinephilers | Track, Rate & Discuss with Friends',
    description: 'Log every movie and show you watch. Rate them, write reviews, build lists, and see what your friends are watching.',
    url: 'https://cinephilers.app',
  },
  twitter: {
    card: 'summary',
    title: 'Cinephilers | Track, Rate & Discuss with Friends',
    description: 'Log every movie and show you watch. Rate them, write reviews, build lists, and see what your friends are watching.',
  },
  verification: {
    google: 'iXOrHwM2YB_g3HVEb6FnHIISh0He81e5DUdazpKHsvk',
  },
  // iOS ignores the manifest's display:standalone, so this emits
  // <meta name="apple-mobile-web-app-capable"> to launch the home-screen
  // icon full-screen without the Safari address bar.
  appleWebApp: {
    capable: true,
    title: 'Cinephilers',
    statusBarStyle: 'black-translucent',
  },
  // Next only emits the modern `mobile-web-app-capable`; iOS < 16.4 needs
  // the legacy apple-prefixed tag to launch standalone.
  other: {
    'apple-mobile-web-app-capable': 'yes',
  },
  // Icons are provided by App Router file conventions:
  // src/app/favicon.ico, src/app/icon.svg, src/app/apple-icon.png
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  // Required for env(safe-area-inset-*) to work in installed PWA mode
  viewportFit: 'cover',
  // Lock pinch-zoom so the installed app feels like a fixed native screen, not
  // a zoomable web page. iOS enforces this only in standalone/PWA mode; regular
  // Safari still allows zoom (which is the accessible default there).
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Reading the nonce header opts the whole app into per-request rendering, so
  // every page receives a fresh CSP nonce (see middleware.ts). Without this,
  // statically prerendered pages would ship scripts with no nonce and the
  // strict CSP would block them.
  await headers();

  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased bg-background text-foreground overflow-x-hidden">
        {/* Solid band behind the iOS status bar in standalone PWA mode, so the
            clock/Wi-Fi/battery sit on a clean background instead of overlapping
            the hero poster. Zero-height (invisible) in normal browsers. */}
        <div
          aria-hidden
          className="fixed top-0 inset-x-0 z-[100] bg-background pointer-events-none"
          style={{ height: 'env(safe-area-inset-top)' }}
        />
        <OfflineBanner />
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
