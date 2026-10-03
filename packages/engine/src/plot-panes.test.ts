import assert from 'node:assert/strict';
import test from 'node:test';
import { run } from './index.ts';
import type { RunInput } from './types.ts';

const input: RunInput = {
  bars: [100, 101, 103, 102].map((close, i) => ({
    time: 1_704_067_200 + i * 3600,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 10,
  })),
  syminfo: {},
  timeframe: '60',
};
const panes = (source: string) => {
  const result = run(source, input);
  assert.deepEqual(result.diagnostics, []);
  return Object.fromEntries(result.plots.map((plot) => [plot.title, plot.overlay]));
};

test('a separate-pane script keeps its plots off the price chart unless force_overlay is set', () => {
  assert.deepEqual(
    panes(`//@version=6
strategy("Panes", overlay = false)
r = ta.rsi(close, 2)
plot(r, "RSI")
plot(close, "Price copy", force_overlay = true)
plotshape(r > 50, "Above", force_overlay = true)
plotchar(r < 50, "Below", force_overlay = false)`),
    { RSI: false, 'Price copy': true, Above: true, Below: false },
  );
});

test('an overlay script draws every plot on the price chart', () => {
  assert.deepEqual(
    panes(`//@version=6
strategy("Overlay", overlay = true)
plot(ta.sma(close, 2), "SMA")
plot(close, "Close", force_overlay = false)`),
    { SMA: true, Close: true },
  );
});

test('indicators default to a separate pane and accept overlay positionally', () => {
  assert.deepEqual(panes('//@version=6\nindicator("Default")\nplot(close, "Close")'), {
    Close: false,
  });
  assert.deepEqual(
    panes('//@version=5\nindicator("Positional", "P", true)\nplot(close, "Close")'),
    {
      Close: true,
    },
  );
});
