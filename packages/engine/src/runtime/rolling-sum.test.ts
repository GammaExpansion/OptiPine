import assert from 'node:assert/strict';
import test from 'node:test';
import { run } from '../index.ts';
import { RollingSum } from './rolling-sum.ts';
import { checkpoint } from './rollback.ts';
import { Scope } from './scope.ts';
import { state, technical, type TAContext } from './ta.ts';

const ctx: TAContext = {
  bar: { time: 0, open: 1, high: 1, low: 1, close: 1, volume: 1 },
  vwapAnchor: true,
};

test('moving sums preserve native rounding through different prefixes and constant windows', () => {
  // Integer ULP observations from the unchanged prefix probe; the capture audit is kept
  // with the raw evidence outside this repository.
  // Expected values never enter the accumulator.
  const observations = new Map([
    [19, [51002737, null, 97280001, null]],
    [27, [93952409, null, 179200001, null]],
    [29, [104689828, null, 199680002, null]],
    [59, [67108863, null, 128000003, null]],
    [100, [88583696, null, 168960004, null]],
    [1555, [17, -3, -11, 15]],
    [1600, [14, -1, -10, 11]],
    [3598, [0, -21, -5, -11]],
  ]);
  const sums = Array.from({ length: 4 }, () => new RollingSum(20));
  for (let i = 0; i <= 3598; i++) {
    const a = i < 1536 ? 1e6 + (i % 37) / 1000 : 1e6;
    const b = i < 512 ? 0 : a;
    const values = [a, b, a * a, b * b].map((x, j) => sums[j].push(x));
    const expected = observations.get(i);
    if (expected)
      expected.forEach((offset, j) => {
        if (offset !== null)
          assert.equal((values[j] - (j < 2 ? 2e7 : 2e13)) * (j < 2 ? 2 ** 28 : 256), offset);
      });
  }
});

test('missing samples preserve warmup, window membership, and sample variance', () => {
  for (const [name, args, expected] of [
    ['sum', [], [NaN, NaN, NaN, NaN, 6, 6, 9]],
    ['sma', [], [NaN, NaN, NaN, NaN, 2, 2, 3]],
    ['variance', [false], [NaN, NaN, NaN, NaN, 1, 1, 1]],
    ['stdev', [false], [NaN, NaN, NaN, NaN, 1, 1, 1]],
  ] as const) {
    const s = state();
    const actual = [NaN, 1, NaN, 2, 3, NaN, 4].map((x) =>
      Number(technical(name, [x, 3, ...args], s, ctx)),
    );
    actual.forEach((value, i) => {
      if (Number.isNaN(expected[i])) assert.ok(Number.isNaN(value));
      else assert.ok(Math.abs(value - expected[i]) < 1e-12);
    });
  }
});

test('rollback restores overwritten ring slots, compensation, and nested sums repeatedly', () => {
  for (const name of ['sum', 'sma', 'variance', 'stdev', 'bb']) {
    const active = state();
    const control = state();
    const step = (x: number, s = active) => technical(name, [x, 20, 2], s, ctx);
    const beforeCreation = checkpoint(new Scope('root'), new Map(), new Map([['call', active]]));
    step(3e6);
    beforeCreation();
    assert.deepEqual(active, state());
    for (let i = 0; i < 70; i++) {
      const x = 1e6 + (i % 37) / 1000;
      step(x);
      step(x, control);
    }
    const restore = checkpoint(new Scope('root'), new Map(), new Map([['call', active]]));
    for (let replay = 0; replay < 3; replay++) {
      for (let i = 0; i < 25; i++) step(2e6 + i / 100);
      restore();
    }
    for (let i = 70; i < 140; i++) {
      const x = 1e6 + (i % 37) / 1000;
      assert.deepEqual(step(x), step(x, control), name);
    }
  }
});

test('series-qualified fixed lengths execute while changing lengths report unsupported', () => {
  const input = {
    bars: Array.from({ length: 5 }, (_, i) => ({ ...ctx.bar, time: i * 86400 })),
    timeframe: 'D',
    syminfo: { timezone: 'UTC', mintick: 0.01 },
  };
  for (const name of ['math.sum', 'ta.sma', 'ta.variance', 'ta.stdev']) {
    const fixed = run(
      `//@version=6\nindicator("fixed")\nn = bar_index >= 0 ? 2 : 3\nplot(${name}(close, n))`,
      input,
    );
    assert.deepEqual(fixed.diagnostics, []);
    assert.equal(fixed.plots[0].values[0], null);
    assert.equal(fixed.plots[0].values[1], name === 'math.sum' ? 2 : name === 'ta.sma' ? 1 : 0);
    const changing = run(
      `//@version=6\nindicator("changing")\nplot(${name}(close, bar_index + 1))`,
      input,
    );
    assert.equal(changing.diagnostics[0]?.kind, 'unsupported');
    assert.match(changing.diagnostics[0].message, /Changing moving-sum lengths/);
  }
});
