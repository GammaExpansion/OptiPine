import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { describe, run } from '@pine/engine';
import type { MarketBar, RunInput, RunResult } from '@pine/engine';
import { examples } from './index.ts';
import type { ExampleId } from './index.ts';

/** Fixed seed and UTC range keep the full two-year exercise offline and reproducible. */
function syntheticBars(): MarketBar[] {
  let seed = 0x50494e45;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const from = Date.UTC(2023, 0, 1) / 1000;
  const to = Date.UTC(2025, 0, 1) / 1000;
  const bars: MarketBar[] = [];
  let close = 30_000;
  for (let time = from; time < to; time += 3600) {
    const open = close;
    close = open * Math.exp((random() - 0.5) * 0.025);
    const wick = 0.001 + random() * 0.004;
    bars.push({
      time,
      open,
      high: Math.max(open, close) * (1 + wick),
      low: Math.min(open, close) * (1 - wick),
      close,
      volume: 100 + random() * 1000,
    });
  }
  return bars;
}

const input: RunInput = {
  bars: syntheticBars(),
  timeframe: '60',
  syminfo: {
    ticker: 'BTCUSDT',
    tickerid: 'BINANCE:BTCUSDT',
    type: 'crypto',
    currency: 'USDT',
    mintick: 0.01,
    mincontract: 0.00001,
    pointvalue: 1,
    timezone: 'Etc/UTC',
    session_hours: '0000-0000:1234567',
  },
};

const expectedPlots: Record<ExampleId, Record<string, boolean>> = {
  'trend-breakout': { Basis: true, Upper: true, Lower: true },
  'rsi-reversal': { RSI: false, Oversold: false, 'Exit level': false, Buy: true, Sell: true },
  'ma-cross': { 'Fast MA': true, 'Slow MA': true },
};

function assertRun(result: RunResult, id: ExampleId): void {
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.warnings, []);
  assert.ok(
    result.trades.some((trade) => trade.exitBar !== null),
    'must close trades',
  );
  assert.ok(result.trades.every((trade) => Number.isFinite(trade.profit)));
  assert.ok(
    result.trades.some((trade) => trade.commission > 0),
    'fees must be charged',
  );
  assert.deepEqual(
    Object.fromEntries(result.plots.map((plot) => [plot.title, plot.overlay])),
    expectedPlots[id],
  );
  for (const plot of result.plots) {
    assert.equal(plot.values.length, input.bars.length, plot.title);
    if (plot.title === 'Buy' || plot.title === 'Sell') {
      assert.ok(plot.values.includes(true), `${plot.title} must mark a signal`);
      assert.ok(plot.values.includes(false), `${plot.title} must not mark every bar`);
    } else {
      assert.ok(
        plot.values.some((value) => typeof value === 'number' && Number.isFinite(value)),
        `${plot.title} must contain values`,
      );
    }
  }
}

test('the example catalog has stable, unique ids, file names, titles and spot requests', () => {
  assert.deepEqual(
    examples.map(({ id, fileName, title }) => [id, fileName, title]),
    [
      ['trend-breakout', 'trend-breakout.pine', 'Trend Breakout'],
      ['rsi-reversal', 'rsi-reversal.pine', 'RSI Reversal'],
      ['ma-cross', 'ma-cross.pine', 'MA Cross'],
    ],
  );
  for (const example of examples) {
    assert.deepEqual(example.dataRequest, { feed: 'binance', symbol: 'BTCUSDT', timeframe: '60' });
  }
});

