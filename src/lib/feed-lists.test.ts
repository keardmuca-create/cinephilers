import { describe, it, expect } from 'vitest';
import { buildListCards, type CreatedListRow, type ListAddRow } from './feed-lists';
import { localDay } from './local-day';

const keard = { id: 'u1', username: 'keard' };
const utc = (_userId: string, at: Date) => at.toISOString().slice(0, 10);

const list = (over: Partial<CreatedListRow<typeof keard>> = {}): CreatedListRow<typeof keard> => ({
  id: 'l1',
  name: 'Top Horror',
  createdAt: new Date('2026-09-15T10:00:00.000Z'),
  user: keard,
  itemCount: 2,
  firstItems: [{ tmdbId: 'tmdb-1', title: 'Alien', poster: 'a.jpg' }, { tmdbId: 'tmdb-2', title: 'The Thing', poster: 't.jpg' }],
  ...over,
});

const add = (id: string, iso: string, listOver: Partial<ListAddRow<typeof keard>['list']> = {}): ListAddRow<typeof keard> => ({
  id,
  tmdbId: `tmdb-${id}`,
  title: `Title ${id}`,
  poster: `${id}.jpg`,
  addedAt: new Date(iso),
  list: { id: 'l1', name: 'Top Horror', createdAt: new Date('2026-09-15T10:00:00.000Z'), user: keard, ...listOver },
});

describe('buildListCards', () => {
  it('shows a new list once it has a title, and not while it is empty', () => {
    expect(buildListCards([list({ itemCount: 0, firstItems: [] })], [], utc)).toEqual([]);
    const cards = buildListCards([list()], [], utc);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ kind: 'created', listName: 'Top Horror', count: 2 });
  });

  // Keard, 2026-09-15: made and filled on the same day is one card, not two.
  it('folds titles added on the day the list was made into its created card', () => {
    const cards = buildListCards([list()], [add('1', '2026-09-15T11:00:00.000Z'), add('2', '2026-09-15T12:00:00.000Z')], utc);
    expect(cards.map(c => c.kind)).toEqual(['created']);
  });

  it('gives a later day its own "added to" card, one title or a group', () => {
    const one = buildListCards([], [add('1', '2026-09-16T11:00:00.000Z')], utc);
    expect(one).toEqual([expect.objectContaining({ kind: 'added', count: 1, listName: 'Top Horror' })]);

    const two = buildListCards([], [add('1', '2026-09-16T11:00:00.000Z'), add('2', '2026-09-16T13:00:00.000Z')], utc);
    expect(two).toHaveLength(1);
    expect(two[0]).toMatchObject({ kind: 'added', count: 2 });
    // Newest first on the strip, and the card sits at the latest add.
    expect(two[0].items.map(i => i.tmdbId)).toEqual(['tmdb-2', 'tmdb-1']);
    expect(two[0].at.toISOString()).toBe('2026-09-16T13:00:00.000Z');
  });

  it('keeps different lists apart on the same day', () => {
    const cards = buildListCards([], [
      add('1', '2026-09-16T11:00:00.000Z'),
      add('2', '2026-09-16T12:00:00.000Z', { id: 'l2', name: 'Comfort Watches' }),
    ], utc);
    expect(cards.map(c => c.listName).sort()).toEqual(['Comfort Watches', 'Top Horror']);
  });

  // The owner's own midnight decides, as for every other burst: 23:30 in Tirana on
  // the day the list was made still belongs to it; 00:30 is a new day.
  it("uses the owner's day for folding into the created card", () => {
    const tirana = (_u: string, at: Date) => localDay('Europe/Tirane', at);
    const made = list({ createdAt: new Date('2026-09-15T08:00:00.000Z') }); // 10:00 on the 15th
    const cards = buildListCards([made], [
      add('1', '2026-09-15T21:30:00.000Z', { createdAt: made.createdAt }), // 23:30 on the 15th
      add('2', '2026-09-15T22:30:00.000Z', { createdAt: made.createdAt }), // 00:30 on the 16th
    ], tirana);
    expect(cards.map(c => c.kind).sort()).toEqual(['added', 'created']);
    expect(cards.find(c => c.kind === 'added')!.items.map(i => i.tmdbId)).toEqual(['tmdb-2']);
  });
});
