import assert from 'node:assert/strict';
import test from 'node:test';
import { runWithEquity } from '@pine/engine';
import { tradeReturn } from '@pine/engine/reporting';
import { filterTrades, tradeCsvColumns, tradeRows, tradesCsv, type TradeRow } from './trades.ts';
import { strategySource, syntheticBars } from './test-support.ts';

const bars = syntheticBars(300);
const result = runWithEquity(strategySource, {
  bars,
  syminfo: { mintick: 0.01, mincontract: 0.001, timezone: 'Etc/UTC' },
  timeframe: '60',
});
const context = { pointvalue: 1, lastBarIndex: bars.length - 1, lastClose: bars.at(-1)!.close };
const rows = tradeRows(result.trades, context);

test('trades are listed newest first, the open one marked at the last close (B2)', () => {
  assert.equal(rows.length, result.trades.length);
  assert.deepEqual(
    rows.map((row) => row.number),
    result.trades.map((_, index) => result.trades.length - index),
  );
  const [open, latestClosed] = rows;
  const openTrade = result.trades.at(-1)!;
  assert.equal(openTrade.exitBar, null);
  assert.equal(open.open, true);
  assert.equal(open.exitTime, null);
  assert.equal(open.exitPrice, context.lastClose);
  assert.equal(open.cumulativePnl, null);
  assert.equal(open.bars, context.lastBarIndex - openTrade.entryBar + 1);
  // TradingView shows an open trade net of the commission its exit would cost.
  assert.equal(open.pnl, openTrade.profit - openTrade.displayCommission!);
  assert.equal(open.pnlPercent, tradeReturn({ ...openTrade, profit: open.pnl }, 1));

  const closed = result.trades.filter((trade) => trade.exitBar !== null);
  const total = closed.reduce((sum, trade) => sum + trade.profit, 0);
  assert.equal(latestClosed.open, false);
  assert.ok(Math.abs(latestClosed.cumulativePnl! - total) < 1e-9);
  assert.equal(latestClosed.pnl, closed.at(-1)!.profit);
  assert.equal(latestClosed.pnlPercent, tradeReturn(closed.at(-1)!, 1));
  assert.equal(latestClosed.exitPrice, closed.at(-1)!.exitPrice);
  const closedRows = rows.filter((row) => !row.open);
  const averageBars = closedRows.reduce((sum, row) => sum + row.bars, 0) / closedRows.length;
  assert.equal(averageBars, result.metrics['Trades analysis/Average bars in trades/All USD']);
});

test('the side and P&L filters keep the counts the tab states', () => {
  const everything = filterTrades(rows, { side: 'all', pnl: 'all' });
  assert.equal(everything.rows.length, rows.length);
  assert.equal(everything.openCount, 1);
  assert.equal(everything.closedCount, rows.length - 1);
  const longs = filterTrades(rows, { side: 'long', pnl: 'all' });
  assert.ok(longs.rows.length > 0 && longs.rows.every((row) => row.side === 'long'));
  const losing = filterTrades(rows, { side: 'all', pnl: 'loss' });
  assert.ok(losing.rows.every((row) => row.pnl < 0));
  const profitable = filterTrades(rows, { side: 'all', pnl: 'profit' });
  assert.ok(profitable.rows.every((row) => row.pnl > 0));
  assert.equal(
    profitable.rows.length + losing.rows.length,
    rows.filter((row) => row.pnl !== 0).length,
  );
  const shortLosers = filterTrades(rows, { side: 'short', pnl: 'loss' });
  assert.deepEqual(
    shortLosers.rows,
    rows.filter((row) => row.side === 'short' && row.pnl < 0),
  );
});

test('CSV export uses the caller headers, UTC times and plain numbers', () => {
  const sample: TradeRow[] = [
    {
      number: 2,
      side: 'long',
      entryTime: Date.UTC(2025, 4, 4, 12) / 1000,
      entryPrice: 96337.19,
      exitTime: null,
      exitPrice: 96050,
      open: true,
      quantity: 1.2278,
      pnl: -352.6000000000001,
      pnlPercent: -0.3,
      cumulativePnl: null,
      bars: 11,
    },
    {
      number: 1,
      side: 'short',
      entryTime: Date.UTC(2025, 4, 3, 11) / 1000,
      entryPrice: 97002.63,
      exitTime: Date.UTC(2025, 4, 4, 12) / 1000,
      exitPrice: 96337.19,
      open: false,
      quantity: 1.2278,
      pnl: 579.62,
      pnlPercent: 0.49,
      cumulativePnl: 18420.35,
      bars: 25,
    },
  ];
  const header = Object.fromEntries(tradeCsvColumns.map((column) => [column, column])) as Record<
    (typeof tradeCsvColumns)[number],
    string
  >;
  header.number = '#';
  header.pnl = 'P&L, "net"';
  const csv = tradesCsv(sample, header, { long: 'Long', short: 'Short' });
  assert.equal(
    csv,
    [
      '#,side,entryTime,entryPrice,exitTime,exitPrice,quantity,"P&L, ""net""",pnlPercent,cumulativePnl,bars',
      '2,Long,2025-05-04 12:00,96337.19,,96050,1.2278,-352.6,-0.3,,11',
      '1,Short,2025-05-03 11:00,97002.63,2025-05-04 12:00,96337.19,1.2278,579.62,0.49,18420.35,25',
      '',
    ].join('\r\n'),
  );
});
