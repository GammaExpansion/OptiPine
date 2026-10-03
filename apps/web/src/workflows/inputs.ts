import type { InputDescriptor, InputFixedReason, LiteralValue } from '@pine/engine';
import type { Message } from '@pine/messages';
import { workflowMessage, type WorkflowMessageId } from './messages.ts';

/**
 * Where a parameter set written into the inputs came from (B17): a leaderboard row, with its rank
 * when it was picked, or a failed combination opened to read its diagnostics (R11).
 */
export type ParameterOrigin =
  | {
      readonly kind: 'rank';
      readonly optimizationId: number;
      readonly trialId: string;
      readonly rank: number;
    }
  | { readonly kind: 'failed'; readonly optimizationId: number; readonly trialId: string };

/** One script input in the right panel, in declaration order (B14). */
export interface InputField {
  readonly descriptor: InputDescriptor;
  /**
   * The value a run uses. A read-only input shows its literal default, or nothing when the
   * script computes it: `describe` does not evaluate expressions.
   */
  readonly value: LiteralValue | undefined;
  /** The value differs from the script's default, so the panel shows the default beside it. */
  readonly changed: boolean;
  /** Why the value cannot be run, shown under the field. */
  readonly error: Message | null;
  /** Why the input is read-only; null for an input the panel can edit. */
  readonly readOnly: Message | null;
  /** The parameter set that wrote the value; cleared when the user edits or resets it (B17). */
  readonly origin: ParameterOrigin | null;
}

// The same type groups as @pine/optimizer's search ranges, so both pages accept the same values.
const numericTypes = new Set(['int', 'float', 'number', 'price', 'time']);
const integerTypes = new Set(['int', 'time']);
const booleanTypes = new Set(['bool', 'boolean']);
const textTypes = new Set(['string', 'text_area', 'symbol', 'session', 'timeframe', 'source']);

const range = String.raw`(?:[01]\d|2[0-4])[0-5]\d-(?:[01]\d|2[0-4])[0-5]\d`;
/** `HHMM-HHMM` ranges joined by commas with optional `:days`, or `24x7`, as Pine accepts. */
const sessionPattern = new RegExp(`^(?:24x7|${range}(?:,${range})*(?::[1-7]{1,7})?)$`);
/** A Pine timeframe such as `60`, `1D` or `W`; empty means the chart's timeframe. */
const timeframePattern = /^(?:|[1-9]\d*[SDWM]?|[DWM])$/;

const fixedReasons: Record<InputFixedReason, WorkflowMessageId> = {
  'computed-default': 'backtest.inputFixedComputedDefault',
  'computed-title': 'backtest.inputFixedComputedTitle',
  'unsupported-type': 'backtest.inputFixedUnsupportedType',
  'computed-options': 'backtest.inputFixedComputedOptions',
  'duplicate-title': 'backtest.inputFixedDuplicateTitle',
};

const optionKey = (value: LiteralValue): string => JSON.stringify(value);

/** The reason a run cannot use `value` for this input, or null when it can. */
export function validateInputValue(
  descriptor: InputDescriptor,
  value: LiteralValue | undefined,
): Message | null {
  const title = descriptor.title;
  if (numericTypes.has(descriptor.type)) {
    if (typeof value !== 'number' || !Number.isFinite(value))
      return workflowMessage(
        integerTypes.has(descriptor.type)
          ? 'backtest.inputIntegerRequired'
          : 'backtest.inputNumberRequired',
        { title },
      );
    if (integerTypes.has(descriptor.type) && !Number.isSafeInteger(value))
      return workflowMessage('backtest.inputIntegerRequired', { title });
    if (descriptor.min !== undefined && value < descriptor.min)
      return workflowMessage('backtest.inputBelowMin', { title, min: descriptor.min });
    if (descriptor.max !== undefined && value > descriptor.max)
      return workflowMessage('backtest.inputAboveMax', { title, max: descriptor.max });
  } else if (booleanTypes.has(descriptor.type)) {
    if (typeof value !== 'boolean')
      return workflowMessage('backtest.inputBooleanRequired', { title });
  } else if (textTypes.has(descriptor.type) && typeof value !== 'string') {
    return workflowMessage('backtest.inputTextRequired', { title });
  }
  if (descriptor.options) {
    if (!descriptor.options.some((option) => optionKey(option) === optionKey(value ?? null)))
      return workflowMessage('backtest.inputNotOption', { title });
  } else if (descriptor.type === 'session' && !sessionPattern.test(String(value))) {
    return workflowMessage('backtest.inputSessionInvalid', { title });
  } else if (descriptor.type === 'timeframe' && !timeframePattern.test(String(value))) {
    return workflowMessage('backtest.inputTimeframeInvalid', { title });
  }
  return null;
}

