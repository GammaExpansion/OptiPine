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
