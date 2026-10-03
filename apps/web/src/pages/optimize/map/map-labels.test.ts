import { expect, it } from 'vitest';
import { translate } from '../../../i18n/translate.ts';
import { axisLabel, isBinnedCell, rangeLabel, valueLabel } from './map-labels.ts';

it('labels bins and irregular final bins in both languages', () => {
  expect(translate(axisLabel('Length', 2), 'en')).toBe('Length · 2 values per cell, averaged');
  expect(translate(axisLabel('Length', 1), 'en')).toBe('Length');
  expect(translate(axisLabel('Length', 9), 'zh')).toBe('Length · 每格 9 个值取平均');
  expect(translate(rangeLabel([23, 24, 25]), 'en')).toBe('23–25');
  expect(translate(rangeLabel([25]), 'en')).toBe('25');
  expect(translate(valueLabel(false), 'en')).toBe('off');
  expect(translate(valueLabel(null), 'zh')).toBe('—');
  expect(isBinnedCell({ x: 1, xValues: [1, 2], value: 3, count: 2 })).toBe(true);
  expect(isBinnedCell({ x: 1, xValues: [1], value: 3, count: 1 })).toBe(false);
});
