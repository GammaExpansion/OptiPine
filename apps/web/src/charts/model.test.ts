import { describe, expect, it } from 'vitest';
import type { MarketBar, PlotLineStyle } from '@pine/engine';
import type { TradeRow } from '../workflows/trades.ts';
import {
  calendarLayout,
  dateAxis,
  dayNumber,
  linePoints,
  lowerBound,
  mapPlots,
  monthlyBuckets,
  plotColor,
  plotPalette,
  pricePrecision,
  tradeMarkers,
  tradeRange,
} from './model.ts';

const bars: MarketBar[] = [1, 2, 3, 4].map((time) => ({
  time,
  open: 10,
  high: 12,
  low: 9,
  close: 11,
  volume: 1,
}));
const trade: TradeRow = {
  number: 1,
  side: 'long',
  entryTime: 1,
  entryPrice: 10,
  exitTime: 3,
  exitPrice: 12,
  open: false,
  quantity: 2,
  pnl: 4,
  pnlPercent: 20,
  cumulativePnl: 4,
  bars: 3,
};

describe('plot projection', () => {
  it('preserves fractional ticks and scientific-notation tick precision', () => {
    expect([1, 0.25, 0.01, 0.125, 1e-8].map(pricePrecision)).toEqual([0, 2, 2, 3, 8]);
  });
  it('keeps declaration colours stable across panes, boolean plots and palette cycles', () => {
    const mapped = mapPlots(bars, [
      { title: 'Basis', overlay: true, values: [10, 11, 12, 13] },
      { title: 'Signal', overlay: true, values: [false, true, null, true] },
      { title: 'RSI', overlay: false, values: [null, 60, 30, 50] },
    ]);
    expect(mapped.map((plot) => [plot.kind, plot.pane, plot.color])).toEqual([
      ['line', 0, '#2bb3a3'],
      ['markers', 0, plotColor(1)],
      ['line', 1, plotColor(2)],
    ]);
    expect(mapped[1].markers.map((marker) => marker.time)).toEqual([2, 4]);
    expect(plotColor(plotPalette.length)).toBe('#2bb3a3');
  });
  it('leaves na, null, nonnumeric and nonfinite gaps without hiding the incoming segment', () => {
    const points = linePoints([1, 2, 3, 4, 5, 6, 7], [2, 3, null, 5, NaN, Infinity, 'na']);
    expect(points).toEqual([
      { time: 1, value: 2 },
      { time: 2, value: 3, color: 'transparent' },
      { time: 3 },
      { time: 4, value: 5, color: 'transparent' },
      { time: 5 },
      { time: 6 },
      { time: 7 },
    ]);
  });
  it('does not invent signal markers for false or unknown values', () => {
    expect(
      mapPlots(bars, [{ title: 'Off', values: [false, false, null, false], overlay: false }])[0]
        .markers,
    ).toEqual([]);
    expect(
      mapPlots(bars, [{ title: 'Unavailable', values: [null, null, null, null] }])[0].points.every(
        (point) => point.value === undefined,
      ),
    ).toBe(true);
  });
  it('uses declared types even for numeric signals or entirely missing values', () => {
    const mapped = mapPlots(bars, [
      {
        title: 'shape',
        values: [0, 2, null, -1],
        style: {
          kind: 'shape',
          style: 'triangleup',
          location: 'belowbar',
          size: 'small',
          text: 'Buy',
          color: '#12345680',
        },
      },
      {
        title: 'char',
        values: [0, 2, null, -1],
        style: { kind: 'char', char: '★', location: 'absolute' },
        colors: ['#111111', null, null, '#222222'],
      },
      {
        title: 'empty',
        values: [null, null, null, null],
        style: { kind: 'shape', style: 'square' },
      },
    ]);
    expect(mapped.map((p) => p.kind)).toEqual(['markers', 'markers', 'markers']);
    expect(mapped[0].markers).toEqual(
      [2, 4].map((time) => ({
        time,
        value: 9,
        location: 'belowbar',
        shape: 'triangleup',
        size: 'small',
        text: 'Buy',
        color: '#12345680',
      })),
    );
    expect(mapped[1].markers.map((m) => [m.value, m.char, m.color])).toEqual([
      [0, '★', '#111111'],
      [2, '★', 'transparent'],
      [-1, '★', '#222222'],
    ]);
    expect(mapped[2].markers).toEqual([]);
  });
  it('uses each numeric series style, width and per-bar colour without losing na gaps', () => {
    const styles: PlotLineStyle[] = [
      'line',
      'linebr',
      'stepline',
      'steplinebr',
      'area',
      'areabr',
      'histogram',
      'columns',
      'circles',
      'cross',
    ];
    const mapped = mapPlots(
      bars,
      styles.map((style) => ({
        title: style,
        values: [1, null, 3, 4],
        style: { kind: 'plot', style, linewidth: 3, color: '#aaaaaa' },
        colors: ['#11111180', null, '#333333', null],
      })),
    );
    expect(mapped.map((p) => p.kind)).toEqual([
      'line',
      'line',
      'line',
      'line',
      'area',
      'area',
      'histogram',
      'columns',
      'circles',
      'cross',
    ]);
    expect(mapped.filter((p) => p.stepped).map((p) => p.title)).toEqual(['stepline', 'steplinebr']);
    expect(mapped.every((p) => p.linewidth === 3)).toBe(true);
    expect(mapped[6].points).toEqual([
      { time: 1, value: 1, color: '#11111180' },
      { time: 2 },
      { time: 3, value: 3, color: '#333333' },
      { time: 4, value: 4, color: 'transparent' },
    ]);
    expect(mapped[0].points[0].color).toBe('transparent');
    expect(mapped[9].markers.map((m) => m.value)).toEqual([1, 3, 4]);
    const [hidden] = mapPlots(bars, [
      { title: 'na', values: [1, 2, 3, 4], style: { kind: 'plot', color: null } },
    ]);
    expect(hidden.points.every((p) => p.color === 'transparent')).toBe(true);
  });
  it('projects a full 100,000-bar result without losing alignment or creating one series per gap', () => {
    const large = Array.from({ length: 100_000 }, (_, time) => ({ ...bars[0], time }));
    const mapped = mapPlots(large, [
      {
        title: 'Gapped',
        overlay: true,
        values: large.map((_, index) => (index % 2 ? null : index)),
      },
    ]);
    expect(mapped).toHaveLength(1);
    expect(mapped[0].points).toHaveLength(100_000);
    expect(mapped[0].points.at(-1)).toEqual({ time: 99_999 });
  });
});

