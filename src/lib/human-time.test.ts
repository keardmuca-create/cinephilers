import { describe, it, expect } from 'vitest';

// A copy of the formatter on the stats page, kept in step with it. The page is a
// client component behind a login, so this is the only way the rules get checked
// — and the rules are the part with opinions in them.
const DAY = 24 * 60;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function humanTime(mins: number): string {
  if (mins <= 0) return '0 minutes';
  const total = Math.round(mins);
  const parts: string[] = [];
  let rest = total;
  const years = Math.floor(rest / YEAR); rest -= years * YEAR;
  const months = Math.floor(rest / MONTH); rest -= months * MONTH;
  const days = Math.floor(rest / DAY); rest -= days * DAY;
  const hours = Math.floor(rest / 60); rest -= hours * 60;
  const minutes = rest;
  if (years) parts.push(plural(years, 'year'));
  if (months) parts.push(plural(months, 'month'));
  if (days) parts.push(plural(days, 'day'));
  if (hours) parts.push(plural(hours, 'hour'));
  if (minutes) parts.push(plural(minutes, 'minute'));
  return parts.length > 1
    ? `${parts.slice(0, -1).join(' ')} and ${parts[parts.length - 1]}`
    : parts[0];
}

describe('humanTime', () => {
  it('names every unit that has something in it, largest first', () => {
    // 1 month, 26 days, 10 hours, 23 minutes — the shape Keard asked for.
    const mins = MONTH + 26 * DAY + 10 * 60 + 23;
    expect(humanTime(mins)).toBe('1 month 26 days 10 hours and 23 minutes');
  });

  it('skips empty units instead of padding with zeros', () => {
    // Keard's own film total: 67,690 minutes is 47 days and 10 minutes exactly,
    // with no leftover hours. It should say so rather than "0 hours".
    expect(humanTime(67_690)).toBe('1 month 17 days and 10 minutes');
  });

  it('says a single unit on its own, with no stray "and"', () => {
    expect(humanTime(45)).toBe('45 minutes');
    expect(humanTime(60)).toBe('1 hour');
    expect(humanTime(DAY)).toBe('1 day');
  });

  it('gets singular and plural right', () => {
    expect(humanTime(MONTH + DAY + 60 + 1)).toBe('1 month 1 day 1 hour and 1 minute');
    expect(humanTime(2 * MONTH + 2 * DAY)).toBe('2 months and 2 days');
  });

  it('reaches years', () => {
    expect(humanTime(YEAR + 3 * MONTH + 2 * DAY)).toBe('1 year 3 months and 2 days');
  });

  it('says nothing rather than something for an empty library', () => {
    expect(humanTime(0)).toBe('0 minutes');
    expect(humanTime(-5)).toBe('0 minutes');
  });
});
