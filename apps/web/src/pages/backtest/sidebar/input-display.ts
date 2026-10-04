import type { InputDescriptor, LiteralValue } from '@pine/engine';
import { message, type MessageValues, type Text } from '@pine/messages';
import type { MessageId } from '../../../i18n/translate.ts';
import type { InputField } from '../../../workflows/inputs.ts';
import { timeframeLabel } from '../states/chart-view.ts';

const text = (id: MessageId, values?: MessageValues) => message(id, values);

/** The built-in series an `input.source` selects; `@pine/engine` exports the same list. */
export const sourceSeries = [
  'open',
  'high',
  'low',
  'close',
  'hl2',
  'hlc3',
  'ohlc4',
  'hlcc4',
] as const;

/**
 * The timeframes an `input.timeframe` without options offers, as TradingView's list does: the
 * chart's own (an empty string) and the usual ones from one minute to one month.
 */
export const timeframeChoices = [
  '',
  '1',
  '3',
  '5',
  '15',
  '30',
  '45',
  '60',
  '120',
  '180',
  '240',
  '1D',
  '1W',
  '1M',
] as const;

export type InputControl = 'number' | 'select' | 'toggle' | 'time' | 'text' | 'readOnly';

// The workflow's numeric types, less `time`, which is edited as a UTC date and time.
const numberTypes = new Set(['int', 'float', 'number', 'price']);

/** The control the right panel uses for an input (B14). */
export function inputControl(field: InputField): InputControl {
  const { type, options } = field.descriptor;
  if (field.readOnly) return 'readOnly';
  if (options || type === 'source' || type === 'timeframe') return 'select';
  if (type === 'bool' || type === 'boolean') return 'toggle';
  if (type === 'time') return 'time';
  return numberTypes.has(type) ? 'number' : 'text';
}

function decimals(value: number): number {
  const [mantissa, exponent = '0'] = String(value).toLowerCase().split('e');
  return Math.max(0, (mantissa.split('.')[1]?.length ?? 0) - Number(exponent));
}

/** As many decimals as the step declares, so Multiplier with step 0.25 reads 2.00 (B1). */
function formatNumberValue(descriptor: InputDescriptor, value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const places = Math.min(10, Math.max(decimals(descriptor.step ?? 1), decimals(value)));
  return value.toFixed(places);
}

const pad = (value: number) => String(value).padStart(2, '0');

/** Unix milliseconds as `YYYY-MM-DD HH:MM` in UTC, as an `input.time` field shows them. */
export function formatTime(value: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

/**
 * The text a field holds: numbers with the step's decimals, time as a UTC date and time, and an
 * invalid draft as typed. Empty for a value the script computes.
 */
export function inputEditText(descriptor: InputDescriptor, value: LiteralValue | undefined) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'number') return String(value);
  return descriptor.type === 'time' ? formatTime(value) : formatNumberValue(descriptor, value);
}

/**
 * A value for display beside a field, a line of code or the outdated banner: booleans read on and
 * off, numbers with the step's decimals. Without a descriptor, as for an input the script no
 * longer declares, a number reads as it is.
 */
export function inputValueText(
  descriptor: InputDescriptor | undefined,
  value: LiteralValue | undefined,
): Text {
  if (value === undefined || value === null) return text('common.unavailable');
  if (typeof value === 'boolean') return text(value ? 'inputs.on' : 'inputs.off');
  if (!descriptor) return String(value);
  if (descriptor.type === 'timeframe' && typeof value === 'string')
    return value === '' ? text('inputs.chartTimeframe') : timeframeLabel(value);
  return inputEditText(descriptor, value);
}

const timePattern = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/;

/**
 * The value an edit sends to the session. Text that is not a number (or, for a time input, not a
 * UTC date) is sent as typed, so the workflow reports it and blocks the run until it is fixed.
 */
export function parseInputText(descriptor: InputDescriptor, raw: string): LiteralValue {
  const trimmed = raw.trim();
  if (descriptor.type === 'time') {
    const match = timePattern.exec(trimmed);
    if (!match) return raw;
    const [year, month, day, hours, minutes] = match.slice(1).map((part) => Number(part ?? 0));
    const time = Date.UTC(year, month - 1, day, hours, minutes);
    return formatTime(time) === `${match[1]}-${match[2]}-${match[3]} ${pad(hours)}:${pad(minutes)}`
      ? time
      : raw;
  }
  if (numberTypes.has(descriptor.type)) {
    const value = trimmed ? Number(trimmed) : NaN;
    return Number.isFinite(value) ? value : raw;
  }
  return raw;
}

/** The caption beside a label: the default once changed, otherwise the range or step (B1, B14). */
export function inputHint(field: InputField): Text | null {
  const { descriptor } = field;
  if (field.readOnly) return null;
  if (field.changed)
    return text('inputs.default', { value: inputValueText(descriptor, descriptor.defaultValue) });
  const { min, max, step } = descriptor;
  const bound = (value: number) => inputEditText(descriptor, value);
  if (min !== undefined && max !== undefined)
    return text('inputs.range', { min: bound(min), max: bound(max) });
  if (step !== undefined) return text('inputs.step', { step: String(step) });
  if (min !== undefined) return text('inputs.min', { min: bound(min) });
  if (max !== undefined) return text('inputs.max', { max: bound(max) });
  return null;
}

/** The message under a field; a time input that is not a date explains the expected format. */
export function inputError(field: InputField): Text | null {
  if (field.descriptor.type === 'time' && typeof field.value === 'string')
    return text('inputs.timeInvalid');
  return field.error;
}

/**
 * A select's values: the declared options, or the timeframes or built-in series an input of that
 * type offers, keeping an unlisted value.
 */
export function selectValues(field: InputField): LiteralValue[] {
  const { options, type } = field.descriptor;
  const values: LiteralValue[] = [
    ...(options ?? (type === 'timeframe' ? timeframeChoices : sourceSeries)),
  ];
  const current = field.value;
  if (current !== undefined && !values.some((value) => Object.is(value, current)))
    values.push(current);
  return values;
}

/** Inputs in declaration order, a new section wherever the declared group changes (B1). */
export function inputSections(
  fields: readonly InputField[],
): { readonly group: string | null; readonly fields: InputField[] }[] {
  const sections: { group: string | null; fields: InputField[] }[] = [];
  for (const field of fields) {
    const group = field.descriptor.group ?? null;
    const last = sections.at(-1);
    if (last && last.group === group) last.fields.push(field);
    else sections.push({ group, fields: [field] });
  }
  return sections;
}
