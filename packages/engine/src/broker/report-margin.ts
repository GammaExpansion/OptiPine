import type { Trade } from '../types.ts';

/**
 * Average bar-close account margin from the earliest actual entry through the bar
 * before the final supplied bar. Samples align with input bar indexes, including
 * the final snapshot. A complete no-trade history has zero margin; missing
 * observations and an entry only on the final bar stay absent.
 */
export function averageMarginUsed(
  trades: readonly Pick<Trade, 'entryBar'>[],
  margins: readonly number[] | undefined,
  barCount: number,
): number | undefined {
  if (!margins || !Number.isInteger(barCount) || barCount <= 0 || margins.length !== barCount)
    return undefined;
  if (!trades.length) {
    for (const margin of margins) if (margin !== 0) return undefined;
    return 0;
  }
  const end = barCount - 1;
  let firstEntry = end;
  for (const { entryBar } of trades) {
    if (!Number.isInteger(entryBar) || entryBar < 0 || entryBar >= barCount) return undefined;
    firstEntry = Math.min(firstEntry, entryBar);
  }
  if (firstEntry >= end) return undefined;

  let total = 0;
  for (let index = 0; index < barCount; index++) {
    const margin = margins[index];
    if (!Number.isFinite(margin) || margin < 0) return undefined;
    if (index >= firstEntry && index < end) total += margin;
  }
  const average = total / (end - firstEntry);
  return Number.isFinite(average) ? average : undefined;
}
