import { formatNumber } from '../../../i18n/translate.ts';

/** Compact net-profit ticks use the boards' lowercase k, minus sign and explicit positive sign. */
export function axisLabel(value: number, signed = true): string {
  return formatNumber(value, {
    notation: 'compact',
    maximumFractionDigits: 10,
    signDisplay: signed ? 'exceptZero' : 'auto',
  })
    .replace('K', 'k')
    .replace('-', '−');
}
