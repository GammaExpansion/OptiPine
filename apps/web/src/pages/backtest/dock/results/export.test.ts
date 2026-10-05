import { afterEach, expect, test, vi } from 'vitest';
import type { TradeRow } from '../../../../workflows/trades.ts';
import { strategyReport } from '../../../../workflows/report.ts';
import { downloadCsv, reportExport, tradeExport } from './export.ts';

const trade: TradeRow = {
  number: 1,
  side: 'long',
  entryTime: 1704067200,
  entryPrice: 100,
  exitTime: null,
  exitPrice: 110,
  open: true,
  quantity: 2,
  pnl: 20,
  pnlPercent: 10,
  cumulativePnl: null,
  bars: 3,
};
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
test('report export has stable English section, column and metric names', () => {
  const report = strategyReport({ 'Performance/Net profit/All USD': 123.45 });
  const csv = reportExport(report);
  expect(csv).toContain('Key figures,,,\r\nMetric,All,Long,Short\r\nNet profit,123.45,,');
  for (const section of ['Returns', 'Trades', 'Risk']) expect(csv).toContain(`${section},,,\r\n`);
  expect(csv).toContain('Average profit / average loss,,,');
});
test('trade export has stable English headers and sides, including an open trade', () => {
  const csv = tradeExport([trade, { ...trade, number: 2, side: 'short' }]).split('\r\n');
  expect(csv[0]).toBe(
    '#,Side,Entry UTC,Entry price,Exit UTC,Exit price,Qty,P&L,P&L %,Cumulative,Bars',
  );
  expect(csv[1]).toBe('1,Long,2024-01-01 00:00,100,,110,2,20,10,,3');
  expect(csv[2]).toBe('2,Short,2024-01-01 00:00,100,,110,2,20,10,,3');
  expect(tradeExport([]).trim()).toBe(csv[0]);
});
test('download uses UTF-8 CSV and releases its temporary resources', async () => {
  vi.useFakeTimers();
  const create = vi.fn((_blob: Blob) => 'blob:trades');
  const revoke = vi.fn();
  vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    expect(this.download).toBe('trades.csv');
    expect(this.href).toBe('blob:trades');
    expect(this.isConnected).toBe(true);
  });
  downloadCsv(tradeExport([trade]), 'trades.csv');
  expect(click).toHaveBeenCalledOnce();
  expect(create.mock.calls[0][0]).toMatchObject({ type: 'text/csv;charset=utf-8' });
  expect(document.querySelector('a[download]')).toBeNull();
  await vi.runAllTimersAsync();
  expect(revoke).toHaveBeenCalledWith('blob:trades');
});
