import { describe, it, expect } from 'vitest';
import { parseCsv, parseCsvRows } from './csv';

describe('parseCsvRows', () => {
  it('reads plain rows', () => {
    expect(parseCsvRows('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('keeps a comma inside a quoted field', () => {
    expect(parseCsvRows('Name,Year\n"Holiday, Part Two",1953'))
      .toEqual([['Name', 'Year'], ['Holiday, Part Two', '1953']]);
  });

  it('turns a doubled quote into one literal quote', () => {
    expect(parseCsvRows('Review\n"He said ""no"" twice"'))
      .toEqual([['Review'], ['He said "no" twice']]);
  });

  // The bug this file exists for. A Letterboxd review containing a paragraph
  // break used to split the row in two — the review was truncated and the
  // remainder was offered to the user as a film to go and find.
  it('keeps a newline inside a quoted field', () => {
    const csv = 'Name,Review\nSpirited Away,"First paragraph.\n\nSecond paragraph."';
    expect(parseCsvRows(csv)).toEqual([
      ['Name', 'Review'],
      ['Spirited Away', 'First paragraph.\n\nSecond paragraph.'],
    ]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsvRows('a,b\r\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('keeps the last row when the file does not end in a newline', () => {
    expect(parseCsvRows('a\n1')).toEqual([['a'], ['1']]);
  });

  it('strips a BOM so the first header name is not corrupted', () => {
    expect(parseCsvRows('\uFEFFName,Year\nParasite,2019')[0]).toEqual(['Name', 'Year']);
  });
});

describe('parseCsv', () => {
  it('keys rows by header', () => {
    expect(parseCsv('Name,Year\nParasite,2019')).toEqual([{ Name: 'Parasite', Year: '2019' }]);
  });

  it('returns nothing when there is only a header', () => {
    expect(parseCsv('Name,Year')).toEqual([]);
  });

  it('drops entirely blank rows', () => {
    expect(parseCsv('Name,Year\nParasite,2019\n,')).toEqual([{ Name: 'Parasite', Year: '2019' }]);
  });

  it('preserves a multi-line review as one field', () => {
    const rows = parseCsv('Name,Review\nSpirited Away,"One.\n\nTwo."\nSe7en,"Short."');
    expect(rows).toHaveLength(2);
    expect(rows[0].Review).toBe('One.\n\nTwo.');
    expect(rows[1].Name).toBe('Se7en');
  });

  it('does not let a multi-line review invent an extra film', () => {
    // The old reader produced a third row here whose Name was "Two."
    const rows = parseCsv('Name,Review\nSpirited Away,"One.\n\nTwo."');
    expect(rows.map(r => r.Name)).toEqual(['Spirited Away']);
  });
});
