/** RFC 4180 fields, including embedded newlines and escaped quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = '',
    quoted = false,
    closedQuote = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (!quoted && field !== '') throw new Error('Unexpected quote in CSV field');
      else {
        quoted = !quoted;
        closedQuote = !quoted;
      }
    } else if (!quoted && c === ',') {
      row.push(field);
      field = '';
      closedQuote = false;
    } else if (!quoted && (c === '\n' || c === '\r')) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      closedQuote = false;
    } else {
      if (closedQuote) throw new Error('Unexpected text after quoted CSV field');
      field += c;
    }
  }
  if (quoted) throw new Error('Unterminated quoted CSV field');
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
