import type { InputDescriptor } from '@pine/engine';
import { message } from '@pine/messages';
import { expect, test } from 'vitest';
import type { SearchRow } from '../../../workflows/optimize-setup.ts';
import { chipOrder, choiceText, invalidFields, parseNumber, rangeText } from './search-display.ts';

const multiplier = {
  id: 'input-2',
  title: 'Multiplier',
  type: 'float',
  step: 0.25,
  fixed: false,
  line: 2,
} as InputDescriptor;

test('values read with the input step, booleans as On and Off', () => {
  expect(rangeText(multiplier, 1)).toBe('1.00');
  expect(rangeText(multiplier, NaN)).toBe('');
  expect(choiceText(multiplier, 2.5)).toBe('2.50');
  expect(choiceText(multiplier, true)).toEqual(message('optimize.setup.on'));
  expect(choiceText(multiplier, 'hl2')).toBe('hl2');
  expect(parseNumber(' 2,000 ')).toBe(2000);
  expect(parseNumber('')).toBeNaN();
  expect(parseNumber('abc')).toBeNaN();
});

test('kept values come first among the chips, and short lists show every value (O4)', () => {
  const choices = ['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4', 'hlcc4'].map(
    (value) => ({ value, kept: ['close', 'hl2', 'ohlc4'].includes(value) }),
  );
  expect(chipOrder(choices)).toEqual({ visible: ['close', 'hl2', 'ohlc4'], more: 5 });
  expect(
    chipOrder([
      { value: false, kept: true },
      { value: true, kept: false },
    ]),
  ).toEqual({ visible: [false, true], more: 0 });
});

const row = (error: SearchRow['error'], values = { from: 50, to: 10, step: 1 }) =>
  ({ error, draft: { searched: true, values: { kind: 'range', ...values } } }) as SearchRow;

test('a range error marks the fields it is about (O6)', () => {
  expect(invalidFields(row(null))).toEqual(new Set());
  expect(invalidFields(row(message('searchRangeReversed', { title: 'Length' })))).toEqual(
    new Set(['from', 'to']),
  );
  expect(invalidFields(row(message('searchIntegerStep', { title: 'Length' })))).toEqual(
    new Set(['step']),
  );
  expect(
    invalidFields(row(message('searchRangeFinite', {}), { from: 1, to: NaN, step: 0 })),
  ).toEqual(new Set(['to', 'step']));
});
