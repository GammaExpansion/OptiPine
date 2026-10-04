import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareHeatmap } from './heatmap-display.ts';
import type { Heatmap } from './analysis.ts';
import { combinedExclusions } from './heatmap-exclusions.ts';

const constraint = { metric: 'Total trades', operator: '>=' as const, value: 30 };
const map: Heatmap = {
  xKey: 'Length',
  yKey: 'Multiplier',
  cells: Array.from({ length: 31 * 13 }, (_, index) => ({
    x: index % 31,
    y: Math.floor(index / 31),
    value: index === 0 ? null : index,
    count: index === 0 ? 0 : 1,
    ...(index % 2 ? { excludedCount: 1, failedConstraints: [constraint] } : {}),
  })),
};

test('display limits bin both axes, preserve filter status and average only sampled values', () => {
  const panel = prepareHeatmap(map, { x: 12, y: 6 });
  assert.equal(panel.display?.xBinSize, 3);
  assert.equal(panel.display?.yBinSize, 3);
  assert.equal(new Set(panel.cells.map((cell) => cell.x)).size, 11);
  assert.equal(new Set(panel.cells.map((cell) => cell.y)).size, 5);
  const first = panel.cells[0];
  assert.deepEqual(first.xValues, [0, 1, 2]);
  assert.deepEqual(first.yValues, [0, 1, 2]);
  assert.equal(first.count, 8);
  assert.equal(first.excludedCount, 4);
  assert.equal(first.value, (1 + 2 + 31 + 32 + 33 + 62 + 63 + 64) / 8);
  assert.deepEqual(first.failedConstraints, [constraint]);
});

test('resizing a streamed map preserves original ranges and weighted means of uneven bins', () => {
  const streamed = prepareHeatmap(map, true);
  const fitted = prepareHeatmap(streamed, { x: 1, y: 1 });
  const direct = prepareHeatmap(map, { x: 1, y: 1 });
  assert.ok(Math.abs(fitted.cells[0].value! - direct.cells[0].value!) < 1e-10);
  assert.equal(fitted.cells[0].count, 402);
  assert.equal(fitted.cells[0].averagedCells, 402);
  assert.deepEqual(fitted.cells[0].xValues, direct.cells[0].xValues);
  assert.deepEqual(fitted.cells[0].yValues, direct.cells[0].yValues);
  assert.equal(fitted.display?.xBinSize, 31);
  assert.equal(fitted.display?.yBinSize, 13);
  assert.equal(fitted.display?.originalXCount, 31);
  assert.equal(fitted.display?.originalYCount, 13);
  assert.equal(fitted.cells[0].excludedCount, 201);
});

test('combining filter failures keeps the union while preserving the number of excluded samples', () => {
  const other = { metric: 'Profit factor', operator: '>=' as const, value: 2 };
  assert.deepEqual(
    combinedExclusions([
      { excludedCount: 2, failedConstraints: [constraint] },
      { excludedCount: 1, failedConstraints: [constraint, other] },
      {},
    ]),
    { excludedCount: 3, failedConstraints: [constraint, other] },
  );
  assert.deepEqual(combinedExclusions([{}]), {});
});

/** A one-row map of `values`, each its own cell, coloured by `scale`. */
const row = (values: readonly number[], scale: Heatmap['scale']) =>
  prepareHeatmap({
    xKey: 'Length',
    cells: values.map((value, x) => ({ x, value, count: 1 })),
    scale,
  });
const steps = (map: Heatmap) => map.cells.map((cell) => cell.rankBin);

test('colours rank cells from worst to best in the objective direction (R4)', () => {
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const up = row(values, { direction: 'maximize' });
  assert.deepEqual(steps(up), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual([up.display?.worst, up.display?.best, up.display?.breakEven], [1, 9, null]);
  // Less is better for a drawdown: its smallest value takes the profit end of the ramp.
  const down = row(values, { direction: 'minimize' });
  assert.deepEqual(steps(down), [8, 7, 6, 5, 4, 3, 2, 1, 0]);
  assert.deepEqual([down.display?.worst, down.display?.best], [9, 1]);
  assert.deepEqual([down.display?.minimum, down.display?.maximum], [1, 9]);
});

test('a break-even splits losing and winning cells, each ranked on its own side (R4)', () => {
  const mixed = row([-300, -20, -1, 0, 5, 40, 41, 900, 7000], {
    direction: 'maximize',
    breakEven: 0,
  });
  assert.deepEqual(steps(mixed), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(mixed.display?.breakEven, 0);
  // One large loss does not push every profit into the loss colours, and vice versa.
  assert.deepEqual(steps(row([-9000, 10, 20], { direction: 'maximize', breakEven: 0 })), [1, 4, 8]);
  // All profitable: only the profit steps, so the legend shows no break-even.
  assert.deepEqual(steps(row([3, 1, 2], { direction: 'maximize', breakEven: 0 })), [8, 4, 6]);
  // A profit factor breaks even at one.
  assert.deepEqual(steps(row([0.8, 1, 1.5], { direction: 'maximize', breakEven: 1 })), [1, 3, 6]);
  // Minimizing, values below the break-even win.
  assert.deepEqual(steps(row([-2, 4], { direction: 'minimize', breakEven: 0 })), [6, 1]);
});
