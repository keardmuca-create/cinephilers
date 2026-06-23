
import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/contexts/auth-context';

export const metadata: Metadata = {
  title: 'Cinephilers — Track, Rate & Discuss with Friends',
  description: 'Log every movie and show you watch. Rate them, write reviews, build lists, and see what your friends are watching.',
  metadataBase: new URL('https://cinephilers.app'),
  openGraph: {
    type: 'website',
    siteName: 'Cinephilers',
    title: 'Cinephilers — Track, Rate & Discuss with Friends',
    description: 'Log every movie and show you watch. Rate them, write reviews, build lists, and see what your friends are watching.',
    url: 'https://cinephilers.app',
  },
  twitter: {
    card: 'summary',
    title: 'Cinephilers — Track, Rate & Discuss with Friends',
    description: 'Log every movie and show you watch. Rate them, write reviews, build lists, and see what your friends are watching.',
  },
  verification: {
    google: 'iXOrHwM2YB_g3HVEb6FnHIISh0He81e5DUdazpKHsvk',
  },
  // Icons are provided by App Router file conventions:
  // src/app/favicon.ico, src/app/icon.svg, src/app/apple-icon.png
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  // Required for env(safe-area-inset-*) to work in installed PWA mode
  viewportFit: 'cover',
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
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
