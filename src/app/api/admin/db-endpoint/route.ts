import { NextRequest } from 'next/server';
import { ok, err } from '@/lib/api-response';
import { requireAdmin } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

// Is production talking to Postgres through the POOLED endpoint?
//
// It matters because every function invocation opens its own connection. Against
// the direct endpoint a traffic spike exhausts Neon's connection limit and the
// app starts refusing to answer; against the pooler the same spike queues. The
// two differ by one word in a hostname — `-pooler` — and nothing in the app fails
// loudly if it is missing. It just holds until the day it does not.
//
// The question could not be answered any other way: DATABASE_URL is stored in
// Vercel as a Secret, which is write-only after saving, so the dashboard cannot
// show it back. The only thing that knows what production actually holds is
// production.
//
// This route reads no data, touches no database and takes no parameters. It
// parses the two connection strings that are already in the environment and
// reports four booleans. It cannot break anything: nothing imports it, and it
// runs no query.
//
// Deliberately does NOT return the URL, the host, the user, or the password. A
// hostname is not a secret, but it is also not the answer to anything — the
// answer is yes or no, so that is all it says. `configured` exists to tell
// "false because it is direct" apart from "false because the variable is
// missing", which are very different problems.
function inspect(raw: string | undefined) {
  if (!raw) return { configured: false, pooled: false };
  try {
    // Parsed rather than string-matched, so a password that happens to contain
    // "-pooler" cannot produce a false yes.
    return { configured: true, pooled: new URL(raw).hostname.includes('-pooler') };
  } catch {
    // An unparseable value is a real finding of its own, and is reported as
    // configured-but-not-pooled rather than thrown.
    return { configured: true, pooled: false };
  }
}

export async function GET(req: NextRequest) {
  const { status } = await requireAdmin(req);
  if (status === 'unauthenticated') return err('Unauthorized', 401);
  if (status === 'forbidden') return err('Forbidden', 403);

  const database = inspect(process.env.DATABASE_URL);
  const direct = inspect(process.env.DIRECT_URL);

  return ok({
    // What you want to see: the app pooled, migrations direct.
    databaseUrl: database,
    directUrl: direct,
    healthy: database.configured && database.pooled && direct.configured && !direct.pooled,
    environment: process.env.VERCEL_ENV ?? 'local',
  });
}