for (const example of examples) {
  const source = readFileSync(new URL(example.fileName, import.meta.url), 'utf8');

  test(`${example.title} declares its catalog inputs and explicit spot commission`, () => {
    assert.match(source, /SPDX-License-Identifier: MIT/);
    const description = describe(source);
    assert.equal(description.success, true);
    assert.deepEqual(description.diagnostics, []);
    assert.equal(description.version, 6);
    assert.equal(description.title, example.title);
    assert.deepEqual(
      description.inputs.map(({ title, type, defaultValue }) => ({ title, type, defaultValue })),
      example.inputs,
    );
    assert.ok(description.inputs.length >= 3 && description.inputs.length <= 6);
    assert.ok(description.inputs.every((item) => !item.fixed));
    for (const item of description.inputs) {
      if (item.type === 'int' || item.type === 'float') {
        assert.equal(typeof item.defaultValue, 'number');
        assert.ok(item.min !== undefined && item.min <= Number(item.defaultValue));
        assert.ok(item.max !== undefined && item.max >= Number(item.defaultValue));
        const margin = (item.max! - item.min!) * 0.1;
        assert.ok(Number(item.defaultValue) - item.min! > margin, `${item.title}: lower margin`);
        assert.ok(item.max! - Number(item.defaultValue) > margin, `${item.title}: upper margin`);
        assert.ok((item.step ?? 1) > 0);
      }
      if (item.type === 'source' || item.type === 'string') {
        assert.ok(item.options?.includes(item.defaultValue!));
      }
    }
    assert.equal(description.settings.initial_capital, 100_000);
    assert.equal(description.settings.default_qty_type, 'strategy.percent_of_equity');
    assert.equal(description.settings.default_qty_value, example.id === 'trend-breakout' ? 50 : 95);
    assert.equal(description.settings.commission_type, 'strategy.commission.percent');
    assert.equal(description.settings.commission_value, 0.1);
  });

  test(`${example.title} trades and plots on the intended panes over two synthetic years`, () => {
    const result = run(source, input);
    assertRun(result, example.id);
    if (example.id !== 'trend-breakout') {
      assert.ok(result.trades.every((trade) => trade.direction === 'long'));
    } else {
      assert.ok(result.trades.some((trade) => trade.direction === 'long'));
      assert.ok(result.trades.some((trade) => trade.direction === 'short'));
    }
    if (example.id === 'rsi-reversal') {
      const rsi = result.plots.find((plot) => plot.title === 'RSI')!;
      assert.ok(
        rsi.values.every((v) => v === null || (typeof v === 'number' && v >= 0 && v <= 100)),
      );
    }
  });
}

test('Trend Breakout preserves the mock input and plot line numbers', () => {
  const source = readFileSync(new URL('trend-breakout.pine', import.meta.url), 'utf8');
  const description = describe(source);
  assert.deepEqual(
    description.inputs.map((item) => item.line),
    [9, 10, 11, 12, 13],
  );
  assert.deepEqual(
    description.plots.map((item) => item.line),
    [33, 34, 35],
  );
});

test('Trend Breakout trailing stops and alternate sources work when enabled', () => {
  const source = readFileSync(new URL('trend-breakout.pine', import.meta.url), 'utf8');
  const result = run(source, {
    ...input,
    inputs: { 'Use trailing stop': true, 'Trail %': 0.25, Source: 'ohlc4' },
  });
  assertRun(result, 'trend-breakout');
  for (const id of ['L trail', 'S trail']) {
    assert.ok(
      result.trades.some((trade) => trade.exitId === id),
      `${id} must fill`,
    );
  }
});

test('RSI Reversal supports an overbought exit and a different source', () => {
  const source = readFileSync(new URL('rsi-reversal.pine', import.meta.url), 'utf8');
  const result = run(source, { ...input, inputs: { 'Exit at midline': false, Source: 'hl2' } });
  assertRun(result, 'rsi-reversal');
  assert.ok(
    result.plots.find((plot) => plot.title === 'Exit level')!.values.every((v) => v === 70),
  );
  assert.ok(result.trades.some((trade) => trade.exitId === 'L stop'));
});

test('RSI Reversal filters recoveries below its long EMA using only the current and prior bars', () => {
  const source = readFileSync(new URL('rsi-reversal.pine', import.meta.url), 'utf8');
  const audit = run(`${source}\nplot(trend, "Trend audit")`, input);
  const trend = audit.plots.find((plot) => plot.title === 'Trend audit')!.values;
  const buys = audit.plots.find((plot) => plot.title === 'Buy')!.values;
  assert.deepEqual(audit.diagnostics, []);
  assert.ok(buys.includes(true));
  for (let bar = 0; bar < buys.length; bar++) {
    if (buys[bar] === true) {
      assert.equal(typeof trend[bar], 'number');
      assert.ok(input.bars[bar].close > Number(trend[bar]));
    }
  }
  // A prefix must emit exactly the same signals: later bars cannot change eligibility.
  const prefixLength = Math.floor(input.bars.length / 2);
  const prefix = run(source, { ...input, bars: input.bars.slice(0, prefixLength) });
  assert.deepEqual(
    prefix.plots.find((plot) => plot.title === 'Buy')!.values,
    buys.slice(0, prefixLength),
  );
  const unfiltered = run(source.replace(' and close > trend', ''), input);
  assert.notDeepEqual(unfiltered.plots.find((plot) => plot.title === 'Buy')!.values, buys);
});

test('MA Cross supports SMA and disabling the slope filter', () => {
  const source = readFileSync(new URL('ma-cross.pine', import.meta.url), 'utf8');
  const result = run(source, {
    ...input,
    inputs: { 'Average type': 'SMA', 'Require rising slow MA': false },
  });
  assertRun(result, 'ma-cross');
  assert.ok(result.trades.some((trade) => trade.exitId === 'L stop'));
});
