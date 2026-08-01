import { describe, it, expect } from 'vitest';
import { describeShowProgress, type SeasonCounts } from './show-progress';

// Breaking Bad: 5 seasons, 62 episodes.
const BB: SeasonCounts = { '1': 7, '2': 13, '3': 13, '4': 13, '5': 16 };
const by = (entries: [number, number][]) => new Map(entries);

describe('describeShowProgress', () => {
  it('says Completed when every episode is watched', () => {
    const p = describeShowProgress(by([[1, 7], [2, 13], [3, 13], [4, 13], [5, 16]]), BB, 62);
    expect(p.label).toBe('Completed');
    expect(p.complete).toBe(true);
  });

  it('names the season when exactly one season is finished', () => {
    expect(describeShowProgress(by([[1, 7]]), BB, 62).label).toBe('Season 1');
  });

  it('names a run of finished seasons as a range', () => {
    expect(describeShowProgress(by([[1, 7], [2, 13]]), BB, 62).label).toBe('Seasons 1–2');
  });

  // Watching seasons 1 and 3 isn't a story about seasons, it's one about
  // episodes — and a list of them tells you less than the number does.
  it('counts episodes when the seasons are not a run', () => {
    expect(describeShowProgress(by([[1, 7], [3, 13]]), BB, 62).label).toBe('20 / 62');
  });

  it('keeps a long run as a range, however many seasons it spans', () => {
    const long: SeasonCounts = { '1': 6, '2': 13, '3': 16, '4': 16, '5': 16, '6': 16, '7': 16 };
    const watched = by([[1, 6], [2, 13], [3, 16], [4, 16], [5, 16], [6, 16], [7, 16]]);
    expect(describeShowProgress(watched, long, 177).label).toBe('Seasons 1–7');
  });

  it('counts episodes however many scattered seasons there are', () => {
    const long: SeasonCounts = { '1': 6, '2': 13, '3': 16, '4': 16, '5': 16, '6': 16, '7': 16 };
    expect(describeShowProgress(by([[1, 6], [3, 16], [5, 16], [7, 16]]), long, 177).label).toBe('54 / 177');
    expect(describeShowProgress(by([[1, 7], [3, 13], [5, 16]]), BB, 62).label).toBe('36 / 62');
  });

  // A run that starts late is still a run, so it still gets named.
  it('names a run that does not start at season 1', () => {
    expect(describeShowProgress(by([[3, 13], [4, 13]]), BB, 62).label).toBe('Seasons 3–4');
  });

  it('falls back to a count when a season is only part-watched', () => {
    expect(describeShowProgress(by([[1, 7], [2, 4]]), BB, 62).label).toBe('11 / 62');
  });

  it('says 1 episode for a single guest-star drop-in', () => {
    expect(describeShowProgress(by([[3, 1]]), BB, 62).label).toBe('1 episode');
  });

  // Season 1 of Breaking Bad is 7 episodes, so one episode of it is NOT the season.
  it('does not name a season from a single episode of it', () => {
    expect(describeShowProgress(by([[1, 1]]), BB, 62).label).toBe('1 episode');
  });

  it('falls back to a count before season totals are backfilled', () => {
    expect(describeShowProgress(by([[1, 7]]), undefined, 62).label).toBe('7 / 62');
  });

  it('copes with no episode total at all', () => {
    expect(describeShowProgress(by([[1, 3]]), undefined, 0).label).toBe('3 episodes');
  });

  it('still says Completed when the total is met, whatever the seasons say', () => {
    // A show whose season counts are stale but whose total is right.
    expect(describeShowProgress(by([[1, 62]]), BB, 62).label).toBe('Completed');
  });

  it('reports the episode numbers alongside the label', () => {
    const p = describeShowProgress(by([[1, 7], [2, 13]]), BB, 62);
    expect(p.watchedEpisodes).toBe(20);
    expect(p.totalEpisodes).toBe(62);
  });
});
