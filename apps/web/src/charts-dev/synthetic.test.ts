// @vitest-environment node
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runWithEquity } from '@pine/engine';
import { syntheticBars } from './synthetic.ts';
import { examples } from '../../examples/index.ts';
import { mapPlots } from '../charts/model.ts';

it('produces deterministic, ordered OHLCV bars', () => {
  const bars = syntheticBars(100);
  expect(bars).toEqual(syntheticBars(100));
  expect(
    bars.every(
      (bar) =>
        bar.high >= Math.max(bar.open, bar.close) &&
        bar.low <= Math.min(bar.open, bar.close) &&
        bar.volume > 0,
    ),
  ).toBe(true);
  expect(bars[1].time - bars[0].time).toBe(3600);
  expect(bars.at(-1)!.time).toBe(Date.UTC(2025, 4, 4, 23) / 1000);
});

it.each(examples.filter((example) => example.id !== 'ma-cross'))(
  '$title exercises its shared source and plot placement on synthetic bars',
  (example) => {
    const source = readFileSync(
      new URL(`../../examples/${example.fileName}`, import.meta.url),
      'utf8',
    );
    const bars = syntheticBars(1000);
    const result = runWithEquity(source, {
      bars,
      syminfo: { timezone: 'Etc/UTC', mincontract: 0.001 },
      timeframe: '60',
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.equity).toHaveLength(bars.length);
    expect(new Set(result.trades.map((trade) => trade.direction))).toEqual(
      new Set(example.id === 'trend-breakout' ? ['long', 'short'] : ['long']),
    );
    const plots = mapPlots(bars, result.plots);
    if (example.id === 'rsi-reversal') {
      expect(plots.map(({ title, kind, pane }) => ({ title, kind, pane }))).toEqual([
        { title: 'RSI', kind: 'line', pane: 1 },
        { title: 'Oversold', kind: 'line', pane: 1 },
        { title: 'Exit level', kind: 'line', pane: 1 },
        { title: 'Buy', kind: 'markers', pane: 0 },
        { title: 'Sell', kind: 'markers', pane: 0 },
      ]);
      for (const plot of plots.filter((plot) => plot.kind === 'markers'))
        expect(plot.markers.length).toBeGreaterThan(0);
    } else {
      expect(plots.map((plot) => plot.title)).toEqual(['Basis', 'Upper', 'Lower']);
      expect(plots.every((plot) => plot.kind === 'line' && plot.pane === 0)).toBe(true);
    }
  },
);
