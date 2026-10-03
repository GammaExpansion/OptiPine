import assert from 'node:assert/strict';
import test from 'node:test';
import {
  closedEquityCycles,
  closedEquityStatistics,
  summarizeClosedEquityCycles,
} from './closed-equity.ts';
import type { Trade } from '../types.ts';

const maximumClosedDrawdown = (trades: readonly Trade[], capital: number) =>
  closedEquityStatistics(trades, capital).drawdown?.maximum ?? null;

const points = (values: readonly number[], times = values.map((_, index) => index * 86400)) =>
  values.map((value, index) => ({ value, time: times[index] }));

test('single-step drawdown threshold filters the maximum as well as the average', () => {
  // The first fall is larger, but excluded just above its 5% peak-balance boundary.
  const curve = points([0, -50, 0, -20, -40]);
  const included = closedEquityCycles(curve, 999.99);
  assert.deepEqual(
    included.drawdown.map(({ start, end }) => [start, end]),
    [
      [0, 1],
      [2, 4],
    ],
  );
  assert.equal(summarizeClosedEquityCycles(included.drawdown)?.maximum.value, 50);
  assert.equal(summarizeClosedEquityCycles(included.drawdown)?.average.value, 45);
  for (const capital of [1000, 1000.01]) {
    const excluded = closedEquityCycles(curve, capital);
    assert.deepEqual(
      excluded.drawdown.map(({ start, end }) => [start, end]),
      [[2, 4]],
    );
    assert.equal(summarizeClosedEquityCycles(excluded.drawdown)?.maximum.value, 40);
    assert.equal(summarizeClosedEquityCycles(excluded.drawdown)?.average.value, 40);
  }
});

test('drawdown and run-up lengths count closed points, including equal timestamps', () => {
  assert.equal(closedEquityCycles(points([0, 100]), 100).runup.length, 0);
  const increasing = closedEquityCycles(points([0, 50, 100], [0, 0, 0]), 100);
  assert.equal(increasing.runup.length, 1);
  assert.equal(increasing.runup[0].days, 0);
  assert.equal(closedEquityCycles(points([0, -1, -2], [0, 0, 0]), 100).drawdown.length, 1);
  assert.deepEqual(closedEquityCycles(points([0, 0, 0, -10]), 100).runup, []);
  assert.deepEqual(closedEquityCycles(points([0, 0, 0]), 100), { runup: [], drawdown: [] });
});

test('equal highs move the peak while equal lows retain their first timestamp', () => {
  const result = closedEquityCycles(points([0, 10, 10, 5, -10, -10, 20, 30]), 100);
  assert.deepEqual(
    result.drawdown.map(({ start, end }) => [start, end]),
    [[2, 4]],
  );
  assert.equal(result.drawdown[0].days, 2);
  assert.deepEqual(
    result.runup.map(({ start, end }) => [start, end]),
    [
      [0, 2],
      [4, 7],
    ],
  );
  assert.equal(result.runup[1].days, 3);
});

test('retained troughs delimit recovery and an unfinished final drawdown uses its lowest point', () => {
  const result = closedEquityCycles(points([0, -10, 0, 10, 8, 12, 11, 9, 10]), 100);
  assert.deepEqual(
    result.drawdown.map(({ start, end }) => [start, end]),
    [
      [0, 1],
      [5, 7],
    ],
  );
  assert.deepEqual(
    result.runup.map(({ start, end }) => [start, end]),
    [[1, 5]],
  );
  assert.equal(result.runup[0].value, 22);
  assert.equal(result.drawdown[1].value, 3);
});

test('cycle means retain fractional durations and do not weight by length or maximize percent separately', () => {
  const result = closedEquityCycles(
    points(
      [0, -50, 950, 850],
      [0, 1.9, 2, 2.9].map((day) => day * 86400),
    ),
    100,
  );
  const statistics = summarizeClosedEquityCycles(result.drawdown)!;
  assert.equal(statistics.average.value, 75);
  assert.equal(statistics.average.percent, (50 + (100 / 1050) * 100) / 2);
  assert.ok(Math.abs(statistics.average.days - 1.4) < 1e-12);
  assert.deepEqual(statistics.maximum, { value: 100, percent: (100 / 1050) * 100 });
  assert.equal(summarizeClosedEquityCycles([]), null);
});

