/** Reserve the metric columns; searched inputs retain the workflow's axis-first order. */
export function inputColumns(columns: readonly string[], width: number, validated: boolean) {
  const available = Math.max(0, width - (validated ? 390 : 320));
  const widths = columns.map((title) => Math.max(66, Math.min(144, title.length * 7 + 18)));
  let used = 0;
  let count = 0;
  while (count < columns.length) {
    const overflow = count + 1 < columns.length ? 42 : 0;
    if (used + widths[count] + overflow > available) break;
    used += widths[count++];
  }
  return { visible: columns.slice(0, count), hidden: columns.slice(count) };
}
