import { expect, test } from 'vitest';
import { stepNumber } from './number-step.ts';

test('steps on the min-based grid and pages in tens', () => {
  expect(stepNumber(0.3, 1, false, { step: 0.1 })).toBe(0.4);
  expect(stepNumber(0.4, -1, false, { step: 0.1 })).toBe(0.3);
  expect(stepNumber(0.3, 1, true, { step: 0.1 })).toBe(1.3);
  expect(stepNumber(2, 1, false, { min: 0.25, step: 0.5 })).toBe(2.25);
  expect(stepNumber(2, -1, false, { min: 0.25, step: 0.5 })).toBe(1.75);
});
test('clamps boundaries and recovers empty or invalid drafts', () => {
  expect(stepNumber(9, 1, true, { max: 10 })).toBe(10);
  expect(stepNumber(2, -1, true, { min: 1 })).toBe(1);
  expect(stepNumber('', 1, false, { min: 1 })).toBe(2);
  expect(stepNumber('-', -1, false, {})).toBe(-1);
  expect(stepNumber(1e-7, 1, false, { step: 1e-7 })).toBe(2e-7);
});
test.each([{ step: 0 }, { step: -1 }, { step: NaN }, { max: Infinity }, { min: 5, max: 1 }])(
  'invalid bounds do not emit a value: %o',
  (bounds) => {
    expect(stepNumber(1, 1, false, bounds)).toBeUndefined();
  },
);
