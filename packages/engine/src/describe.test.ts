import assert from 'node:assert/strict';
import test from 'node:test';
import { describe, sourceSeries } from './index.ts';

const source = `//@version=6
strategy("AST inputs", initial_capital=10000, default_qty_type=strategy.percent_of_equity, default_qty_value=5)
fast = input.int(12, "Fast", minval=1, maxval=100, step=2, group="Averages", tooltip="Length")
slow = input.float(-2.5, title="Offset", minval=-5, maxval=5, step=0.5)
enabled = input.bool(true, "Long")
kind = input.string("EMA", "Kind", options=["EMA", "SMA"])
fixed = input.int(6 * 2, "Expression")
plot(strategy.equity, "Account value")
plot(close, "Price")`;

test('describe reads checked AST metadata, including named args, signed numbers and options', () => {
  const description = describe(source);
  assert.equal(description.success, true, JSON.stringify(description.diagnostics));
  assert.equal(description.title, 'AST inputs');
  assert.equal(description.version, 6);
  assert.equal(description.settings.initial_capital, 10000);
  assert.equal(description.settings.default_qty_type, 'strategy.percent_of_equity');
  assert.equal(description.inputs.length, 5);
  assert.deepEqual(
    description.inputs.slice(0, 4).map((item) => item.defaultValue),
    [12, -2.5, true, 'EMA'],
  );
  assert.deepEqual(
    description.inputs.map((item) => item.type),
    ['int', 'float', 'bool', 'string', 'int'],
  );
  assert.deepEqual(description.inputs[3].options, ['EMA', 'SMA']);
  const [fast] = description.inputs;
  assert.deepEqual(
    [fast.line, fast.min, fast.max, fast.step, fast.group, fast.tooltip],
    [3, 1, 100, 2, 'Averages', 'Length'],
  );
  assert.equal(fast.computedTitle, false);
  assert.equal(fast.fixed, false);
  assert.equal(fast.reason, undefined);
  assert.deepEqual(
    description.plots.map((plot) => [plot.title, plot.line, plot.isEquity]),
    [
      ['Account value', 8, true],
      ['Price', 9, false],
    ],
  );
});

test('every fixed input names its reason as a stable code', () => {
  const description = describe(`//@version=6
strategy("Fixed inputs")
a = input.int(6 * 2, "Computed default")
b = input.int(1)
c = input.color(#ff0000, "Colour")
d = input.string("A", "Options", options=[str.tostring(1), "B"])
e = input.int(2, "same")
f = input.int(3, "same")`);
  assert.equal(description.success, true, JSON.stringify(description.diagnostics));
  assert.deepEqual(
    description.inputs.map((item) => [item.fixed, item.reason]),
    [
      [true, 'computed-default'],
      [true, 'computed-title'],
      [true, 'unsupported-type'],
      [true, 'computed-options'],
      [true, 'duplicate-title'],
      [true, 'duplicate-title'],
    ],
  );
  assert.equal(description.inputs[0].defaultValue, undefined);
  const untitled = description.inputs[1];
  assert.equal(untitled.computedTitle, true);
  assert.equal(untitled.title, untitled.id);
  assert.equal(untitled.line, 4);
});

test('source inputs list the built-in series and keep a series default', () => {
  const description = describe('//@version=6\nindicator("S")\nsrc = input.source(hl2, "Source")');
  assert.equal(description.title, undefined, 'only strategy() supplies a title');
  assert.equal(description.inputs[0].defaultValue, 'hl2');
  assert.deepEqual(description.inputs[0].options, [...sourceSeries]);
  assert.equal(description.inputs[0].fixed, false);
});

test('computed strategy settings are reported by name and line, never evaluated', () => {
  const description = describe(
    '//@version=6\nstrategy("Settings", pyramiding=2, commission_type=strategy.commission.percent, initial_capital=1000 * 2)',
  );
  assert.equal(description.settings.pyramiding, 2);
  assert.equal(description.settings.commission_type, 'strategy.commission.percent');
  assert.equal(description.settings.initial_capital, undefined);
  assert.deepEqual(description.computedSettings, { initial_capital: 2 });
});

test('a compile failure keeps its diagnostics and describes nothing', () => {
  const description = describe('//@version=4\nstrategy("Old version")');
  assert.equal(description.success, false);
  assert.equal(description.diagnostics[0].kind, 'unsupported');
  assert.equal(description.diagnostics[0].line, 1);
  assert.deepEqual([description.inputs, description.plots, description.settings], [[], [], {}]);
});
