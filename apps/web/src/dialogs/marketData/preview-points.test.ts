import { expect, test } from 'vitest';
import { previewPoints } from './preview-points.ts';

test('preview geometry is finite for flat prices and bounded for long datasets', () => {
  expect(previewPoints([])).toBe('');
  const bars = Array.from({ length: 17520 }, (_, i) => ({
    time: i * 3600,
    open: 10,
    high: 10,
    low: 10,
    close: 10,
    volume: 1,
  }));
  const points = previewPoints(bars).split(' ');
  expect(points).toHaveLength(220);
  expect(points[0]).toBe('0.00,96.00');
  expect(points.at(-1)).toBe('400.00,96.00');
  expect(previewPoints([bars[0]])).not.toContain('NaN');
});
