import type { LiteralValue } from '@pine/engine';
import { message, type Message, type Text } from '@pine/messages';
import { formatDate, formatNumber } from '../../../../i18n/translate.ts';

export function windowLabel(index: number): Message {
  return message('optimize.wfResults.windowLabel', { number: index + 1 });
}

export function figure(value: number | null | undefined, digits = 0, signed = false): Message {
  return value == null || !Number.isFinite(value)
    ? message('optimize.wfResults.missing')
    : message('optimize.wfResults.value', {
        value: formatNumber(value, {
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
          signDisplay: signed ? 'exceptZero' : 'auto',
        }),
      });
}

export function compactNet(value: number | null | undefined): Message {
  return value == null || !Number.isFinite(value)
    ? message('optimize.wfResults.missing')
    : message('optimize.wfResults.value', {
        value: formatNumber(value, {
          notation: 'compact',
          maximumFractionDigits: 1,
          signDisplay: 'exceptZero',
        }).toLowerCase(),
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

export function parameterValue(value: LiteralValue): Text {
  if (typeof value === 'boolean')
    return message(value ? 'optimize.wfResults.on' : 'optimize.wfResults.off');
  if (typeof value === 'number')
    return message('optimize.wfResults.value', { value: formatNumber(value) });
  return value === null ? message('optimize.wfResults.missing') : value;
}

/** Titles are script data; labels, separators and boolean values belong to the catalogs. */
export function parameterSet(
  parameters: Readonly<Record<string, LiteralValue>> | null,
  named = false,
): Text {
  if (!parameters) return message('optimize.wfResults.missing');
  return {
    kind: 'message-group',
    separator: message(named ? 'optimize.wfResults.setSeparator' : 'optimize.wfResults.separator'),
    parts: Object.entries(parameters).map(([title, value]) =>
      named
        ? message('optimize.wfResults.parameter', { title, value: parameterValue(value) })
        : parameterValue(value),
    ),
  };
}
