import type { InputDescriptor, LiteralValue } from '@pine/engine';
import { message, type Text } from '@pine/messages';
import type { SearchChoice, SearchRow } from '../../../workflows/optimize-setup.ts';
import { inputEditText } from '../../backtest/sidebar/input-display.ts';

/** A list row's value on its chip: On and Off for a bool, numbers with the step's decimals. */
export function choiceText(descriptor: InputDescriptor, value: LiteralValue): Text {
  if (typeof value === 'boolean')
    return message(value ? 'optimize.setup.on' : 'optimize.setup.off');
  return inputEditText(descriptor, value);
}

/** A number in a range field with the input's decimals (Multiplier 1.00); empty when not a number. */
export function rangeText(descriptor: InputDescriptor, value: number): string {
  return Number.isNaN(value) ? '' : inputEditText(descriptor, value);
}

/** The number typed into a field: group separators allowed, NaN for anything else. */
export function parseNumber(raw: string): number {
  const trimmed = raw.trim().replaceAll(',', '');
  return trimmed ? Number(trimmed) : NaN;
}

/**
 * The chips a list row shows before "N more" (O4): kept values first, in declaration order, so the
 * values the run takes are in sight; the rest follow. A list of up to four shows every value.
 */
export function chipOrder(choices: readonly SearchChoice[]): {
  readonly visible: readonly LiteralValue[];
  readonly more: number;
} {
  const ordered = [
    ...choices.filter((choice) => choice.kept),
    ...choices.filter((choice) => !choice.kept),
  ].map((choice) => choice.value);
  const shown = ordered.length <= 4 ? ordered.length : 3;
  return { visible: ordered.slice(0, shown), more: ordered.length - shown };
}

export type RangeField = 'from' | 'to' | 'step';

/** The fields of a numeric row its error is about (O6): the step's own rules, or the bounds. */
export function invalidFields(row: SearchRow): ReadonlySet<RangeField> {
  const values = row.draft?.values;
  if (!row.error || values?.kind !== 'range') return new Set();
  const id = typeof row.error === 'object' && row.error.kind === 'message' ? row.error.id : null;
  if (id === 'searchIntegerStep' || id === 'searchStepPrecision') return new Set(['step']);
  if (id === 'searchRangeFinite') {
    const fields = new Set<RangeField>();
    if (!Number.isFinite(values.from)) fields.add('from');
    if (!Number.isFinite(values.to)) fields.add('to');
    if (!Number.isFinite(values.step) || values.step <= 0) fields.add('step');
    return fields;
  }
  return new Set(['from', 'to']);
}
