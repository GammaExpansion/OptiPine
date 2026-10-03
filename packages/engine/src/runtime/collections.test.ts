import assert from 'node:assert/strict';
import test from 'node:test';
import { run } from '../index.ts';
import { MAX_COLLECTION_SIZE } from './collections.ts';

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
const script = (body: string) => `//@version=6\nindicator("Collections")\n${body}`;

test('map.put_all copies every entry instead of silently doing nothing', () => {
  const result = run(
    script(`source = map.new<string, float>()
map.put(source, "a", 1)
map.put(source, "b", 2)
target = map.new<string, float>()
map.put(target, "b", 20)
map.put(target, "c", 30)
map.put_all(target, source)
plot(map.size(target))
plot(map.get(target, "b"))
plot(map.get(target, "a"))`),
    input,
  );
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(
    result.plots.map((p) => p.values),
    [
      [3, 3],
      [2, 2],
      [1, 1],
    ],
  );
});

test('collection sizes beyond the element limit are diagnostics, not allocations', () => {
  for (const body of [
    `a = array.new_float(${MAX_COLLECTION_SIZE + 1}, 0.0)\nplot(array.size(a))`,
    `a = array.new_float(-1, 0.0)\nplot(array.size(a))`,
    `m = matrix.new<float>(400, 400, 0.0)\nplot(matrix.rows(m))`,
    `a = array.new_float(${MAX_COLLECTION_SIZE}, 0.0)\narray.push(a, 1.0)\nplot(array.size(a))`,
    `a = array.new_float(${MAX_COLLECTION_SIZE}, 0.0)\narray.concat(a, array.from(1.0))\nplot(array.size(a))`,
    `s = str.repeat("x", 5000)\nplot(str.length(s))`,
  ]) {
    const result = run(script(body), input);
    assert.equal(result.diagnostics.length, 1, body);
    assert.equal(result.diagnostics[0].kind, 'runtime', body);
    assert.match(result.diagnostics[0].message, /limit|non-negative integer/, body);
  }
  const accepted = run(
    script(
      `a = array.new_float(${MAX_COLLECTION_SIZE}, 0.0)\nm = matrix.new<float>()\nplot(array.size(a) + matrix.rows(m))`,
    ),
    input,
  );
  assert.deepEqual(accepted.diagnostics, []);
  assert.deepEqual(accepted.plots[0].values, [MAX_COLLECTION_SIZE, MAX_COLLECTION_SIZE]);
});
