import { message, type MessageValues, type Text } from '@pine/messages';
import { formatNumber, type MessageId } from '../../i18n/translate.ts';
import {
  propertyOptions,
  type PropertyField,
  type PropertyId,
  type PropertyValues,
} from '../../workflows/properties.ts';

const text = (id: MessageId, values?: MessageValues) => message(id, values);

/** The Properties summary in the right panel, in B1's order. */
export const summaryIds = [
  'initialCapital',
  'orderSize',
  'pyramiding',
  'commission',
  'slippage',
  'scriptExecution',
  'limitFillTicks',
] as const satisfies readonly PropertyId[];

/** Leverage is 100 / margin; a margin of 0 is unlimited leverage. */
const unlimited = '∞';
/** Limit order choices beyond a script's own value: fill on touch, or 1 to 5 ticks through. */
const limitChoices = [0, 1, 2, 3, 4, 5];

const ticks = (value: number) =>
  text(value === 1 ? 'properties.tickValue' : 'properties.ticksValue', {
    value: formatNumber(value),
  });

/** One property's value as the dialog and the summary state it, without its unit. */
export function valueText<K extends PropertyId>(id: K, value: PropertyValues[K]): Text {
  switch (id) {
    case 'orderSizeUnit':
      return text(`properties.unit.${value as PropertyValues['orderSizeUnit']}`);
    case 'commissionUnit':
      return text(`properties.commission.${value as PropertyValues['commissionUnit']}`);
    case 'scriptExecution':
      return text(`properties.execution.${value as PropertyValues['scriptExecution']}`);
    case 'orderDelay':
      return text(`properties.delay.${value as PropertyValues['orderDelay']}`);
    case 'limitFillTicks':
      return limitText(value as number);
    case 'slippage':
      return ticks(value as number);
    case 'longLeverage':
    case 'shortLeverage':
      return value === Infinity ? unlimited : formatNumber(value as number);
    default:
      return formatNumber(value as number);
  }
}

function limitText(value: number): Text {
  if (value === 0) return text('properties.limit.touch');
  return value === 1
    ? text('properties.limit.one')
    : text('properties.limit.many', { count: formatNumber(value) });
}

const valueOf = <K extends PropertyId>(fields: readonly PropertyField[], id: K) =>
  fields.find((field) => field.id === id)?.value as PropertyValues[K] | undefined;

/**
 * A summary row's value with its unit, such as "100% of equity" or "0.1%"; null while the
 * script computes it.
 */
export function summaryText(
  fields: readonly PropertyField[],
  id: (typeof summaryIds)[number],
  currency: string,
): Text | null {
  const value = valueOf(fields, id);
  if (value === undefined) return null;
  if (id === 'initialCapital')
    return text('properties.cashAmount', { value: formatNumber(value as number), currency });
  if (id === 'orderSize') {
    const amount = formatNumber(value as number);
    switch (valueOf(fields, 'orderSizeUnit')) {
      case 'percent_of_equity':
        return text('properties.percentOfEquity', { value: amount });
      case 'cash':
        return text('properties.cashAmount', { value: amount, currency });
      default:
        return text(value === 1 ? 'properties.contract' : 'properties.contracts', {
          value: amount,
        });
    }
  }
  if (id === 'commission') {
    const amount = formatNumber(value as number);
    const unit = valueOf(fields, 'commissionUnit');
    return text(
      unit === 'cash_per_contract'
        ? 'properties.perContract'
        : unit === 'cash_per_order'
          ? 'properties.perOrder'
          : 'properties.percent',
      { value: amount },
    );
  }
  return valueText(id, value);
}

/** A summary row is overridden when its value or its unit is. */
export function summaryOverridden(
  fields: readonly PropertyField[],
  id: (typeof summaryIds)[number],
): boolean {
  const units: Partial<Record<PropertyId, PropertyId>> = {
    orderSize: 'orderSizeUnit',
    commission: 'commissionUnit',
  };
  return fields.some((field) => field.overridden && (field.id === id || field.id === units[id]));
}

/** A summary row as the script states it, for "script 0" (B1); null when the script computes it. */
export function scriptSummaryText(
  fields: readonly PropertyField[],
  id: (typeof summaryIds)[number],
  currency: string,
): Text | null {
  const scriptFields = fields.map((field) => ({
    ...field,
    value: field.script.kind === 'value' ? field.script.value : undefined,
  }));
  return summaryText(scriptFields as PropertyField[], id, currency);
}

/**
 * The script's own value, for "the script value is 0" (B13); null when the script computes it.
 */
export function scriptValueText(field: PropertyField): Text | null {
  return field.script.kind === 'value' ? valueText(field.id, field.script.value) : null;
}

/** The text of a numeric property's field: grouped as in B13, and ∞ for unlimited leverage. */
export function editText(value: number | undefined): string {
  if (value === undefined) return '';
  return value === Infinity ? unlimited : Number.isNaN(value) ? '' : formatNumber(value);
}

/**
 * The number an edit sends, group separators allowed; NaN for text that is not a number, which
 * the workflow then reports.
 */
export function parseEditText(id: PropertyId, raw: string): number {
  const trimmed = raw.trim().replaceAll(',', '');
  if ((id === 'longLeverage' || id === 'shortLeverage') && trimmed === unlimited) return Infinity;
  return trimmed ? Number(trimmed) : NaN;
}

/** The choices of an option property's select; limit orders keep a value outside the list. */
export function optionValues(
  id: keyof typeof propertyOptions | 'limitFillTicks',
  current: unknown,
): readonly (string | number)[] {
  if (id !== 'limitFillTicks') return propertyOptions[id];
  return typeof current === 'number' && !limitChoices.includes(current)
    ? [...limitChoices, current].sort((a, b) => a - b)
    : limitChoices;
}
