import type { MarketBar } from '@pine/engine';

/** Bound preview geometry independently of the number of imported bars. */
export function previewPoints(bars: readonly MarketBar[], width = 400, height = 100): string {
  if (!bars.length) return '';
  const count = Math.min(220, bars.length);
  const values = Array.from(
    { length: count },
    (_, i) => bars[Math.round((i * (bars.length - 1)) / Math.max(1, count - 1))].close,
  );
  const low = Math.min(...values),
    high = Math.max(...values);
  return values
    .map(
      (value, index) =>
        `${((index * width) / Math.max(1, count - 1)).toFixed(2)},${(height - 4 - ((value - low) / (high - low || 1)) * (height - 8)).toFixed(2)}`,
    )
    .join(' ');
}
