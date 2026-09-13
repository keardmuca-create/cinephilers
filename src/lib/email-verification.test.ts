import { describe, it, expect } from 'vitest';
import { VERIFY_REQUIRED_AFTER, isUnverifiedAccount } from './email-verification';

// The admin page splits unverified accounts into their own list. It must use the same
// rule as login, or an account could sit in "Users" while being unable to sign in.
describe('isUnverifiedAccount', () => {
  const after = new Date(VERIFY_REQUIRED_AFTER.getTime() + 86_400_000);
  const before = new Date(VERIFY_REQUIRED_AFTER.getTime() - 86_400_000);

  it('is an account made after the cutoff that never verified', () => {
    expect(isUnverifiedAccount({ isVerified: false, createdAt: after })).toBe(true);
  });

  it('counts the cutoff moment itself as after', () => {
    expect(isUnverifiedAccount({ isVerified: false, createdAt: VERIFY_REQUIRED_AFTER })).toBe(true);
  });

  it('is not a verified account', () => {
    expect(isUnverifiedAccount({ isVerified: true, createdAt: after })).toBe(false);
  });

  it('is not a grandfathered account from before the cutoff', () => {
    expect(isUnverifiedAccount({ isVerified: false, createdAt: before })).toBe(false);
  });
});
