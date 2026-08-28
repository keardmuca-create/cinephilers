import { describe, it, expect } from 'vitest';

// A copy of the formatter on the stats page, kept in step with it. The page is a
// client component behind a login, so this is the only way the rules get checked
// — and the rules are the part with opinions in them.
function humanTime(mins: number): string {
  if (mins <= 0) return '0h';
  const totalHours = Math.floor(mins / 60);
  const days = Math.floor(totalHours / 24);
  if (days > 0) return `${days}d ${totalHours % 24}h`;
  if (totalHours > 0) return `${totalHours}h ${Math.round(mins % 60)}m`;
  return `${Math.round(mins)}m`;
}

describe('humanTime', () => {
  it('shows minutes on their own below an hour', () => {
    // The case that made this worth fixing: one episode must not read "0h".
    expect(humanTime(45)).toBe('45m');
    expect(humanTime(1)).toBe('1m');
  });

  it('shows hours and minutes below a day', () => {
    expect(humanTime(96)).toBe('1h 36m');
    expect(humanTime(60)).toBe('1h 0m');
  });

  it('drops minutes once it is measured in days', () => {
    // At this scale the minutes digit comes from averaged episode lengths, so
    // showing it would be inventing precision.
    expect(humanTime(1440)).toBe('1d 0h');
    expect(humanTime(67_680)).toBe('47d 0h');
    expect(humanTime(63_240)).toBe('43d 22h');
  });

  it('says nothing rather than something for an empty library', () => {
    expect(humanTime(0)).toBe('0h');
    expect(humanTime(-5)).toBe('0h');
  });
});
