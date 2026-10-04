import { expect, test } from 'vitest';
import {
  envelope,
  extent,
  nearestPoint,
  roundAxis,
  scale,
  timeTicks,
  underValueLabel,
  valueLabelY,
} from './plot-geometry.ts';

test('time ticks keep both endpoints and space phone dates without changing desktop density', () => {
  expect(timeTicks([0, 360], 318)).toEqual([0, 180, 360]);
  expect(timeTicks([0, 360], 968)).toEqual([0, 90, 180, 270, 360]);
  expect(timeTicks([10, 30], 200)).toEqual([10, 30]);
  expect(timeTicks([0, 1], 0)).toEqual([0, 1]);
});

test('round axes enclose data, label zero, and handle negative, fractional and empty ranges', () => {
  expect(roundAxis([-1177, 9805])).toEqual({
    bounds: [-5000, 10000],
    ticks: [-5000, 0, 5000, 10000],
  });
  expect(roundAxis([-10000, 20000]).ticks).toEqual([-10000, 0, 10000, 20000]);
  expect(roundAxis([0, 1], 2, true).ticks).toEqual([0, 1]);
  expect(roundAxis([0, 5], 2, true).ticks).toEqual([0, 5]);
  expect(roundAxis([0, 23], 2, true).ticks).toEqual([0, 20, 40]);
  expect(roundAxis([0.1, 0.3]).ticks).toEqual([0.1, 0.15, 0.2, 0.25, 0.3]);
  for (const bounds of [
    [-9805, -1177],
    [1177, 9805],
    [0, 0],
    [5, 5],
    [NaN, Infinity],
  ] as const) {
    const axis = roundAxis(bounds);
    expect(axis.ticks.length).toBeGreaterThan(1);
    expect(axis.ticks.length).toBeLessThanOrEqual(7);
    expect(axis.bounds.every(Number.isFinite)).toBe(true);
    expect(new Set(axis.ticks).size).toBe(axis.ticks.length);
    if (bounds.every(Number.isFinite)) {
      expect(axis.bounds[0]).toBeLessThanOrEqual(bounds[0]);
      expect(axis.bounds[1]).toBeGreaterThanOrEqual(bounds[1]);
    }
  }
});

test('bounds ignore missing values and keep zero and constant series plottable', () => {
  expect(extent([[NaN, Infinity]])).toEqual([0, 1]);
  expect(extent([[100, 100]])).toEqual([99, 101]);
  const bounds = extent([[100, 200]], true);
  expect(bounds[0]).toBeLessThan(0);
  expect(bounds[1]).toBeGreaterThan(200);
  expect(scale([10, 20], 100, 0)(15)).toBe(50);
});

test('pixel envelopes retain spikes, chronological order and the last bar', () => {
  const values = Array.from({ length: 1000 }, (_, index) =>
    index === 51 ? -500 : index === 52 ? 900 : 0,
  );
  const points = envelope(values, 100);
  expect(points).toContainEqual({ index: 51, value: -500 });
  expect(points).toContainEqual({ index: 52, value: 900 });
  expect(points.at(-1)).toEqual({ index: 999, value: 0 });
  expect(points.length).toBeLessThanOrEqual(201);
  expect(points.map((point) => point.index)).toEqual(
    points.map((point) => point.index).sort((a, b) => a - b),
  );
  expect(envelope([], 0)).toEqual([]);
});

test('scatter hit testing chooses the nearest dot and ignores empty space', () => {
  const points = [
    { x: 10, y: 12 },
    { x: 14, y: 16 },
  ];
  expect(nearestPoint(points, 13, 15)).toBe(1);
  expect(nearestPoint(points, 100, 100)).toBeNull();
});

test('the #1 value label stays in the plot and hides only the tick labels it covers (#17)', () => {
  expect(valueLabelY(4, 200)).toBe(10);
  expect(valueLabelY(190, 200)).toBe(162);
  expect(valueLabelY(80, 200)).toBe(80);
  // The phone's "150,090" tag at y 45 sat on the "140,981" tick at y 57.
  expect(underValueLabel(45, 57)).toBe(true);
  expect(underValueLabel(45, 31)).toBe(false);
  expect(underValueLabel(45, 33)).toBe(true);
  expect(underValueLabel(45, 61)).toBe(false);
});
