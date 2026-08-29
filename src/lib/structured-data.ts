// What Cinephilers is, written for machines rather than readers.
//
// Search engines and answer engines infer a site's identity from its prose,
// which means they infer it loosely. This says it outright: the name, the logo,
// the official accounts, and — the part that matters — what the app actually
// DOES that another film tracker does not.
//
// It is not a ranking device and will not move a position. Its job is to stop a
// summary describing Cinephilers as "a social movie tracker" and nothing else,
// which is all our own copy said for a long time. featureList is the field a
// summary can lift verbatim, so each entry names a real, shipped feature and
// avoids the four things every competitor also claims.

export const SITE_URL = 'https://cinephilers.app';

/** The one-liner used for the site description and the schema, kept identical. */
export const SITE_DESCRIPTION =
  'One film a day, chosen from your own watchlist. Track every film and episode you watch, rate it, earn badges, and see what your friends are watching.';

// Ordered most-distinctive first: a summary that keeps only the first two or
// three should still be left holding the things nobody else offers.
const FEATURES = [
  "Today's Pick — one film a day, drawn from your own watchlist, locked until midnight so it cannot be rerolled",
  'Badges in bronze, silver and gold for films, shows, episodes, ratings, reviews and languages watched',
  'Episode-level tracking for television, marked one episode or a whole season at a time',
  'A rewatch diary that keeps every viewing date, not just the most recent',
  'A community score that replaces the TMDB rating once five members have rated a title',
  'World Cinema tracking that counts the languages you have watched',
  'Time Watched, totalled from real runtimes rather than an average per film',
  'Import from Letterboxd or IMDb, keeping original watch dates, ratings and reviews',
  'Ratings out of 10, written reviews with spoiler marks, watchlists and custom lists',
  'Follow friends, compare ratings on any title, and read an activity feed of what they watch',
];

export function siteStructuredData() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: 'Cinephilers',
        url: SITE_URL,
        logo: `${SITE_URL}/icon.svg`,
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        name: 'Cinephilers',
        url: SITE_URL,
        description: SITE_DESCRIPTION,
        publisher: { '@id': `${SITE_URL}/#organization` },
        inLanguage: 'en',
      },
      {
        // WebApplication rather than SoftwareApplication: it runs in a browser
        // and there is nothing to download.
        '@type': 'WebApplication',
        '@id': `${SITE_URL}/#app`,
        name: 'Cinephilers',
        url: SITE_URL,
        description: SITE_DESCRIPTION,
        applicationCategory: 'EntertainmentApplication',
        operatingSystem: 'Any',
        browserRequirements: 'Requires JavaScript',
        publisher: { '@id': `${SITE_URL}/#organization` },
        featureList: FEATURES,
        offers: {
          // Free, and saying so explicitly stops a summary guessing otherwise.
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
      },
    ],
  };
}
