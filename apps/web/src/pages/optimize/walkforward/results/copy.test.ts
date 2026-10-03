import { expect, it } from 'vitest';
import { translate } from '../../../../i18n/translate.ts';
import {
  compactNet,
  dateRange,
  figure,
  parameterSet,
  parameterValue,
  windowLabel,
} from './copy.ts';

it('formats finite amounts, ratios, compact losses and unavailable values without inventing zero', () => {
  expect(translate(figure(7600, 0, true), 'en')).toBe('+7,600');
  expect(translate(figure(-0.33, 2), 'en')).toBe('-0.33');
  expect(translate(figure(0, 0, true), 'en')).toBe('0');
  for (const value of [null, undefined, NaN, Infinity])
    expect(translate(figure(value), 'en')).toBe('—');
  expect(translate(compactNet(-860), 'en')).toBe('-860');
  expect(translate(compactNet(2310), 'en')).toBe('+2.3k');
  expect(translate(compactNet(null), 'zh')).toBe('—');
});

it('uses half-open UTC dates across leap days and years', () => {
  const seconds = (date: string) => Date.parse(date) / 1000;
  expect(translate(dateRange(seconds('2024-02-01'), seconds('2024-03-01'), true), 'en')).toBe(
    '24-02-01 → 02-29',
  );
  expect(translate(dateRange(seconds('2024-10-01'), seconds('2025-02-01'), true), 'en')).toBe(
    '24-10-01 → 25-01-31',
  );
  expect(translate(dateRange(seconds('2024-07-01'), seconds('2024-10-01')), 'en')).toBe(
    '2024-07-01 → 2024-09-30',
  );
});

it('keeps script titles and option values, translating booleans and set separators', () => {
  const parameters = { Length: 26, Multiplier: 2.25, Source: 'close', Stop: false };
  expect(translate(parameterSet(parameters), 'en')).toBe('26, 2.25, close, off');
  expect(translate(parameterSet(parameters, true), 'zh')).toBe(
    'Length 26 · Multiplier 2.25 · Source close · Stop 关闭',
  );
  expect(translate(parameterValue(true), 'zh')).toBe('开启');
  expect(translate(parameterValue(null), 'en')).toBe('—');
  expect(translate(parameterSet(null), 'en')).toBe('—');
  expect(translate(windowLabel(5), 'en')).toBe('W6');
});
