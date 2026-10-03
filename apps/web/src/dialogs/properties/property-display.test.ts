import { describe } from '@pine/engine';
import { expect, test } from 'vitest';
import { translate } from '../../i18n/translate.ts';
import {
  propertyFields,
  scriptProperties,
  type PropertyOverrides,
} from '../../workflows/properties.ts';
import {
  editText,
  optionValues,
  parseEditText,
  scriptSummaryText,
  scriptValueText,
  summaryIds,
  summaryOverridden,
  summaryText,
  valueText,
} from './property-display.ts';

const script = scriptProperties(
  describe(`//@version=6
strategy("Props", initial_capital = 100000, default_qty_type = strategy.percent_of_equity,
     default_qty_value = 100, commission_type = strategy.commission.percent,
     commission_value = 0.1, slippage = 0, pyramiding = math.max(0, 1))
plot(close)`),
);
const fields = (overrides: PropertyOverrides = {}) => propertyFields(script, overrides);
const en = (text: Parameters<typeof translate>[0] | null) => (text ? translate(text, 'en') : null);

test('the summary states B1’s rows with their units', () => {
  const rows = summaryIds.map((id) => en(summaryText(fields(), id, 'USD')));
  expect(rows).toEqual([
    '100,000 USD',
    '100% of equity',
    null,
    '0.1%',
    '0 ticks',
    'On bar close',
    'Fill on touch',
  ]);
  const other = fields({
    orderSizeUnit: 'cash',
    orderSize: 2500,
    commissionUnit: 'cash_per_order',
  });
  expect(en(summaryText(other, 'orderSize', 'USDT'))).toBe('2,500 USDT');
  expect(en(summaryText(other, 'commission', 'USD'))).toBe('0.1 per order');
  expect(
    en(summaryText(fields({ orderSizeUnit: 'fixed', orderSize: 1 }), 'orderSize', 'USD')),
  ).toBe('1 contract');
});

test('an override is marked with the script’s value, including a unit override', () => {
  const overridden = fields({ slippage: 1, orderSizeUnit: 'cash' });
  expect(summaryOverridden(overridden, 'slippage')).toBe(true);
  expect(summaryOverridden(overridden, 'orderSize')).toBe(true);
  expect(summaryOverridden(overridden, 'commission')).toBe(false);
  expect(en(summaryText(overridden, 'slippage', 'USD'))).toBe('1 tick');
  expect(en(scriptSummaryText(overridden, 'slippage', 'USD'))).toBe('0 ticks');
  expect(en(scriptSummaryText(overridden, 'orderSize', 'USD'))).toBe('100% of equity');
  const pyramiding = fields({ pyramiding: 2 }).find((field) => field.id === 'pyramiding')!;
  expect(scriptValueText(pyramiding)).toBeNull();
  const slippage = overridden.find((field) => field.id === 'slippage')!;
  expect(en(scriptValueText(slippage))).toBe('0 ticks');
});

test('option labels and values, in both languages', () => {
  expect(en(valueText('orderDelay', 'none'))).toBe('None (same bar)');
  expect(translate(valueText('scriptExecution', 'everyTick'), 'zh')).toBe('每个 tick');
  expect(en(valueText('limitFillTicks', 2))).toBe('2 ticks through');
  expect(en(valueText('longLeverage', Infinity))).toBe('∞');
  expect(optionValues('commissionUnit', 'percent')).toEqual([
    'percent',
    'cash_per_contract',
    'cash_per_order',
  ]);
  expect(optionValues('limitFillTicks', 0)).toEqual([0, 1, 2, 3, 4, 5]);
  expect(optionValues('limitFillTicks', 12)).toEqual([0, 1, 2, 3, 4, 5, 12]);
});

test('number fields group digits, accept them back, and show unlimited leverage as ∞', () => {
  expect(editText(100000)).toBe('100,000');
  expect(editText(0.1)).toBe('0.1');
  expect(editText(Infinity)).toBe('∞');
  expect(editText(NaN)).toBe('');
  expect(editText(undefined)).toBe('');
  expect(parseEditText('initialCapital', '100,000')).toBe(100000);
  expect(parseEditText('longLeverage', '∞')).toBe(Infinity);
  expect(parseEditText('initialCapital', '∞')).toBeNaN();
  expect(parseEditText('slippage', ' ')).toBeNaN();
});
