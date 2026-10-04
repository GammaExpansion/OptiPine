import { describe, expect, it } from 'vitest';
import { prepareHeatmap, type Heatmap } from '@pine/optimizer';
import {
  cellAt,
  cellPitch,
  cellRect,
  colorStep,
  containsSelection,
  heatTokens,
  fitMap,
  mapGeometry,
  maxCellPitch,
  verticalTitle,
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
  it('fits both dimensions with axis captions, even below the 24-value limit', () => {
    const original: Heatmap = {
      xKey: 'Length',
      yKey: 'Multiplier',
      cells: Array.from({ length: 31 * 13 }, (_, i) => ({
        x: i % 31,
        y: Math.floor(i / 31),
        value: i,
        count: 1,
      })),
    };
    for (const [width, height] of [
      [480, 174],
      [240, 138],
      [1024, 600],
    ]) {
      const fitted = fitMap(original, width, height);
      const geometry = mapGeometry(fitted);
      expect(geometry.width).toBeLessThanOrEqual(width);
      expect(geometry.height).toBeLessThanOrEqual(height);
      expect(geometry.layers[0].xs.length).toBeLessThanOrEqual(24);
      expect(geometry.layers[0].ys.length).toBeLessThanOrEqual(24);
      expect(fitted.cells.reduce((sum, cell) => sum + cell.count, 0)).toBe(403);
      expect(cellRect(geometry.layers[0], 0, width).width).toBe(16);
    }
    expect(fitMap(original, 480, 174).display?.yBinSize).toBe(3);
    expect(fitMap(original, 0, 0).display?.xBinSize).toBe(2);
  });
  it('fits every Z layer vertically and preserves separate layers for scrolling', () => {
    const layered: Heatmap = {
      xKey: 'A',
      yKey: 'B',
      zKey: 'C',
      cells: [false, true].flatMap((z) =>
        Array.from({ length: 24 }, (_, y) => ({ x: 1, y, z, value: y, count: 1 })),
      ),
    };
    layered.layers = [false, true].map((z) => ({
      z,
      cells: layered.cells.filter((cell) => cell.z === z),
    }));
    const fitted = fitMap(layered, 360, 186);
    const geometry = mapGeometry(fitted);
    expect(geometry.layers).toHaveLength(2);
    expect(geometry.height / 2).toBeLessThanOrEqual(186);
    expect(fitted.cells.reduce((sum, cell) => sum + cell.count, 0)).toBe(48);
  });
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

describe('vertical axis title', () => {
  it('centres on the rows, and runs past short rows within its band (bug bash #33)', () => {
    const rows = { top: 8, height: 180 };
    const band = { top: 2, bottom: 250 };
    expect(verticalTitle(60, rows, band)).toEqual({ centre: 98, span: 60 });
    // "Use trailing stop" over two 18 px rows: whole, from the top of the canvas down.
    expect(verticalTitle(95, { top: 8, height: 36 }, { top: 2, bottom: 108 })).toEqual({
      centre: 49.5,
      span: 95,
    });
    // Longer than the whole band: drawn at the band's length, filling it.
    expect(verticalTitle(140, { top: 8, height: 36 }, { top: 2, bottom: 108 })).toEqual({
      centre: 55,
      span: 106,
    });
  });
});

describe('sparse maps', () => {
  const small: Heatmap = prepareHeatmap(
    {
      xKey: 'Multiplier',
      yKey: 'Length',
      cells: Array.from({ length: 12 }, (_, index) => ({
        x: index % 4,
        y: Math.floor(index / 4),
        value: index,
        count: 1,
      })),
    },
    true,
  );

  it('grow their cells to fill the panel, up to a limit, centred (polish backlog)', () => {
    // 4 × 3 in a 440 × 230 panel: the rows decide, (230 - 8 - 66 + 2) / 3 = 52 → capped at 40.
    const geometry = mapGeometry(small, { width: 440, height: 230 });
    const layer = geometry.layers[0];
    expect(layer.pitch).toBe(maxCellPitch);
    const first = cellRect(layer, 0, 440);
    expect(first).toEqual({
      x: 64 + Math.floor((440 - 64 - 16 - (4 * 40 - 2)) / 2),
      y: 8,
      width: 38,
      height: 38,
    });
    expect(cellAt(geometry, first.x + 37, first.y + 37, 440)?.value).toBe(small.cells[8].value);
    expect(cellAt(geometry, first.x + 39, first.y + 10, 440)).toBeNull();
    // A shorter panel: the pitch follows the rows, (130 - 8 - 66 + 2) / 3 = 19.
    expect(mapGeometry(small, { width: 440, height: 130 }).layers[0].pitch).toBe(19);
    // Without a panel, as for the bin detail, the dense pitch.
    expect(mapGeometry(small).layers[0].pitch).toBe(cellPitch);
  });

  it('keep the dense pitch when layered, since layers scroll', () => {
    const cells = [false, true].flatMap((z) =>
      Array.from({ length: 4 }, (_, index) => ({
        x: index % 2,
        y: Math.floor(index / 2),
        z,
        value: index,
        count: 1,
      })),
    );
    const layered: Heatmap = {
      xKey: 'Length',
      yKey: 'Multiplier',
      zKey: 'Stop',
      cells,
      layers: [false, true].map((z) => ({ z, cells: cells.filter((cell) => cell.z === z) })),
    };
    const geometry = mapGeometry(layered, { width: 600, height: 400 });
    expect(geometry.layers.map((layer) => layer.pitch)).toEqual([cellPitch, cellPitch]);
  });
});
