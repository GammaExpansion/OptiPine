import { describe, expect, it } from 'vitest';
import { prepareHeatmap, type Heatmap } from '@pine/optimizer';
import {
  cellAt,
  cellRect,
  colorStep,
  containsSelection,
  heatTokens,
  mapGeometry,
} from './geometry.ts';
import { curveGeometry } from './curve-geometry.ts';

const map: Heatmap = prepareHeatmap(
  {
    xKey: 'Length',
    yKey: 'Multiplier',
    cells: Array.from({ length: 50 }, (_, index) => ({
      x: index % 25,
      y: Math.floor(index / 25),
      value: index,
      count: 1,
    })),
  },
  true,
);

describe('map geometry', () => {
  it('keeps square 16px cells, 2px gaps, reversed Y and exact bin membership', () => {
    const geometry = mapGeometry(map);
    const layer = geometry.layers[0];
    expect(layer.xs).toHaveLength(13);
    expect(layer.ys).toEqual([1, 0]);
    expect(layer.columns[0]).toEqual([0, 1]);
    const first = cellRect(layer, 0, geometry.width);
    const next = cellRect(layer, 1, geometry.width);
    expect(first.width).toBe(16);
    expect(next.x - first.x).toBe(18);
    expect(cellAt(geometry, first.x + 8, first.y + 8, geometry.width)).toMatchObject({
      x: 0,
      y: 1,
    });
    expect(cellAt(geometry, first.x + 16, first.y + 8, geometry.width)).toBeNull();
    expect(cellAt(geometry, first.x - 1, first.y, geometry.width)).toBeNull();
    expect(cellAt(geometry, first.x, first.y + 16, geometry.width)).toBeNull();
    expect(containsSelection(map, layer.cells.get(0)!, { Length: 1, Multiplier: 1 })).toBe(true);
    expect(containsSelection(map, layer.cells.get(0)!, { Length: 2, Multiplier: 1 })).toBe(false);
  });
  it('hit tests separate Z layers without mixing their cells', () => {
    const cells = [false, true].map((z) => ({ x: 1, y: 1, z, value: 4, count: 1 }));
    const layered = {
      xKey: 'A',
      yKey: 'B',
      zKey: 'C',
      cells,
      layers: cells.map((cell) => ({ z: cell.z, cells: [cell] })),
    };
    const geometry = mapGeometry(layered);
    const rect = cellRect(geometry.layers[1], 0, geometry.width);
    expect(cellAt(geometry, rect.x, rect.y, geometry.width)?.z).toBe(true);
    expect(containsSelection(layered, cells[1], { A: 1, B: 1, C: false })).toBe(false);
  });
  it('preserves both axes of a two-dimensional bin', () => {
    const both = prepareHeatmap(
      {
        xKey: 'X',
        yKey: 'Y',
        cells: Array.from({ length: 625 }, (_, index) => ({
          x: index % 25,
          y: Math.floor(index / 25),
          value: index,
          count: 1,
        })),
      },
      true,
    );
    const geometry = mapGeometry(both);
    const layer = geometry.layers[0];
    expect(layer.rows[0]).toEqual([24]);
    expect(layer.rows[1]).toEqual([22, 23]);
    expect(layer.columns[12]).toEqual([24]);
    const cell = layer.cells.get(13)!;
    expect(containsSelection(both, cell, { X: 1, Y: 23 })).toBe(true);
    expect(containsSelection(both, cell, { X: 1, Y: 24 })).toBe(false);
  });
  it('uses all nine Worker rank bins, with missing samples distinct from zero', () => {
    expect(new Set(heatTokens).size).toBe(9);
    for (let index = 0; index < 9; index++)
      expect(colorStep({ x: 1, value: 0, count: 1, rankBin: index })).toBe(index);
    expect(colorStep({ x: 1, value: null, count: 0, rankBin: 4 })).toBeNull();
    expect(colorStep({ x: 1, value: Infinity, count: 1 })).toBeNull();
    expect(heatTokens[0]).toBe('--heat-1');
    expect(heatTokens[8]).toBe('--heat-8');
  });
});

it('curve scales include IS, OOS and the neighbourhood, handling flat and missing values', () => {
  const curve = {
    input: 'Length',
    points: [
      { x: 2, inSample: 2, outOfSample: -4, neighbourhoodMean: 10, trialId: 'a' },
      { x: 3, inSample: null, outOfSample: null, neighbourhoodMean: null, trialId: null },
    ],
    peak: 2,
    nearPeak: null,
  };
  const geometry = curveGeometry(curve, 400, 210);
  expect([geometry.low, geometry.high]).toEqual([-4, 10]);
  expect(geometry.y(-4)).toBeGreaterThan(geometry.y(10));
  expect(geometry.indexAt(-100)).toBe(0);
  expect(geometry.indexAt(800)).toBe(1);
  expect(Number.isFinite(curveGeometry({ ...curve, points: [] }, 300, 210).y(0))).toBe(true);
});
