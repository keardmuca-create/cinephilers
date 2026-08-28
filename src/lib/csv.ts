// A CSV reader that understands quoted fields, including the newlines inside them.
//
// The previous one split the file into lines first and only then worried about
// quotes. That works until a field legitimately contains a line break — which is
// exactly what Letterboxd writes whenever somebody pressed Enter while writing a
// review. The row split in two: the review was stored truncated at the break, and
// the remainder came back as a film title in "couldn't be matched".
//
// So this walks the whole text once, character by character, and only treats a
// newline as the end of a row when it is not inside quotes. That is the actual
// rule in RFC 4180, and the only way a review with a paragraph in it survives.

/** Split raw CSV text into rows of fields. Quoted newlines stay inside their field. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let sawAny = false;

  // Strip a UTF-8 BOM: Letterboxd does not write one, but Excel does if the file
  // has been opened and re-saved, and it would otherwise become part of the first
  // header name — silently breaking every lookup of that column.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const endField = () => { row.push(field); field = ''; sawAny = true; };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        // A doubled quote inside a quoted field is one literal quote.
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ',') { endField(); continue; }
    if (ch === '\r') { continue; }        // CRLF — the \n does the work
    if (ch === '\n') { endRow(); continue; }
    field += ch;
  }

  // A file not ending in a newline still has one last row in hand.
  if (field.length > 0 || row.length > 0 || !sawAny) endRow();

  return rows;
}

/**
 * Rows keyed by the header line, trimmed, with blank rows dropped.
 * Returns [] when there is no data beyond the header.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows = parseCsvRows(text.trim());
  if (rows.length < 2) return [];

  const headers = rows[0].map(h => h.trim());
  return rows
    .slice(1)
    .map(values => {
      const row: Record<string, string> = {};
      // Field values are trimmed, but only at the ends — a newline in the MIDDLE
      // of a review is content and has to survive.
      headers.forEach((h, i) => { row[h] = (values[i] ?? '').trim(); });
      return row;
    })
    .filter(row => Object.values(row).some(v => v));
}
