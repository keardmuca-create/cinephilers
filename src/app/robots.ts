import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/profile', '/home', '/browse', '/history', '/ratings', '/watchlist', '/social', '/stats', '/onboarding'],
    },
    sitemap: 'https://cinephilers.app/sitemap.xml',
  };
}
