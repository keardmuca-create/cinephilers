// Who gets the Founder welcome, and when.
//
// Two conditions, and both matter:
//
// `welcomedAt` is null — the account has never been shown it. Stored on the
// account rather than in localStorage because a first sign-in happens once in a
// lifetime, not once per browser. (The genre skip beside it is deliberately
// per-device; that one is "not now", which is a different kind of answer.)
//
// `createdAt` is after the cutoff — the accounts that existed before this
// shipped never see it. They have had the Founder chip on their profile for
// weeks; telling someone who joined in June "welcome, you're now part of the
// community" reads as a bug, not a welcome. Same shape as the email-verification
// cutoff in the login route, and for the same reason: a date beats a backfill,
// because a backfill has a race with every account created while it runs.
export const WELCOME_LIVE_AFTER = new Date('2026-08-25T00:00:00.000Z');

export function needsFounderWelcome(u: {
  welcomedAt?: string | Date | null;
  createdAt?: string | Date | null;
} | null | undefined): boolean {
  if (!u || !u.createdAt) return false;
  if (u.welcomedAt) return false;
  return new Date(u.createdAt) >= WELCOME_LIVE_AFTER;
}
