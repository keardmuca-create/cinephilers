import type { Prisma } from '@/generated/prisma/client';

// Email verification is only enforced for accounts created on or after this date.
// Everyone who signed up before it is grandfathered in (verification was never
// required, so most existing users have isVerified=false), and we don't flip
// their flag because isVerified also drives the public ✓ badge.
export const VERIFY_REQUIRED_AFTER = new Date('2026-06-29T00:00:00.000Z');

/**
 * An account that can't sign in until its email is verified: made on or after the
 * cutoff and never verified. Login and the admin page's Unverified list both use this
 * rule, so an account is never listed under Users while being unable to log in.
 */
export function isUnverifiedAccount(u: { isVerified: boolean; createdAt: Date }): boolean {
  return !u.isVerified && u.createdAt >= VERIFY_REQUIRED_AFTER;
}

/** The same rule as a database filter: the accounts isUnverifiedAccount is true for. */
export function unverifiedWhere(): Prisma.UserWhereInput {
  return { isVerified: false, createdAt: { gte: VERIFY_REQUIRED_AFTER } };
}

/** Everyone else: verified, or made before the cutoff and grandfathered. */
export function verifiedOrGrandfatheredWhere(): Prisma.UserWhereInput {
  return { OR: [{ isVerified: true }, { createdAt: { lt: VERIFY_REQUIRED_AFTER } }] };
}
