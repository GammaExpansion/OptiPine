import assert from 'node:assert/strict';
import test from 'node:test';
import { sweep } from './optimizer.ts';
import type { RunInput } from './types.ts';

const common: RunInput = {
  bars: [10, 12, 11].map((close, index) => ({
    time: 1_700_000_000 + index * 3600,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 100,
  })),
  syminfo: { timezone: 'UTC', mintick: 0.01, mincontract: 1 },
  timeframe: '60',
};

test('parameter sweeps preserve order and isolate persistent state between repeated runs', () => {
  const source = `//@version=6
indicator("Accumulation")
step = input.int(1, "Step")
var total = 0
total += step
plot(total)
`;
  const parameters = [{ inputs: { Step: 2 } }, { inputs: { Step: 5 } }, { inputs: { Step: 2 } }];
  const result = sweep(source, common, parameters);
  assert.deepEqual(result.compilation, { success: true, diagnostics: [] });
  assert.deepEqual(
    result.runs.map((run) => run.parameters),
    parameters,
  );
  assert.deepEqual(
    result.runs.map((run) => run.result.diagnostics),
    [[], [], []],
  );
  assert.deepEqual(
    result.runs.map((run) => run.result.plots[0].values),
    [
      [2, 4, 6],
      [5, 10, 15],
      [2, 4, 6],
    ],
  );
  assert.deepEqual(sweep(source, common, parameters).runs, result.runs);
});

test('parameter overrides merge with common inputs without modifying either source', () => {
  const source = `//@version=6
indicator("Inputs")
left = input.int(2, "Left")
right = input.int(3, "Right")
plot(left + right)
`;
  const base = { ...common, inputs: Object.freeze({ Left: 7, Right: 11 }) };
  const parameter = Object.freeze({ inputs: Object.freeze({ Left: 5 }) });
  const result = sweep(source, base, [parameter, {}]);
  assert.deepEqual(
    result.runs.map((run) => run.result.plots[0].values),
    [
      [16, 16, 16],
      [18, 18, 18],
    ],
  );
  assert.deepEqual(base.inputs, { Left: 7, Right: 11 });
  assert.deepEqual(parameter.inputs, { Left: 5 });
});

test('each strategy trial has isolated orders, positions, and overridden settings', () => {
  const source = `//@version=5
strategy("Settings", initial_capital = 1000, default_qty_value = 1)
if bar_index == 0
    strategy.entry("buy", strategy.long)
plot(strategy.position_size)
plot(strategy.initial_capital)
`;
  const result = sweep(source, { ...common, settings: { initial_capital: 2000 } }, [
    { settings: { default_qty_value: 2 } },
    { settings: { initial_capital: 3000, default_qty_value: 4 } },
    { settings: { default_qty_value: 2 } },
  ]);
  assert.deepEqual(
    result.runs.map((run) => run.result.diagnostics),
    [[], [], []],
  );
  assert.deepEqual(
    result.runs.map((run) => run.result.plots[0].values),
    [
      [0, 2, 2],
      [0, 4, 4],
      [0, 2, 2],
    ],
  );
  assert.deepEqual(
    result.runs.map((run) => run.result.plots[1].values),
    [
      [2000, 2000, 2000],
      [3000, 3000, 3000],
      [2000, 2000, 2000],
    ],
  );
  assert.deepEqual(result.runs[0].result, result.runs[2].result);
});

test('a runtime failure stays on its trial and later parameter sets still execute', () => {
  const source = `//@version=6
indicator("Bounds")
size = input.int(1, "Size")
values = array.new<float>(size, close)
plot(array.get(values, 1))
`;
  const result = sweep(source, common, [{ inputs: { Size: 1 } }, { inputs: { Size: 2 } }]);
  assert.equal(result.compilation.success, true);
  assert.equal(result.runs[0].result.diagnostics[0].kind, 'runtime');
  assert.deepEqual(result.runs[1].result.diagnostics, []);
  assert.deepEqual(result.runs[1].result.plots[0].values, [10, 12, 11]);
});

test('compilation failures are reported once and never produce trial results', () => {
  const result = sweep('//@version=6\nindicator("Invalid")\nplot(undeclared)', common, [{}, {}]);
  assert.equal(result.compilation.success, false);
  assert.equal(result.compilation.diagnostics.length, 1);
  assert.equal(result.compilation.diagnostics[0].kind, 'undeclared');
  assert.deepEqual(result.runs, []);
});
