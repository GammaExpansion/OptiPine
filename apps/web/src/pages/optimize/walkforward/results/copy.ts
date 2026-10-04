import type { LiteralValue } from '@pine/engine';
import { message, type Message, type Text } from '@pine/messages';
import { formatDate, formatNumber } from '../../../../i18n/translate.ts';
import { parameterText, searchedParameters } from '../../../../workflows/optimize-parameters.ts';
import type { SearchRow } from '../../../../workflows/optimize-setup.ts';

/** Negatives take a true minus sign, as the leaderboard's figures do. */
export const minus = (value: string) => value.replace('-', '−');

export function windowLabel(index: number): Message {
  return message('optimize.wfResults.windowLabel', { number: index + 1 });
}

export function figure(value: number | null | undefined, digits = 0, signed = false): Message {
  return value == null || !Number.isFinite(value)
    ? message('optimize.wfResults.missing')
    : message('optimize.wfResults.value', {
        value: minus(
          formatNumber(value, {
            minimumFractionDigits: digits,
            maximumFractionDigits: digits,
            signDisplay: signed ? 'exceptZero' : 'auto',
          }),
        ),
      });
}

export function compactNet(value: number | null | undefined): Message {
  return value == null || !Number.isFinite(value)
    ? message('optimize.wfResults.missing')
    : message('optimize.wfResults.value', {
        value: minus(
          formatNumber(value, {
            notation: 'compact',
            maximumFractionDigits: 1,
            signDisplay: 'exceptZero',
          }).toLowerCase(),
        ),
      });
}

/** Plans are half-open UTC ranges; the last displayed date is inside the window. */
export function dateRange(start: number, end: number, compact = false): Message {
  const from = formatDate(start * 1000);
  const to = formatDate(Math.max(start, end - 1) * 1000);
  return message('optimize.wfResults.range', {
    from: compact ? from.slice(2) : from,
    to: compact ? to.slice(from.slice(0, 4) === to.slice(0, 4) ? 5 : 2) : to,
  });
}

/** The searched inputs of a set in declaration order, each at its search step's precision. */
export function shownParameters(
  parameters: Readonly<Record<string, LiteralValue>>,
  rows: readonly SearchRow[],
): { title: string; value: Text }[] {
  return searchedParameters(parameters, rows).map(({ title, value }) => ({
    title,
    value: parameterText(
      value,
      rows.find((row) => row.descriptor.title === title),
    ),
  }));
}

/**
 * A window's set as W1 writes it (`shownParameters`), with titles when `named`. Titles are script
 * data; separators and boolean values belong to the catalogs.
 */
export function parameterSet(
  parameters: Readonly<Record<string, LiteralValue>> | null,
  rows: readonly SearchRow[],
  named = false,
): Text {
  if (!parameters) return message('optimize.wfResults.missing');
  return {
    kind: 'message-group',
    separator: message(named ? 'optimize.wfResults.setSeparator' : 'optimize.wfResults.separator'),
    parts: shownParameters(parameters, rows).map(({ title, value }) =>
      named ? message('optimize.wfResults.parameter', { title, value }) : value,
    ),
  };
}
