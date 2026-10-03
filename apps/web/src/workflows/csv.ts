/** One CSV field, quoted when it holds a quote, comma or line break. */
export function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** CSV text with CRLF line ends, as spreadsheet applications expect. */
export function csvText(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(csvField).join(',')).join('\r\n') + '\r\n';
}

/** Twelve significant digits drop binary noise such as 579.6200000000001. */
export function csvNumber(value: number): string {
  return String(Number(value.toPrecision(12)));
}