test('an excluded final drawdown preserves the preceding run-up peak', () => {
  // Native cash-drawdown probe: the ninth trade closes below the preceding peak,
  // but its one-step loss does not form a retained close-to-close drawdown.
  const result = closedEquityCycles(
    points([105.86, 109.15, 250.25, 286.38, 672.33, 830.24, 1153.2, 1164.25, 989.95]),
    10000,
  );
  assert.deepEqual(result.drawdown, []);
  assert.equal(result.runup.length, 1);
  assert.equal(result.runup[0].start, 0);
  assert.equal(result.runup[0].end, 7);
  assert.equal(result.runup[0].value, 1058.39);
  assert.equal(result.runup[0].days, 7);

  const recovery = closedEquityCycles(points([0, -100, 0, 100, 90]), 1000);
  assert.deepEqual(
    recovery.runup.map(({ start, end }) => [start, end]),
    [[1, 3]],
  );
  assert.equal(recovery.runup[0].value, 200);

  // A retained drawdown's unfinished recovery still ends at the final point.
  const unfinished = closedEquityCycles(points([0, -100, -200, -50, -70, -60]), 1000);
  assert.deepEqual(
    unfinished.runup.map(({ start, end }) => [start, end]),
    [[2, 5]],
  );
  assert.equal(unfinished.runup[0].value, 140);
});

test('zero balance preserves cash and duration while leaving percentage averages undefined', () => {
  const result = closedEquityCycles(points([-100, -110, 0, -10]), 100);
  const statistics = summarizeClosedEquityCycles(result.drawdown)!;
  assert.equal(statistics.average.value, 10);
  assert.equal(statistics.average.days, 1);
  assert.equal(statistics.average.percent, null);
  assert.equal(statistics.maximum.percent, null);
});

test('reported curve conversion observes raw accumulated profit without rounding each increment', () => {
  const trades = [100000001, 3, -50000000].map((profit) => closed(profit));
  const before = structuredClone(trades);
  const result = closedEquityStatistics(trades, 1000000);
  assert.deepEqual(result.drawdown?.maximum, {
    value: 49999996,
    percent: (49999996 / 101000000) * 100,
  });
  assert.deepEqual(trades, before);
});

const closed = (profit: number, exitBar: number | null = 1): Trade => ({
  direction: 'long',
  entryId: 'entry',
  exitId: 'exit',
  entryComment: '',
  exitComment: '',
  entryPrice: 100,
  exitPrice: 100 + profit,
  entryTime: 0,
  exitTime: exitBar === null ? null : 60,
  entryBar: 0,
  exitBar,
  quantity: 1,
  entryCommission: 0,
  commission: 0,
  profit,
  maxRunup: Math.max(0, profit),
  maxDrawdown: Math.max(0, -profit),
});

test('closed drawdown starts at the first closed point and excludes open losses', () => {
  assert.equal(maximumClosedDrawdown([], 100), null);
  assert.equal(maximumClosedDrawdown([closed(-30)], 100), null);
  assert.equal(maximumClosedDrawdown([closed(10), closed(0), closed(20)], 100), null);
  assert.deepEqual(maximumClosedDrawdown([closed(-100), closed(-10)], 100), {
    value: 10,
    percent: null,
  });
  assert.deepEqual(maximumClosedDrawdown([closed(-30), closed(-14), closed(-900, null)], 100), {
    value: 14,
    percent: 20,
  });
});

test('percentage belongs to the largest cash decline, not an independent percentage maximum', () => {
  // Closed equity: 100 -> 50 -> 1000 -> 900. The 100 cash drawdown is 10%, although
  // the earlier, smaller cash drawdown was 50%.
  assert.deepEqual(
    maximumClosedDrawdown([closed(0), closed(-50), closed(950), closed(-100)], 100),
    {
      value: 100,
      percent: 10,
    },
  );
});

test('extending a closed history cannot reduce its cash maximum and positive scaling preserves percent', () => {
  const profits = [-30, -15, 25, 80, -5, -25, 5, -50, 100];
  let previous = 0;
  for (let count = 1; count <= profits.length; count++) {
    const prefix = profits.slice(0, count);
    const result = maximumClosedDrawdown(
      prefix.map((profit) => closed(profit)),
      100,
    );
    assert.ok((result?.value ?? 0) >= previous);
    previous = result?.value ?? 0;
    const scaled = maximumClosedDrawdown(
      prefix.map((profit) => closed(profit * 8)),
      800,
    );
    assert.equal(scaled?.value ?? 0, previous * 8);
    assert.equal(scaled?.percent, result?.percent);
  }
});

test('recovery changes the reference only at a new closed high', () => {
  const first = [0, -20, 10, -15, 50, -30];
  const second = [0, 50, -20, -15, 10, -30];
  assert.equal(
    first.reduce((sum, profit) => sum + profit, 0),
    second.reduce((sum, profit) => sum + profit, 0),
  );
  assert.equal(
    maximumClosedDrawdown(
      first.map((profit) => closed(profit)),
      100,
    )?.value,
    30,
  );
  assert.equal(
    maximumClosedDrawdown(
      second.map((profit) => closed(profit)),
      100,
    )?.value,
    55,
  );
});
