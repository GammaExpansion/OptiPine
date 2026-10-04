import { expect, it } from 'vitest';
import { markersByCell } from './map-markers.ts';

it('groups overlapping and binned picks, respects Z, and ignores picks outside the surface', () => {
  const cells = [false, true].map((z) => ({
    x: 10,
    xValues: [10, 11],
    y: 2,
    yValues: [2, 3],
    z,
    value: 2,
    count: 4,
  }));
  const map = { xKey: 'X', yKey: 'Y', zKey: 'Z', cells };
  const markers = [
    { parameters: { X: 10, Y: 2, Z: false }, label: 'W1' },
    { parameters: { X: 11, Y: 3, Z: false }, label: 'W2', selected: true },
    { parameters: { X: 10, Y: 2, Z: true }, label: 'W3' },
    { parameters: { X: 20, Y: 2, Z: true }, label: 'W4' },
  ];
  const groups = markersByCell(map, markers);
  expect(groups.size).toBe(2);
  expect(groups.get(cells[0])).toEqual(markers.slice(0, 2));
  expect(groups.get(cells[1])).toEqual([markers[2]]);
  expect(markersByCell(map, [])).toEqual(new Map());
});
