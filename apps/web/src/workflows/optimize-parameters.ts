import type { LiteralValue } from '@pine/engine';
import { message, type Text } from '@pine/messages';
import type { SearchRow } from './optimize-setup.ts';

function decimals(value: number): number {
  const [mantissa, exponent = '0'] = String(value).split('e');
  return Math.max(0, (mantissa.split('.')[1]?.length ?? 0) - Number(exponent));
}

/** Use the run's search step, falling back to the input step; never round away an offset value. */
export function parameterText(value: LiteralValue | undefined, row?: SearchRow): Text {
  if (value == null || (typeof value === 'number' && !Number.isFinite(value)))
    return message('common.unavailable');
  if (typeof value === 'boolean') return message(value ? 'inputs.on' : 'inputs.off');
  if (typeof value !== 'number') return String(value);
  const step =
    row?.status === 'searched' && row.draft?.values.kind === 'range'
      ? row.draft.values.step
      : row?.descriptor.step;
  const precision = Math.min(
    100,
    Math.max(decimals(value), step && Number.isFinite(step) && step > 0 ? decimals(step) : 0),
  );
  return value.toFixed(precision);
}

/** Display only searched inputs, in declaration order; the original set still applies fixed inputs. */
export function searchedParameters(
  parameters: Readonly<Record<string, LiteralValue>>,
  rows: readonly SearchRow[],
): { title: string; value: LiteralValue }[] {
  return rows
    .filter((row) => row.status === 'searched' && Object.hasOwn(parameters, row.descriptor.title))
    .map((row) => ({ title: row.descriptor.title, value: parameters[row.descriptor.title] }));
}
