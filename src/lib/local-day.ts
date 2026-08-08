// What day it is for a particular person.
//
// Today's Pick resets on a day boundary, and the streak badge counts consecutive
// days — so both have to agree on where a day starts, and the answer is different
// for everyone. This is the one place that decides it. Two callers, one function:
// if the pick and the streak ever disagreed about a boundary, someone would lose
// a streak on a night they actually watched something, and there would be nothing
// on screen explaining why.
//
// It used to be UTC for everybody, which put the reset at 2am for a viewer in
// Albania and at 5pm — mid-afternoon — for one in California, who could then
// generate twice in the same evening.

/**
 * The calendar day (YYYY-MM-DD) at `at` in `timeZone`.
 *
 * `timeZone` is an IANA name as reported by the browser, e.g. "Europe/Tirane".
 * Null, unknown or malformed zones fall back to UTC rather than throwing: a
 * pick resetting at the wrong hour is a small wrong, and a crash on the home
 * screen is a large one.
 *
 * IANA names are used rather than a stored offset because they carry their own
 * daylight-saving rules — the boundary stays at local midnight through a clock
 * change, and through the user travelling, with nothing to update twice a year.
 */
export function localDay(timeZone: string | null | undefined, at: Date = new Date()): string {
  if (!timeZone) return utcDay(at);
  try {
    // en-CA formats as YYYY-MM-DD, which is the shape DailyPick.day stores.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at);
  } catch {
    return utcDay(at);
  }
}

export function utcDay(at: Date = new Date()): string {
  return at.toISOString().slice(0, 10);
}

/** Cheap sanity check before storing whatever a client claims its zone is. */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length === 0 || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Difference in whole days between two YYYY-MM-DD strings.
 *
 * Compared as UTC midnights on purpose. These are already local calendar dates —
 * the zone did its work when they were produced — so this is plain date
 * arithmetic, and using UTC for it means no second time zone gets involved and
 * no daylight-saving hour can make two consecutive days look 0 or 2 apart.
 */
export function daysBetween(earlier: string, later: string): number {
  const a = Date.parse(`${earlier}T00:00:00Z`);
  const b = Date.parse(`${later}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  return Math.round((b - a) / 86_400_000);
}
