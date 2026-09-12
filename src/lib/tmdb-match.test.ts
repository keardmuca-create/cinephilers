import { describe, it, expect } from 'vitest';
import { normalizeTitle, titleKey, matchByImdbId, matchByTitle, createThrottle, mapWithConcurrency, type TmdbFetcher } from './tmdb-match';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('normalizeTitle / titleKey', () => {
  it('drops case, accents, punctuation and articles', () => {
    expect(normalizeTitle('The Dark Knight')).toBe('dark knight');
    expect(normalizeTitle('Amélie')).toBe('amelie');
    expect(normalizeTitle('Fast & Furious')).toBe('fast and furious');
  });

  it('keys a search by normalized title, year and search type', () => {
    expect(titleKey('The Dark Knight', '2008', 'movie')).toBe('title:dark knight|2008|movie');
    expect(titleKey('Breaking Bad', '', null)).toBe('title:breaking bad||any');
  });
});

describe('matchByImdbId', () => {
  it('is an exact, confident match for a film', async () => {
    const fetcher: TmdbFetcher = async () => json({ movie_results: [{ id: 155, title: 'The Dark Knight', release_date: '2008-07-16', vote_count: 30000 }], tv_results: [] });
    const m = await matchByImdbId('tt0468569', 'k', fetcher);
    expect(m).toMatchObject({ tmdbId: 'tmdb-155', mediaType: 'MOVIE', year: '2008', confident: true });
  });

  it('finds a series under its own id', async () => {
    const fetcher: TmdbFetcher = async () => json({ movie_results: [], tv_results: [{ id: 1396, name: 'Breaking Bad', first_air_date: '2008-01-20' }] });
    expect(await matchByImdbId('tt0903747', 'k', fetcher)).toMatchObject({ tmdbId: 'tmdb-tv-1396', mediaType: 'SHOW', confident: true });
  });

  it('is no match for an episode id or an unknown id', async () => {
    const episode: TmdbFetcher = async () => json({ movie_results: [], tv_results: [], tv_episode_results: [{ id: 62161, show_id: 1396 }] });
    expect(await matchByImdbId('tt2301451', 'k', episode)).toBeNull();
    const empty: TmdbFetcher = async () => json({ movie_results: [], tv_results: [] });
    expect(await matchByImdbId('tt99999999', 'k', empty)).toBeNull();
  });

  it('throws when TMDB errors, so it is retried rather than read as "no match"', async () => {
    const down: TmdbFetcher = async () => json({}, 503);
    await expect(matchByImdbId('tt0468569', 'k', down)).rejects.toThrow();
  });
});

describe('matchByTitle', () => {
  it('throws when a search errors instead of reporting no match', async () => {
    const limited: TmdbFetcher = async () => json({}, 429);
    await expect(matchByTitle('Heat', '1995', 'movie', 'k', limited)).rejects.toThrow();
  });

  it('only searches films when told the file is films only', async () => {
    const urls: string[] = [];
    const fetcher: TmdbFetcher = async url => { urls.push(url); return json({ results: [{ id: 949, title: 'Heat', release_date: '1995-12-15', vote_count: 7000, popularity: 30 }] }); };
    const m = await matchByTitle('Heat', '1995', 'movie', 'k', fetcher);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('/search/movie');
    expect(m).toMatchObject({ tmdbId: 'tmdb-949', confident: true });
  });
});

// Short titles: the resemblance test lets "contains it" through, and the longer,
// more popular title used to win. Measured on 3,300 real TMDB titles (2026-09-12):
// 49 wrong matches fixed by ranking the exact title first, none broken.
describe('matchByTitle on short titles', () => {
  const searches = (movies: object[], shows: object[] = []): TmdbFetcher => async url =>
    json({ results: url.includes('/search/tv') ? shows : movies });

  it('takes the exact title over a more popular one that only contains it', async () => {
    const m = await matchByTitle('Devil', '2010', 'movie', 'k', searches([
      { id: 49797, title: 'I Saw the Devil', release_date: '2010-08-12', vote_count: 4000, popularity: 90 },
      { id: 44040, title: 'Devil', release_date: '2010-09-16', vote_count: 3186, popularity: 20 },
    ]));
    expect(m).toMatchObject({ tmdbId: 'tmdb-44040', confident: true });
  });

  it('ranks films and shows together, so a show that contains the title loses', async () => {
    const m = await matchByTitle('It', '2017', null, 'k', searches(
      [{ id: 346364, title: 'It', release_date: '2017-09-06', vote_count: 20000, popularity: 40 }],
      [{ id: 117404, name: 'It starts today', first_air_date: '2017-01-01', vote_count: 30, popularity: 500 }],
    ));
    expect(m).toMatchObject({ tmdbId: 'tmdb-346364', mediaType: 'MOVIE' });
  });

  it('looks past the first five results for the exact title', async () => {
    const decoys = Array.from({ length: 6 }, (_, i) => ({ id: 100 + i, title: `The Return of Thing ${i}`, release_date: '1985-01-01', vote_count: 5000 }));
    const m = await matchByTitle('Return', '1985', 'movie', 'k', searches([...decoys, { id: 403587, title: 'Return', release_date: '1985-05-01', vote_count: 2700 }]));
    expect(m?.tmdbId).toBe('tmdb-403587');
  });

  it('is not sure when two titles fit equally well', async () => {
    const m = await matchByTitle('Halloween', null, 'movie', 'k', searches([
      { id: 948, title: 'Halloween', release_date: '1978-10-24', vote_count: 6000 },
      { id: 424139, title: 'Halloween', release_date: '2018-10-18', vote_count: 5000 },
    ]));
    expect(m?.confident).toBe(false);
  });

  it('stays sure when the only namesake is obscure', async () => {
    const m = await matchByTitle('Heat', '1995', 'movie', 'k', searches([
      { id: 949, title: 'Heat', release_date: '1995-12-15', vote_count: 7000 },
      { id: 1, title: 'Heat', release_date: '1995-03-01', vote_count: 12 },
    ]));
    expect(m).toMatchObject({ tmdbId: 'tmdb-949', confident: true });
  });
});

describe('createThrottle / mapWithConcurrency', () => {
  it('spaces calls to the rate given', async () => {
    const wait = createThrottle(20); // one slot every 50 ms
    const t = Date.now();
    await Promise.all([wait(), wait(), wait(), wait()]);
    expect(Date.now() - t).toBeGreaterThanOrEqual(140);
  });

  it('never runs more than the limit at once and keeps order', async () => {
    let running = 0;
    let peak = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async n => {
      running++;
      peak = Math.max(peak, running);
      await new Promise(r => setTimeout(r, 10));
      running--;
      return n * 2;
    });
    expect(peak).toBeLessThanOrEqual(3);
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14]);
  });
});
