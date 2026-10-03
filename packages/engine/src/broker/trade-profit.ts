import type { Trade } from '../types.ts';

/** Pine's open-trade display includes a projected commission at the current mark.
 * This projection is not another cash charge to the account. */
export function reportedTradeProfit(trade: Trade): number {
  return (
    trade.profit - (trade.exitBar === null ? (trade.displayCommission ?? trade.entryCommission) : 0)
  );
}
