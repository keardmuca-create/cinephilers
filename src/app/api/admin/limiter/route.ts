import { NextRequest } from 'next/server';
import { ok, err } from '@/lib/api-response';
import { requireAdmin } from '@/lib/admin-auth';
import { limiterHealth } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// Is production's rate limiting real?
//
// Every limit in the app leans on Upstash: the login lockout, the five-strikes
// account lock, the registration cap, the import cap, and the 240/min ceiling on
// writes. If the credentials are missing the limiter quietly falls back to an
// in-memory counter that a serverless platform throws away between requests, and
// if Redis is unreachable it fails open on purpose. Either way nothing breaks,
// nothing logs, and the front door is simply unlocked.
//
// So the question gets asked of production directly, the same way the pooled
// database endpoint is. Admin-gated, returns three booleans, touches no user
// data, and its probe key is namespaced and expires on its own.
export async function GET(req: NextRequest) {
  const { status } = await requireAdmin(req);
  if (status === 'unauthenticated') return err('Unauthorized', 401);
  if (status === 'forbidden') return err('Forbidden', 403);

  const health = await limiterHealth();

  return ok({
    ...health,
    // All three true is the only state where a flood is actually being counted.
    healthy: health.configured && health.reachable && health.counting,
    environment: process.env.VERCEL_ENV ?? 'local',
  });
}
