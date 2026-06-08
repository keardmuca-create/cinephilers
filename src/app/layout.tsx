
import type { Metadata } from 'next';
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
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
      </head>
      <body className="font-body antialiased bg-background text-foreground overflow-x-hidden">
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
