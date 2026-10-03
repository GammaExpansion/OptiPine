import assert from 'node:assert/strict';
import test from 'node:test';
import { reportCycleCash } from './report-cash.ts';

test('cycle cash rounds the binary scaled amount without an epsilon or decimal tie rule', () => {
  assert.equal(reportCycleCash(1.005), 1);
  assert.equal(reportCycleCash(1.125), 1.13);
  assert.equal(reportCycleCash(123.4567), 123.46);
  assert.equal(reportCycleCash(123.451), 123.45);
  // Independent report observations distinguish binary scaling from toFixed(2).
  assert.equal(reportCycleCash(26689424.705), 26689424.71);
  assert.equal(reportCycleCash(2161.845), 2161.84);
  assert.equal(reportCycleCash(26688127.635), 26688127.64);
});

test('cycle cash increases precision only until the rounded amount becomes nonzero', () => {
  for (const [value, expected] of [
    [0.0078694, 0.01],
    [0.005, 0.01],
    [0.0044231, 0.004],
    [0.0004021, 0.0004],
    [0.000049, 0.00005],
    [3.4e-25, 3e-25],
  ]) {
    assert.equal(reportCycleCash(value), expected);
    assert.ok(reportCycleCash(value) > 0);
  }
});

test('cycle cash preserves zero, nonfinite values and extremes without looping or overflow', () => {
  for (const value of [
    0,
    -0,
    -1.125,
    NaN,
    Infinity,
    -Infinity,
    Number.MAX_VALUE,
    Number.MAX_SAFE_INTEGER,
    Number.MIN_VALUE,
    1e-310,
  ])
    assert.equal(reportCycleCash(value), value);
});
