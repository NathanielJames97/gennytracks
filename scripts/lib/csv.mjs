// Minimal RFC 4180 CSV reader.
//
// The House of Commons Library results files are quoted CSV with embedded
// commas and CRLF line endings, so a naive split on "," corrupts them. This
// handles quoting, escaped quotes (""), and both line ending styles.

export function parseCsv(text) {
  // Strip a UTF-8 BOM, which the by-candidate file starts with.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let i = 0;

  while (i < text.length) {
    const c = text[i];

    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i += 1; continue;
      }
      field += c; i += 1; continue;
    }

    if (c === '"') { quoted = true; i += 1; continue; }
    if (c === ',') { row.push(field); field = ''; i += 1; continue; }
    if (c === '\r') { i += 1; continue; }
    if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = []; field = ''; i += 1; continue;
    }
    field += c; i += 1;
  }

  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/**
 * Parse CSV into objects keyed by column name.
 * @returns {{ header: string[], rows: Record<string,string>[] }}
 */
export function csvToObjects(text) {
  const table = parseCsv(text);
  if (!table.length) return { header: [], rows: [] };
  const header = table[0];
  return {
    header,
    rows: table.slice(1)
      .filter((r) => r.length > 1 || (r[0] ?? '').trim() !== '')
      .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? '']))),
  };
}

/** Coerce to a finite number, or null for blanks and junk. */
export function toNumber(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
