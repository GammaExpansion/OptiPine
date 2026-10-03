import type { RunResult } from '@pine/engine';

export interface TradeStatistics {
  maxConsecutiveLosses: number | null;
}
export const consecutiveLossesMetric = 'web/max-consecutive-losses';

/** Called while a worker still has the engine's trades, before dropping them. */
export function tradeStatistics(result: RunResult): TradeStatistics {
  if (result.diagnostics.length) return { maxConsecutiveLosses: null };
  let maximum = 0,
    streak = 0;
  const closed = result.trades
    .filter((trade) => trade.exitTime !== null)
    .map((trade, index) => ({ trade, index }))
    .sort((a, b) => a.trade.exitTime! - b.trade.exitTime! || a.index - b.index);
  for (const { trade } of closed) {
    if (typeof trade.profit !== 'number' || !Number.isFinite(trade.profit))
      return { maxConsecutiveLosses: null };
    streak = trade.profit < 0 ? streak + 1 : 0;
    maximum = Math.max(maximum, streak);
  }
  return { maxConsecutiveLosses: maximum };
}
