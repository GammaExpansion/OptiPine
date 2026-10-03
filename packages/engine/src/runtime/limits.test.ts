import assert from 'node:assert/strict';
import test from 'node:test';
import { run } from '../index.ts';
import { diagnosticKind } from './interpreter.ts';

const input = {
  bars: [10, 11].map((close, index) => ({
    time: 1577836800 + index * 3600,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 10,
  })),
  syminfo: { timezone: 'UTC', mintick: 0.01, pointvalue: 1 },
  timeframe: '60',
};

test('v5 loops whose bodies contain only statements still hit the per-bar step limit', () => {
  for (const body of ['    continue', '    var y = 0']) {
    const result = run(
      `//@version=5\nindicator("Budget")\nfor i = 0 to 1000000000\n${body}\nplot(1)`,
      input,
    );
    assert.equal(result.diagnostics.length, 1, body);
    assert.equal(result.diagnostics[0].kind, 'limit', body);
  }
});

test('non-positive or na lengths are runtime errors instead of a silent length of one', () => {
  for (const body of [
    'plot(ta.sma(close, 0))',
    'plot(ta.highest(high, -3))',
    'plot(ta.sma(close, bar_index == 0 ? int(na) : 5))',
  ]) {
    const result = run(`//@version=6\nindicator("Length")\n${body}`, input);
    assert.equal(result.diagnostics.length, 1, body);
    assert.equal(result.diagnostics[0].kind, 'runtime', body);
    assert.match(result.diagnostics[0].message, /'length' argument/, body);
  }
  // Builtins whose second argument is a series or an offset keep their semantics.
  const others = run(
    `//@version=6\nindicator("Length")\nplot(ta.crossover(close, 0) ? 1 : 0)\nplot(ta.change(close))\nplot(ta.sma(close, 2))`,
    input,
  );
  assert.deepEqual(others.diagnostics, []);
});

test('input overrides match own titles only', () => {
  const source = `//@version=6\nindicator("Keys")\na = input.int(2, "__proto__")\nb = input.int(3, "constructor")\nplot(a)\nplot(b)`;
  const result = run(source, { ...input, inputs: Object.fromEntries([['__proto__', 7]]) });
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(
    result.plots.map((p) => p.values),
    [
      [7, 7],
      [3, 3],
    ],
  );
});

test('engine faults are reported as internal, script errors as runtime', () => {
  assert.equal(diagnosticKind(new TypeError('items is not iterable')), 'internal');
  assert.equal(diagnosticKind(new RangeError('Invalid array length')), 'internal');
  assert.equal(diagnosticKind(new Error('Cannot pop empty array')), 'runtime');
  assert.equal(
    diagnosticKind(Object.assign(new Error('x'), { kind: 'unsupported' })),
    'unsupported',
  );
});
