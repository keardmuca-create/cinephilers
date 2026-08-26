import { Redis } from '@upstash/redis';

const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

// In-memory fallback for local dev (resets per serverless instance, so Redis is required in production)
interface Entry { count: number; resetAt: number }
const store = new Map<string, Entry>();

export async function rateLimit(key: string, limit: number, windowMs: number): Promise<{ allowed: boolean; retryAfter: number }> {
  if (redis) {
    try {
      const window = Math.floor(Date.now() / windowMs);
      const bucket = `rl:${key}:${window}`;
      const count = await redis.incr(bucket);
      if (count === 1) await redis.expire(bucket, Math.ceil(windowMs / 1000));
      if (count > limit) {
        const resetAt = (window + 1) * windowMs;
        return { allowed: false, retryAfter: Math.ceil((resetAt - Date.now()) / 1000) };
      }
      return { allowed: true, retryAfter: 0 };
    } catch {
      // Redis unreachable — fail open rather than blocking all logins
      return { allowed: true, retryAfter: 0 };
    }
  }

  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }

  if (entry.count >= limit) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }

  entry.count++;
  return { allowed: true, retryAfter: 0 };
}

/**
 * Forget a key's current window.
 *
 * For counters that are meant to track FAILURES: the check itself increments, so
 * a successful attempt has to give its slot back or five ordinary sign-ins in a
 * row would lock someone out of their own account. Called on success, never on
 * failure.
 */
export async function clearRateLimit(key: string, windowMs: number): Promise<void> {
  const window = Math.floor(Date.now() / windowMs);
  if (redis) {
    // Failing to clear must never fail the request that succeeded — the worst
    // case is one wasted slot in a window that expires on its own.
    try { await redis.del(`rl:${key}:${window}`); } catch { /* ignore */ }
    return;
  }
  store.delete(key);
}

/**
 * Is the limiter actually limiting?
 *
 * This file has two silent failure modes and neither raises anything. Without
 * credentials `redis` is null and every limit falls back to the in-memory Map
 * below — which on serverless lives and dies with one instance, so a flood
 * spread across instances is never counted. And when Redis is configured but
 * unreachable, the catch above deliberately fails OPEN, because blocking every
 * login during an outage is worse than not counting for a few minutes.
 *
 * Both are the right behaviours and both are invisible. So this reports them:
 *
 *   configured  the credentials exist at all
 *   reachable   a round trip to Redis came back
 *   counting    two increments of a throwaway key returned 1 then 2, which is
 *               the actual mechanism every limit in the app is built on
 *
 * The probe key is namespaced and expires by itself, so it cannot collide with
 * a real bucket or leave anything behind.
 */
export async function limiterHealth(): Promise<{
  configured: boolean;
  reachable: boolean;
  counting: boolean;
}> {
  if (!redis) return { configured: false, reachable: false, counting: false };
  const key = `rl:health-probe:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  try {
    const first = await redis.incr(key);
    await redis.expire(key, 60);
    const second = await redis.incr(key);
    await redis.del(key).catch(() => { /* it expires on its own anyway */ });
    return { configured: true, reachable: true, counting: first === 1 && second === 2 };
  } catch {
    return { configured: true, reachable: false, counting: false };
  }
}

export function getIp(req: Request): string {
  // Prefer x-real-ip: on Vercel it's a single value set by the platform and
  // can't be spoofed by appending to a client-supplied x-forwarded-for chain.
  return (
    req.headers.get('x-real-ip')?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}
