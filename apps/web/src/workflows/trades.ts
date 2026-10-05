import type { Trade } from '@pine/engine';
import { tradeReturn } from '@pine/engine/reporting';
import { reportedTradeProfit } from '@pine/engine/trade-profit';
import { csvNumber, csvText } from './csv.ts';

/** One row of the Trades tab (B2). */
export interface TradeRow {
  /** 1-based, in the engine's order: closed trades as they closed, then open ones. */
  readonly number: number;
  readonly side: Trade['direction'];
  readonly entryTime: number;
  readonly entryPrice: number;
  /** Null while the trade is open. */
  readonly exitTime: number | null;
  /** The exit price, or for an open trade the last close it is marked at. */
  readonly exitPrice: number;
  readonly open: boolean;
  readonly quantity: number;
  /** The profit TradingView shows: an open trade's includes its projected exit commission. */
  readonly pnl: number;
  /** `pnl` over the entry value plus entry commission, as the report's trade returns. */
  readonly pnlPercent: number;
  /** Running total of closed trades' profit; null for an open trade. */
  readonly cumulativePnl: number | null;
  /** Bars from entry to exit, both included, as the report's "Average bars in trades" counts. */
  readonly bars: number;
}

export interface TradeContext {
  readonly pointvalue: number;
  /** The last bar, where open trades are marked. */
  readonly lastBarIndex: number;
  readonly lastClose: number;
}

/** Every trade, newest first. */
export function tradeRows(trades: readonly Trade[], context: TradeContext): TradeRow[] {
  let cumulative = 0;
  const rows = trades.map((trade, index): TradeRow => {
    const open = trade.exitBar === null;
    const pnl = reportedTradeProfit(trade);
    if (!open) cumulative += pnl;
    return {
      number: index + 1,
      side: trade.direction,
      entryTime: trade.entryTime,
      entryPrice: trade.entryPrice,
      exitTime: open ? null : trade.exitTime,
      exitPrice: open ? context.lastClose : trade.exitPrice!,
      open,
      quantity: trade.quantity,
      pnl,
      pnlPercent: tradeReturn({ ...trade, profit: pnl }, context.pointvalue),
      cumulativePnl: open ? null : cumulative,
      bars: (open ? context.lastBarIndex : trade.exitBar!) - trade.entryBar + 1,
    };
  });
  return rows.reverse();
}

export type SideFilter = 'all' | 'long' | 'short';
/** The P&L chip: every trade, only profitable ones, or only losing ones. */
export type PnlFilter = 'all' | 'profit' | 'loss';

export interface TradeFilter {
  readonly side: SideFilter;
  readonly pnl: PnlFilter;
}

export interface TradeList {
  readonly rows: readonly TradeRow[];
  /** The counts the tab states, such as "143 closed, 1 open", after filtering. */
  readonly closedCount: number;
  readonly openCount: number;
}

export function filterTrades(rows: readonly TradeRow[], filter: TradeFilter): TradeList {
  const kept = rows.filter(
    (row) =>
      (filter.side === 'all' || row.side === filter.side) &&
      (filter.pnl === 'all' || (filter.pnl === 'profit' ? row.pnl > 0 : row.pnl < 0)),
  );
  const openCount = kept.filter((row) => row.open).length;
  return { rows: kept, closedCount: kept.length - openCount, openCount };
}

/** The export's columns, in order; the caller supplies each one's stable English header. */
export const tradeCsvColumns = [
  'number',
  'side',
  'entryTime',
  'entryPrice',
  'exitTime',
  'exitPrice',
  'quantity',
  'pnl',
  'pnlPercent',
  'cumulativePnl',
  'bars',
] as const;
export type TradeCsvColumn = (typeof tradeCsvColumns)[number];

const utc = (time: number) => new Date(time * 1000).toISOString().slice(0, 16).replace('T', ' ');

/**
 * CSV text of `rows` in the order given, times in UTC as `YYYY-MM-DD HH:MM`. An open trade has
 * no exit time or cumulative P&L, and its exit price is the mark, as in the table.
 */
export function tradesCsv(
  rows: readonly TradeRow[],
  header: Readonly<Record<TradeCsvColumn, string>>,
  sides: Readonly<Record<Trade['direction'], string>>,
): string {
  const lines = [tradeCsvColumns.map((column) => header[column])];
  for (const row of rows) {
    const cells: Record<TradeCsvColumn, string> = {
      number: String(row.number),
      side: sides[row.side],
      entryTime: utc(row.entryTime),
      entryPrice: csvNumber(row.entryPrice),
      exitTime: row.exitTime === null ? '' : utc(row.exitTime),
      exitPrice: csvNumber(row.exitPrice),
      quantity: csvNumber(row.quantity),
      pnl: csvNumber(row.pnl),
      pnlPercent: csvNumber(row.pnlPercent),
      cumulativePnl: row.cumulativePnl === null ? '' : csvNumber(row.cumulativePnl),
      bars: String(row.bars),
    };
    lines.push(tradeCsvColumns.map((column) => cells[column]));
  }
  return csvText(lines);
}
