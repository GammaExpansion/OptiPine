import type { RunResult } from '@pine/engine';
import { metricRows, metricValue } from './metrics.ts';

/**
 * Account profit at a range's last bar, without inventing an exit or its commission. The engine
 * recognizes open entry fees in Net profit and reports the floating price P&L separately.
 * Report metrics stay untouched; optimization does not need an equity curve for this amount.
 */
export function rangeProfit(metrics: RunResult['metrics'], percent = false): number | null {
  const closed = metricValue(metrics, 'Net profit');
  const openCell = metricRows(metrics).find((row) => row.name === 'Open PnL')?.all;
  // Compact selection records and older callers may contain only the already-scored amount.
  const open = openCell ? openCell.value : 0;
  if (closed === null || typeof open !== 'number' || !Number.isFinite(open)) return null;
  const amount = closed + open;
  if (!Number.isFinite(amount)) return null;
  if (!percent) return amount;
  const initial = metricValue(metrics, 'Initial capital');
  // A compact percentage column is already scored. Never add Open %, whose denominator differs.
  if (initial === null && !openCell) return metricValue(metrics, 'Net profit', 'All', true);
  const value = initial !== null && initial > 0 ? (amount / initial) * 100 : NaN;
  return Number.isFinite(value) ? value : null;
}
