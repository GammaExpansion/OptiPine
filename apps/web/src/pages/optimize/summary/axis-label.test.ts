import { expect, test } from 'vitest';
import { axisLabel } from './axis-label.ts';

test('net ticks match R2 and retain fractional ticks', () => {
  expect([-10000, 0, 10000, 20000].map((value) => axisLabel(value))).toEqual([
    '−10k',
    '0',
    '+10k',
    '+20k',
  ]);
  expect(axisLabel(2500)).toBe('+2.5k');
  expect(axisLabel(-0.025)).toBe('−0.025');
  expect(axisLabel(1e-7)).toBe('+0.0000001');
  expect(axisLabel(50, false)).toBe('50');
});
