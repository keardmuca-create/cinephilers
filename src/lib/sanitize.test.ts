import { describe, it, expect } from 'vitest';
import { sanitizeText } from './sanitize';

describe('sanitizeText', () => {
  it('leaves plain text untouched', () => {
    expect(sanitizeText('A great film')).toBe('A great film');
  });

  it('strips a simple tag, keeping inner text', () => {
    expect(sanitizeText('hello <b>world</b>')).toBe('hello world');
  });

  it('removes a script tag, leaving its inert text content', () => {
    expect(sanitizeText('<script>alert(1)</script>')).toBe('alert(1)');
  });

  it('strips an img onerror payload entirely', () => {
    expect(sanitizeText('<img src=x onerror=alert(1)>')).toBe('');
  });

  it('removes control characters', () => {
    expect(sanitizeText('a\x07b\x00c')).toBe('abc');
  });

  it('keeps tab (not in the control-char set) but trims edges', () => {
    expect(sanitizeText('  a\tb  ')).toBe('a\tb');
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeText('   spaced   ')).toBe('spaced');
  });

  it('returns empty string for tag-only input', () => {
    expect(sanitizeText('<div></div>')).toBe('');
  });

  it('preserves inner text content of nested tags', () => {
    expect(sanitizeText('<p>Loved <em>Dune</em> a lot</p>')).toBe('Loved Dune a lot');
  });

  it('handles obfuscated tags without leaving an executable element', () => {
    // The stray ">" survives as plain text, but no intact <...> tag remains —
    // which is what matters once the value is rendered as escaped text.
    const out = sanitizeText('<<b>script>alert(1)<</b>/script>');
    expect(out).not.toMatch(/<[^>]+>/);
    expect(out).toContain('alert(1)');
  });
});
