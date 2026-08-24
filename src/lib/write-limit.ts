import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, getIp } from './rate-limit';

// A ceiling on how fast one account can write, for the endpoints that had none.
//
// 32 mutating endpoints were unlimited — every write to watchlist, watched,
// ratings, lists, reviews and episodes. All of them require a session, so this
// was never an open door; it was one logged-in account being able to hammer them
// with a script.
//
// This lives in the routes rather than in middleware, and that was a considered
// reversal. Middleware would have covered all 32 in one line — but a matcher
// filters by PATH, not by method, so the only way to see a POST there is to run
// on every read too, and reads outnumber writes by a wide margin. Paying an
// invocation on every metadata lookup to police the occasional write is the wrong
// way round. Here it costs nothing until somebody actually writes.
//
// The cost of the choice is that a new write route has to remember to call this.
// write-limit.test.ts enforces that, so forgetting fails the test run rather than
// quietly shipping another unlimited endpoint.

// Per minute. Deliberately generous: this is a ceiling on abuse, not a quota.
// Ticking through a season one episode at a time is a burst of real writes by a
// real person, and a limit that interrupts that is a worse bug than the one it
// prevents. The tight limits stay where they belong — 10/min on login, 5/min on
// registration, 3 imports per 10 minutes — and this sits above them.
const WRITE_LIMIT = 240;
const WRITE_WINDOW_MS = 60_000;

/**
 * Count a write against whoever is making it. Returns a 429 to send back, or
 * null to carry on.
 *
 * Pass the authenticated user id where there is one. It matters more than the
 * address: a phone and a laptop on one home connection share an address, and so
 * do everybody behind a mobile carrier's gateway — limiting those together would
 * punish strangers for each other.
 *
 * Fails OPEN. A limiter that cannot reach Redis must never become the reason
 * nobody can save anything.
 */
export async function writeLimit(req: NextRequest, userId?: string): Promise<NextResponse | null> {
  const who = userId ? `user:${userId}` : `ip:${getIp(req)}`;
  try {
    const { allowed, retryAfter } = await rateLimit(`write:${who}`, WRITE_LIMIT, WRITE_WINDOW_MS);
    if (allowed) return null;
    return NextResponse.json(
      { success: false, message: `Too many requests. Try again in ${retryAfter}s` },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  } catch {
    return null;
  }
}
