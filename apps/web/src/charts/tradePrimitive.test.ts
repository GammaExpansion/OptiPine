import { expect, it, vi } from 'vitest';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import type { TradeRow } from '../workflows/trades.ts';
import { tradePrimitive } from './tradePrimitive.ts';

it('culls offscreen trades but retains a long overlapping trade, and redraws on selection', () => {
  const chart = {
    timeScale: () => ({
      getVisibleRange: () => ({ from: 50, to: 60 }),
      timeToCoordinate: (time: number) => time - 50,
    }),
  } as unknown as IChartApi;
  const series = { priceToCoordinate: (value: number) => value } as ISeriesApi<'Candlestick'>;
  const overlay = tradePrimitive(
    chart,
    series,
    { profit: 'green', loss: 'red', primary: 'gold' },
    String,
  );
  const requestUpdate = vi.fn();
  overlay.primitive.attached!({ requestUpdate, chart, series } as never);
  const trades = Array.from({ length: 100 }, (_, index): TradeRow => ({
    number: index + 1,
    side: 'long',
    entryTime: index,
    exitTime: index + 1,
    entryPrice: 10,
    exitPrice: 11,
    quantity: 1,
    open: false,
    pnl: 1,
    pnlPercent: 10,
    cumulativePnl: index + 1,
    bars: 2,
  }));
  trades[0] = { ...trades[0], exitTime: 65 };
  overlay.setData(trades, 101);
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    setLineDash: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fillText: vi.fn(),
  };
  const draw = () =>
    overlay.primitive.paneViews!()[0]
      .renderer()!
      .draw({
        useMediaCoordinateSpace: (callback: (scope: unknown) => void) =>
          callback({ context, mediaSize: { width: 100, height: 100 } }),
      } as never);
  overlay.select(trades[0]);
  draw();
  expect(context.moveTo).toHaveBeenCalledWith(-50, 10);
  expect(context.moveTo.mock.calls.every(([x]) => x <= 10)).toBe(true);
  expect(context.arc).toHaveBeenCalledTimes(2);
  expect(context.fillRect).toHaveBeenCalledWith(-50, 0, 65, 100);
  expect(requestUpdate).toHaveBeenCalledTimes(2);
  overlay.select(null);
  context.fillRect.mockClear();
  draw();
  expect(context.fillRect).not.toHaveBeenCalled();
  overlay.primitive.detached!();
  overlay.select(trades[1]);
  expect(requestUpdate).toHaveBeenCalledTimes(3);
});
