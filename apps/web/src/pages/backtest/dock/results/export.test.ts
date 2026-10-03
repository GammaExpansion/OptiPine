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
test('report export translates section and column headers but keeps metric names English', () => {
  const report = strategyReport({ 'Performance/Net profit/All USD': 123.45 });
  const en = reportExport(report, 'en');
  const zh = reportExport(report, 'zh');
  expect(en).toContain('Key figures,,,\r\nMetric,All,Long,Short\r\nNet profit,123.45,,');
  expect(zh).toContain('关键指标,,,\r\n指标,全部,多头,空头\r\nNet profit,123.45,,');
  for (const section of ['Returns', 'Trades', 'Risk']) expect(en).toContain(`${section},,,\r\n`);
  for (const section of ['收益', '交易', '风险']) expect(zh).toContain(`${section},,,\r\n`);
  expect(zh).toContain('Average profit / average loss,,,');
});
test('the workflow exports translated headers and sides, including an open trade', () => {
  const en = tradeExport([trade], 'en').split('\r\n');
  expect(en[0]).toBe(
    '#,Side,Entry UTC,Entry price,Exit UTC,Exit price,Qty,P&L,P&L %,Cumulative,Bars',
  );
  expect(en[1]).toBe('1,Long,2024-01-01 00:00,100,,110,2,20,10,,3');
  const zh = tradeExport([trade], 'zh').split('\r\n');
  expect(zh[0]).toBe('#,方向,入场 UTC,入场价,出场 UTC,出场价,数量,盈亏,盈亏 %,累计,持仓');
  expect(zh[1]).toContain('1,多,2024-01-01 00:00');
  expect(tradeExport([], 'en').trim()).toBe(en[0]);
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
  downloadCsv(tradeExport([trade], 'zh'), 'trades.csv');
  expect(click).toHaveBeenCalledOnce();
  expect(create.mock.calls[0][0]).toMatchObject({ type: 'text/csv;charset=utf-8' });
  expect(document.querySelector('a[download]')).toBeNull();
  await vi.runAllTimersAsync();
  expect(revoke).toHaveBeenCalledWith('blob:trades');
});
