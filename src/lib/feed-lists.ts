import { splitBursts } from './feed-groups';

// Custom lists in the activity feed: someone made a list, or added to one.
//
// Public lists only — the query sees to that. A private list is its owner's, even
// from the people who follow them. And a list only shows once it holds a title: an
// empty "Created a list" card says nothing anyone can look at.
//
// A list made and filled on the same day is ONE "Created a list" card, not a created
// card plus an added card for the same titles. Adds on a later day are "Added to
// <list>", folded per list per day by the feed's usual burst rule. The day is the
// owner's own, as everywhere else in the feed.

/** What a list card shows of a title. Lists keep their own title and poster copies. */
export interface ListPoster {
  tmdbId: string;
  title: string | null;
  poster: string | null;
}

type Owner = { id: string };

export interface CreatedListRow<U extends Owner> {
  id: string;
  name: string;
  createdAt: Date;
  user: U;
  itemCount: number;
  /** The first titles put in it, oldest first. */
  firstItems: ListPoster[];
}

export interface ListAddRow<U extends Owner> {
  id: string;
  tmdbId: string;
  title: string | null;
  poster: string | null;
  addedAt: Date;
  list: { id: string; name: string; createdAt: Date; user: U };
}

export interface ListCard<U extends Owner> {
  kind: 'created' | 'added';
  /** Stable card id. */
  key: string;
  listId: string;
  listName: string;
  user: U;
  at: Date;
  /** Up to POSTERS titles for the strip. */
  items: ListPoster[];
  /** Titles in the list (created) or added that day (added). */
  count: number;
}

export const LIST_POSTERS = 6;

export function buildListCards<U extends Owner>(
  created: CreatedListRow<U>[],
  adds: ListAddRow<U>[],
  dayOf: (userId: string, at: Date) => string,
): ListCard<U>[] {
  const cards: ListCard<U>[] = [];

  const shown = new Map<string, CreatedListRow<U>>();
  for (const list of created) {
    if (list.itemCount === 0) continue;
    shown.set(list.id, list);
    cards.push({
      kind: 'created',
      key: `list-created-${list.id}`,
      listId: list.id,
      listName: list.name,
      user: list.user,
      at: list.createdAt,
      items: list.firstItems.slice(0, LIST_POSTERS),
      count: list.itemCount,
    });
  }

  // Titles that went in on the day the list was made belong to its created card.
  const later = adds.filter(a => {
    const made = shown.get(a.list.id);
    return !(made && dayOf(a.list.user.id, a.addedAt) === dayOf(a.list.user.id, made.createdAt));
  });

  const toCard = (key: string, rows: ListAddRow<U>[]): ListCard<U> => {
    const sorted = rows.slice().sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime());
    return {
      kind: 'added',
      key,
      listId: sorted[0].list.id,
      listName: sorted[0].list.name,
      user: sorted[0].list.user,
      at: sorted[0].addedAt,
      items: sorted.slice(0, LIST_POSTERS).map(r => ({ tmdbId: r.tmdbId, title: r.title, poster: r.poster })),
      count: rows.length,
    };
  };

  const { singles, groups } = splitBursts(later, a => `${a.list.user.id}:${a.list.id}:${dayOf(a.list.user.id, a.addedAt)}`);
  for (const add of singles) cards.push(toCard(`list-added-item-${add.id}`, [add]));
  for (const { key, rows } of groups) cards.push(toCard(`list-added-${key}`, rows));

  return cards;
}
