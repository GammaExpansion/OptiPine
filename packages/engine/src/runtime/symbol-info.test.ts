import assert from 'node:assert/strict';
import test from 'node:test';
import { run } from '../index.ts';
import { resolveSymbolInfo, SYMBOL_DEFAULTS } from './symbol-info.ts';

const bars = [10, 11].map((close, index) => ({
  time: 1577836800 + index * 3600,
  open: close,
  high: close + 1,
  low: close - 1,
  close,
  volume: 10,
}));
const source = `//@version=6\nindicator("Symbol")\nplot(syminfo.mintick)\nplot(syminfo.pointvalue)`;

test('missing symbol metadata takes one shared default everywhere', () => {
  const result = run(source, { bars, syminfo: {}, timeframe: '60' });
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(
    result.plots.map((p) => p.values),
    [
      [0.01, 0.01],
      [1, 1],
    ],
  );
  const resolved = resolveSymbolInfo({ extra: 'kept', timezone: 'UTC' });
  assert.equal(resolved.mintick, SYMBOL_DEFAULTS.mintick);
  assert.equal(resolved.currency, SYMBOL_DEFAULTS.currency);
  assert.equal(resolved.timezone, 'UTC');
  assert.equal(resolved.extra, 'kept');
});

test('invalid symbol metadata is a runtime diagnostic naming the key', () => {
  const invalid: Array<[Record<string, unknown>, RegExp]> = [
    [{ mintick: 0 }, /syminfo\.mintick/],
    [{ pointvalue: 'x' }, /syminfo\.pointvalue/],
    [{ timezone: 'Mars/Olympus' }, /syminfo\.timezone/],
  ];
  for (const [syminfo, pattern] of invalid) {
    const result = run(source, { bars, syminfo, timeframe: '60' });
    assert.equal(result.diagnostics.length, 1, JSON.stringify(syminfo));
    assert.equal(result.diagnostics[0].kind, 'runtime');
    assert.match(result.diagnostics[0].message, pattern);
  }
});