/** Why a run cannot override an input: the script computes it or declares it unsupportedly. */
export function fixedInputReason(descriptor: InputDescriptor): Message {
  return workflowMessage(
    fixedReasons[descriptor.reason ?? 'computed-default'],
    descriptor.reason === 'unsupported-type' ? { type: descriptor.type } : {},
  );
}

function field(
  descriptor: InputDescriptor,
  value: LiteralValue | undefined,
  origin: ParameterOrigin | null = null,
): InputField {
  if (descriptor.fixed)
    return {
      descriptor,
      value: descriptor.defaultValue,
      changed: false,
      error: null,
      readOnly: fixedInputReason(descriptor),
      origin: null,
    };
  return {
    descriptor,
    value,
    changed: value !== descriptor.defaultValue,
    error: validateInputValue(descriptor, value),
    readOnly: null,
    origin,
  };
}

/**
 * Fields for a new compile. An editable input keeps its previous value, and where that value came
 * from, when an editable input with the same title and type existed before; every other input
 * starts at its default.
 */
export function inputFields(
  descriptors: readonly InputDescriptor[],
  previous: readonly InputField[] = [],
): InputField[] {
  return descriptors.map((descriptor) => {
    const kept = descriptor.fixed
      ? undefined
      : previous.find(
          (item) =>
            !item.readOnly &&
            item.descriptor.title === descriptor.title &&
            item.descriptor.type === descriptor.type,
        );
    return kept
      ? field(descriptor, kept.value, kept.origin)
      : field(descriptor, descriptor.defaultValue);
  });
}

/** Set an editable input by title; read-only inputs and unknown titles are left unchanged. */
export function setInputValue(
  fields: readonly InputField[],
  title: string,
  value: LiteralValue,
): InputField[] {
  return fields.map((item) =>
    item.readOnly || item.descriptor.title !== title ? item : field(item.descriptor, value),
  );
}

export function resetInputValues(fields: readonly InputField[]): InputField[] {
  return fields.map((item) =>
    item.changed || item.origin ? field(item.descriptor, item.descriptor.defaultValue) : item,
  );
}

/**
 * Write a parameter set, keyed by title, into the inputs and note where each value came from.
 * Read-only inputs, inputs the set does not name and names the script no longer has stay as
 * they are.
 */
export function applyInputValues(
  fields: readonly InputField[],
  values: Readonly<Record<string, LiteralValue>>,
  origin: ParameterOrigin,
): InputField[] {
  return fields.map((item) =>
    item.readOnly || !Object.hasOwn(values, item.descriptor.title)
      ? item
      : field(item.descriptor, values[item.descriptor.title], origin),
  );
}

/** The overrides a run passes to the engine: every editable input's value, keyed by title. */
export function inputValues(fields: readonly InputField[]): Record<string, LiteralValue> {
  // Titles are script-chosen: without a prototype, "__proto__" is an ordinary key.
  const values: Record<string, LiteralValue> = Object.create(null);
  for (const item of fields)
    if (!item.readOnly && item.value !== undefined) values[item.descriptor.title] = item.value;
  return values;
}

function decimals(value: number): number {
  const [mantissa, exponent = '0'] = String(value).toLowerCase().split('e');
  return Math.max(0, (mantissa.split('.')[1]?.length ?? 0) - Number(exponent));
}

/**
 * The value the stepper moves to: one step up or down, kept within min and max. Without a
 * declared step it moves by 1 (0.01 for a price), the default @pine/optimizer uses for ranges.
 * The sum is rounded to the decimals of the value and step, so 0.1 steps never drift.
 */
export function stepInputValue(
  descriptor: InputDescriptor,
  value: LiteralValue | undefined,
  direction: 1 | -1,
): number {
  const step = descriptor.step ?? (descriptor.type === 'price' ? 0.01 : 1);
  const base =
    typeof value === 'number' && Number.isFinite(value)
      ? value
      : typeof descriptor.defaultValue === 'number'
        ? descriptor.defaultValue
        : 0;
  const places = Math.min(20, Math.max(decimals(base), decimals(step)));
  let next = Number((base + direction * step).toFixed(places));
  if (integerTypes.has(descriptor.type)) next = Math.round(next);
  if (descriptor.min !== undefined) next = Math.max(descriptor.min, next);
  if (descriptor.max !== undefined) next = Math.min(descriptor.max, next);
  return next;
}
