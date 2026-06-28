// In-memory mock database — used when DATABASE_URL is not set.
// Data resets on cold start. Swap for real Prisma by setting DATABASE_URL.

import crypto from 'crypto';

type AnyRecord = Record<string, unknown>;
type WhereVal = unknown;
type WhereClause = Record<string, WhereVal>;
type OrderDir = 'asc' | 'desc';
type OrderBy = Record<string, OrderDir> | Record<string, OrderDir>[];
type SelectClause = Record<string, boolean | AnyRecord> | null | undefined;

function generateId(): string {
  return crypto.randomUUID();
}

function matchesWhere(record: AnyRecord, where: WhereClause): boolean {
  return Object.entries(where).every(([key, condition]) => {
    const val = record[key];
    if (condition === null || condition === undefined || typeof condition !== 'object') {
      return val === condition;
    }
    const cond = condition as AnyRecord;
    if ('gt' in cond) return (val as number) > (cond.gt as number);
    if ('gte' in cond) return (val as number) >= (cond.gte as number);
    if ('lt' in cond) return (val as number) < (cond.lt as number);
    if ('lte' in cond) return (val as number) <= (cond.lte as number);
    if ('not' in cond) return val !== cond.not;
    if ('in' in cond) return Array.isArray(cond.in) && (cond.in as unknown[]).includes(val);
    // Composite unique key e.g. { userId_tmdbId_mediaType: { userId, tmdbId, mediaType } }
    return Object.entries(cond).every(([k, v]) => record[k] === v);
  });
}

function applyOrderBy(records: AnyRecord[], orderBy: OrderBy): AnyRecord[] {
  const orders = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...records].sort((a, b) => {
    for (const order of orders) {
      for (const [key, dir] of Object.entries(order)) {
        const av = a[key] as number | string | Date;
        const bv = b[key] as number | string | Date;
        if (av < bv) return dir === 'asc' ? -1 : 1;
        if (av > bv) return dir === 'asc' ? 1 : -1;
      }
    }
    return 0;
  });
}

function applyData(existing: AnyRecord, data: AnyRecord): AnyRecord {
  const result = { ...existing };
  for (const [key, val] of Object.entries(data)) {
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      const op = val as AnyRecord;
      if ('increment' in op) {
        result[key] = ((result[key] as number) ?? 0) + (op.increment as number);
        continue;
      }
      if ('decrement' in op) {
        result[key] = ((result[key] as number) ?? 0) - (op.decrement as number);
        continue;
      }
    }
    result[key] = val;
  }
  return result;
}

class Table {
  rows: AnyRecord[] = [];

  findUnique(args: { where: WhereClause; select?: SelectClause; include?: unknown }): AnyRecord | null {
    return this.rows.find(r => matchesWhere(r, args.where)) ?? null;
  }

  findFirst(args: { where?: WhereClause; orderBy?: OrderBy; select?: SelectClause; include?: unknown } = {}): AnyRecord | null {
    let results = args.where ? this.rows.filter(r => matchesWhere(r, args.where!)) : [...this.rows];
    if (args.orderBy) results = applyOrderBy(results, args.orderBy);
    return results[0] ?? null;
  }

  findMany(args: { where?: WhereClause; orderBy?: OrderBy; take?: number; skip?: number; select?: SelectClause; include?: unknown } = {}): AnyRecord[] {
    let results = args.where ? this.rows.filter(r => matchesWhere(r, args.where!)) : [...this.rows];
    if (args.orderBy) results = applyOrderBy(results, args.orderBy);
    if (args.skip) results = results.slice(args.skip);
    if (args.take !== undefined) results = results.slice(0, args.take);
    return results;
  }

  create(args: { data: AnyRecord }): AnyRecord {
    const now = new Date();
    const row: AnyRecord = { id: generateId(), createdAt: now, updatedAt: now, ...args.data };
    this.rows.push(row);
    return row;
  }

  createMany(args: { data: AnyRecord[]; skipDuplicates?: boolean }): { count: number } {
    let count = 0;
    for (const data of args.data) {
      if (args.skipDuplicates) {
        // Best-effort match of the common (userId, tmdbId, mediaType) unique key so
        // dev behaves like Postgres' skipDuplicates for import inserts.
        const dup = this.rows.some(r =>
          r.userId === data.userId && r.tmdbId === data.tmdbId && r.mediaType === data.mediaType
        );
        if (dup) continue;
      }
      this.create({ data });
      count++;
    }
    return { count };
  }

  update(args: { where: WhereClause; data: AnyRecord; select?: SelectClause }): AnyRecord {
    const idx = this.rows.findIndex(r => matchesWhere(r, args.where));
    if (idx === -1) throw new Error(`[mock-db] Record not found for update`);
    this.rows[idx] = { ...applyData(this.rows[idx], args.data), updatedAt: new Date() };
    return this.rows[idx];
  }

  upsert(args: { where: WhereClause; create: AnyRecord; update: AnyRecord }): AnyRecord {
    const existing = this.findUnique({ where: args.where });
    if (existing) return this.update({ where: args.where, data: args.update });
    return this.create({ data: args.create });
  }

  delete(args: { where: WhereClause }): AnyRecord {
    const idx = this.rows.findIndex(r => matchesWhere(r, args.where));
    if (idx === -1) throw new Error(`[mock-db] Record not found for delete`);
    return this.rows.splice(idx, 1)[0];
  }

  deleteMany(args: { where?: WhereClause } = {}): { count: number } {
    const before = this.rows.length;
    this.rows = args.where ? this.rows.filter(r => !matchesWhere(r, args.where!)) : [];
    return { count: before - this.rows.length };
  }

  count(args: { where?: WhereClause } = {}): number {
    if (!args.where) return this.rows.length;
    return this.rows.filter(r => matchesWhere(r, args.where!)).length;
  }
}

const tables = {
  user: new Table(),
  badge: new Table(),
  rating: new Table(),
  review: new Table(),
  reviewLike: new Table(),
  watchedItem: new Table(),
  watchlistItem: new Table(),
  favorite: new Table(),
  customList: new Table(),
  customListItem: new Table(),
  follow: new Table(),
};

// Wrap user.findUnique to inject _count for followers/following
const rawUserFindUnique = tables.user.findUnique.bind(tables.user);
tables.user.findUnique = function(args) {
  const user = rawUserFindUnique(args);
  if (!user) return null;
  const wantsCount = args.select && typeof args.select._count === 'object' && args.select._count !== null;
  if (wantsCount) {
    const countSelect = (args.select!._count as AnyRecord).select as AnyRecord | undefined;
    const _count: AnyRecord = {};
    if (countSelect?.followers) {
      _count.followers = tables.follow.count({ where: { followingId: user.id as string } });
    }
    if (countSelect?.following) {
      _count.following = tables.follow.count({ where: { followerId: user.id as string } });
    }
    return { ...user, _count };
  }
  return user;
};

export const mockDb = tables;
