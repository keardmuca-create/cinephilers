import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getIp } from '@/lib/rate-limit';

// Kept as a plain union rather than imported from the generated client so this
// module can be unit tested without a database, and so the list of things we
// audit reads in one place. It has to stay in step with enum AuditAction in
// prisma/schema.prisma — audit.test.ts fails if the two ever drift apart.
export type AuditAction =
  | 'USER_DELETED'
  | 'USER_SELF_DELETED'
  | 'USER_BANNED'
  | 'USER_UNBANNED'
  | 'USER_ROLE_CHANGED'
  | 'REVIEW_HIDDEN'
  | 'REVIEW_RESTORED'
  | 'COMMENT_DELETED'
  | 'PASSWORD_RESET_COMPLETED'
  | 'LOGIN_LOCKED';

export interface AuditEntry {
  action: AuditAction;
  /** Who did it. Null for events with no signed-in actor (a login lockout). */
  actorId?: string | null;
  actorUsername?: string | null;
  /** What it was done to — a user, review or comment id. */
  targetId?: string | null;
  /** How that target should read once its row is gone: a username, or the typed identifier. */
  targetLabel?: string | null;
  details?: Record<string, unknown> | null;
}

/**
 * Record one audited event.
 *
 * Two rules, and they are the whole design:
 *
 * 1. Call it AFTER the action has succeeded. A row written first would claim a
 *    ban that a failed update never applied.
 * 2. It never throws. A logging failure must not turn a completed ban into a
 *    500 that tells the admin it did not work — the ban DID happen. The failure
 *    goes to the console (and so to Sentry) instead.
 *
 * The cost of rule 2 is a small window: if the process dies between the action
 * and this write, the event is lost. Closing that would mean one transaction per
 * call site, and the account delete cannot join one — it cascades across a dozen
 * tables and then recomputes rating aggregates. One consistent rule everywhere
 * beats a transaction on four call sites out of nine.
 */
export async function writeAudit(entry: AuditEntry, req?: Request | NextRequest): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        actorId: entry.actorId ?? null,
        actorUsername: entry.actorUsername ?? null,
        targetId: entry.targetId ?? null,
        targetLabel: entry.targetLabel ?? null,
        ip: req ? getIp(req) : null,
        // Truncated to the column width rather than rejected: a 3KB user agent
        // is a curiosity, not a reason to lose the record of a deletion.
        userAgent: req ? (req.headers.get('user-agent')?.slice(0, 500) ?? null) : null,
        details: (entry.details ?? undefined) as never,
      },
    });
  } catch (e) {
    console.error('audit write failed:', entry.action, e);
  }
}

/**
 * Has this identifier's lockout already been recorded in the current window?
 *
 * A locked account keeps rejecting attempts for the full lock duration, and an
 * attacker does not politely stop after the first 429 — so the naive version
 * writes a row per guess. This asks whether a LOGIN_LOCKED row already exists
 * for the same identifier inside the lock window, and it only ever runs on a
 * request that is already being refused, so its cost falls on the attacker.
 *
 * Returns false if the check itself fails: a duplicate row is a far smaller
 * problem than losing the record of a lockout.
 */
export async function alreadyLoggedLockout(identifier: string, lockMs: number): Promise<boolean> {
  try {
    const existing = await prisma.auditLog.findFirst({
      where: {
        action: 'LOGIN_LOCKED',
        targetLabel: identifier.toLowerCase().trim(),
        createdAt: { gt: new Date(Date.now() - lockMs) },
      },
      select: { id: true },
    });
    return existing !== null;
  } catch {
    return false;
  }
}
