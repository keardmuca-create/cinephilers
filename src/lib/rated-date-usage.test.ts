import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// media-id.test.ts proves the rated-date INDEX is right. This proves the screens
// actually ask it.
//
// That gap is what let the bug survive its own fix. 885bb7e introduced
// getRatedAt and moved the full Ratings page onto it, so the reported symptom
// went away — but the Ratings row on the profile still sorted by getAddedAt, and
// the add index keeps the EARLIEST date a title was seen. A film watchlisted in
// June and rated in August sorted as June. Because that row renders only the
// first 50 of what can be hundreds of ratings, the newly rated film did not sink
// a few places, it fell off the end and disappeared from the row completely
// while sitting first under See All. Two months later it read as a fresh bug.
//
// The index alone can never catch that: every one of its tests passed the whole
// time. So these read the source instead, and name each screen deliberately —
// which is the point, because the next list of ratings someone adds will not
// announce that it needs the same date.

const SRC = join(process.cwd(), 'src');
const read = (...p: string[]) => readFileSync(join(SRC, ...p), 'utf8');

describe('every list of RATINGS orders by the rating date', () => {
  it('the profile Ratings row sorts by getRatedAt, never getAddedAt', () => {
    const src = read('app', '(main)', 'profile', 'page.tsx');

    // Both passes: the first render, and the later one for titles whose posters
    // arrive after a meta fetch. Sorting those two differently would shuffle the
    // row as it loads.
    const ratedSorts = [...src.matchAll(/setRatedItems[\s\S]{0,400}?sort\(\(a, b\) => (\w+)\(b\.id\)/g)]
      .map(m => m[1]);

    expect(ratedSorts.length, 'expected both setRatedItems sorts to be found').toBe(2);
    for (const fn of ratedSorts) expect(fn).toBe('getRatedAt');
  });

  it('the full Ratings page sorts by getRatedAt', () => {
    const src = read('app', '(main)', 'ratings', 'page.tsx');
    expect(src).toContain('getRatedAt');
  });

  // The counterpart, so a future "fix" does not swap these too: a WATCHLIST row
  // genuinely is ordered by when the title was added. Same helper, right answer.
  it('the profile Watchlist row still sorts by getAddedAt', () => {
    const src = read('app', '(main)', 'profile', 'page.tsx');
    expect(src).toMatch(/setWatchlist\([\s\S]{0,200}?getAddedAt\(b\.id\)/);
  });
});

describe('every path that records a rating stamps the rating date', () => {
  // The episode page wrote the score straight to localStorage and never stamped
  // a date, so episode ratings fell back to the add date exactly as films used
  // to. Named individually rather than inferred, because a route that writes a
  // rating is not a pattern a scan can recognise reliably.
  const RATING_WRITERS: [string, string[]][] = [
    ['movie page', ['app', 'movie', '[id]', 'page.tsx']],
    ['episode page', ['components', 'episode-page.tsx']],
    ['import dialog', ['components', 'import-dialog.tsx']],
    ['login sync', ['contexts', 'auth-context.tsx']],
  ];

  for (const [name, path] of RATING_WRITERS) {
    it(`${name} calls recordRatedAt`, () => {
      expect(read(...path)).toContain('recordRatedAt');
    });
  }
});