describe('trade markers and focus', () => {
  it('orders fills chronologically, with opposite entry/exit positions for shorts', () => {
    const markers = tradeMarkers([
      { ...trade, number: 2, side: 'short', entryTime: 2, exitTime: 4 },
      trade,
    ]);
    expect(
      markers.map((marker) => [marker.time, marker.position, marker.shape, marker.label.id]),
    ).toEqual([
      [1, 'belowBar', 'arrowUp', 'charts.long'],
      [2, 'aboveBar', 'arrowDown', 'charts.short'],
      [3, 'aboveBar', 'circle', 'charts.exitMarker'],
      [4, 'belowBar', 'circle', 'charts.exitMarker'],
    ]);
  });
  it('keeps open trades open and handles fills sharing a bar', () => {
    const open = { ...trade, open: true, exitTime: null };
    expect(tradeMarkers([open])).toHaveLength(1);
    expect(tradeMarkers([{ ...trade, exitTime: 1 }])).toHaveLength(2);
    expect(tradeRange([1, 2, 3, 4], open)).toEqual({ from: -12, to: 15 });
    expect(tradeRange([1, 2, 3, 4], trade)).toEqual({ from: -12, to: 14 });
  });
  it('finds an insertion point on empty arrays and between sessions', () => {
    expect(lowerBound([], 1)).toBe(0);
    expect(lowerBound([1, 4, 9], 5)).toBe(2);
  });
});

describe('calendar and returns', () => {
  it('starts with a partial Monday-first week and keeps leap day and missing days', () => {
    const layout = calendarLayout([
      { date: '2024-02-28', weekday: 3, pnl: 1, percent: 1 },
      { date: '2024-02-29', weekday: 4, pnl: null, percent: null },
      { date: '2024-03-04', weekday: 1, pnl: -1, percent: -1 },
    ]);
    expect(layout.cells.map((cell) => [cell.column, cell.row])).toEqual([
      [0, 2],
      [0, 3],
      [1, 0],
    ]);
    expect(layout.weeks).toBe(2);
    expect(calendarLayout([]).weeks).toBe(0);
  });
  it('keeps workflow monthly returns intact across years and empty months', () => {
    const buckets = monthlyBuckets([
      { period: '2023-12', pnl: 12, percent: 4 },
      { period: '2024-01', pnl: null, percent: null },
      { period: '2024-02', pnl: -3, percent: -1 },
    ]);
    expect(buckets[0].to).toBe(buckets[1].from);
    expect(buckets[1].percent).toBeNull();
    expect(buckets[2].to - buckets[2].from).toBe(29);
    expect(buckets[2].percent).toBe(-1);
    expect(monthlyBuckets([])).toEqual([]);
  });
  it('projects calendar dates on the trading-bar axis including missing sessions', () => {
    const axis = dateAxis(['2024-03-01', '2024-03-01', '2024-03-04', '2024-03-04']);
    expect(axis(dayNumber('2024-03-01'))).toBe(0);
    expect(axis(dayNumber('2024-03-04'))).toBe(2);
    expect(axis(dayNumber('2024-03-02'))).toBeCloseTo(2 / 3);
    expect(axis(dayNumber('2024-03-05'))).toBe(4);
    expect(dateAxis([])(0)).toBe(0);
  });
});
