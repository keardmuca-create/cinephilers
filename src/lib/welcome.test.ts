import { describe, it, expect } from 'vitest';
import { needsFounderWelcome, WELCOME_LIVE_AFTER } from './welcome';

const after = new Date(WELCOME_LIVE_AFTER.getTime() + 86_400_000).toISOString();
const before = new Date(WELCOME_LIVE_AFTER.getTime() - 86_400_000).toISOString();

describe('needsFounderWelcome', () => {
  it('welcomes a new account that has never seen it', () => {
    expect(needsFounderWelcome({ createdAt: after, welcomedAt: null })).toBe(true);
  });

  it('never welcomes the same account twice', () => {
    expect(needsFounderWelcome({ createdAt: after, welcomedAt: after })).toBe(false);
  });

  // The reason the cutoff exists: an account from before this shipped has had the
  // Founder chip on its profile for weeks, and "you're now part of the community"
  // aimed at a months-old member reads as a bug.
  it('skips accounts that existed before the welcome shipped', () => {
    expect(needsFounderWelcome({ createdAt: before, welcomedAt: null })).toBe(false);
  });

  it('says no when there is no user, or no join date to show', () => {
    expect(needsFounderWelcome(null)).toBe(false);
    expect(needsFounderWelcome(undefined)).toBe(false);
    expect(needsFounderWelcome({ welcomedAt: null })).toBe(false);
  });

  it('accepts Date objects as well as ISO strings', () => {
    expect(needsFounderWelcome({ createdAt: new Date(after), welcomedAt: null })).toBe(true);
    expect(needsFounderWelcome({ createdAt: new Date(after), welcomedAt: new Date() })).toBe(false);
  });
});
