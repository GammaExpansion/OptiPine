import { describe, expect, test } from 'vitest';
import { translate } from '../../../../i18n/translate.ts';
import { metricMessage, metricTone, numberMessage, profitTone, tradeTime } from './formatting.ts';

describe('B1 financial presentation', () => {
  test.each([
    [18420.35, { signed: true }, '+18,420.35'],
    [7812.1, { loss: true }, '−7,812.10'],
    [-7812.1, { loss: true }, '−7,812.10'],
    [47.55, { percent: true }, '47.55%'],
    [143, { decimals: 0 }, '143'],
    [1.62, {}, '1.62'],
    [0, { signed: true }, '0.00'],
    [-0.001, { signed: true }, '0.00'],
    [null, {}, '—'],
    [undefined, {}, '—'],
    [NaN, {}, '—'],
    [Infinity, {}, '—'],
  ] as const)(
    '%s has the same numeric representation in both languages',
    (value, style, expected) => {
      const result = numberMessage(value, style);
      expect(translate(result, 'en')).toBe(expected);
      expect(translate(result, 'zh')).toBe(expected);
    },
  );
  test('metric precision, units and profit colors follow the report', () => {
    expect(
      translate(metricMessage('Trades analysis/Average bars in trades', 27, 'value', false), 'en'),
    ).toBe('27 bars');
    expect(
      translate(metricMessage('Performance/Buy and hold PnL', 471.2, 'percent', false), 'en'),
    ).toBe('+471.20%');
    expect(
      translate(metricMessage('Performance/Max contracts held', 1, 'value', false), 'en'),
    ).toBe('1');
    expect([10, -10, 0, null, NaN].map(profitTone)).toEqual([
      'profit',
      'loss',
      'neutral',
      'neutral',
      'neutral',
    ]);
  });
  test('trade times use UTC minutes and open status is translated', () => {
    expect(translate(tradeTime(1704067200), 'en')).toBe('2024-01-01 00:00');
    expect(translate(tradeTime(null), 'zh')).toBe('未平仓');
  });
  test('only net and open P&L use profit colors; missing report cells are muted', () => {
    expect(metricTone('Performance/Net profit', 10)).toBe('profit');
    expect(metricTone('Performance/Open PnL', -10)).toBe('loss');
    expect(metricTone('Performance/Gross loss', 10)).toBe('neutral');
    expect(metricTone('Performance/Net profit', undefined)).toBe('muted');
    expect(metricTone('Performance/Net profit', NaN)).toBe('muted');
  });
});
