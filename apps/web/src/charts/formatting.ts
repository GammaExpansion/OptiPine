import type { PriceFormatCustom } from 'lightweight-charts';
import { pricePrecision } from './model.ts';

const formatter = (precision: number, fixed = false) =>
  new Intl.NumberFormat('en-US', {
    minimumFractionDigits: fixed ? precision : 0,
    maximumFractionDigits: precision,
  });
const minus = (value: string) => value.replace('-', '−');

/** Change is measured from the preceding close, as in B1; the first/zero close has no ratio. */
export function barChange(close: number, previous: number | undefined): string | null {
  if (previous === undefined || previous === 0) return null;
  const value = ((close - previous) / previous) * 100;
  return minus(
    new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      signDisplay: 'always',
    }).format(value),
  );
}

/** Reserve the last-price badge's height plus half a tick label and a small visual gap. */
export function priceTickLabels(
  values: readonly number[],
  labels: string[],
  coordinate: (value: number) => number | null,
  lastPrice: number | undefined,
): string[] {
  const last = lastPrice === undefined ? null : coordinate(lastPrice);
  return labels.map((label, index) => {
    const tick = coordinate(values[index]);
    return last !== null && tick !== null && Math.abs(tick - last) < 16 ? '' : label;
  });
}

/** Find the least precision that preserves this tick grid, ignoring binary arithmetic noise. */
export function tickLabels(values: readonly number[], maxPrecision: number): string[] {
  let precision = 0;
  for (; precision < maxPrecision; precision++) {
    if (
      values.every((value) => {
        const scaled = value * 10 ** precision;
        return (
          Math.abs(scaled - Math.round(scaled)) < Math.max(1, Math.abs(scaled)) * Number.EPSILON * 8
        );
      })
    )
      break;
  }
  const number = formatter(precision);
  return values.map((value) => minus(number.format(Object.is(value, -0) ? 0 : value)));
}

/** Exact values use mintick precision; the axis grid gets only the decimals it needs. */
export function priceFormat(mintick: number) {
  const precision = pricePrecision(mintick);
  const number = formatter(precision, true);
  return {
    type: 'custom',
    minMove: mintick,
    formatter: (value: number) => minus(number.format(value)),
    tickmarksFormatter: (values: readonly number[]) => tickLabels(values, precision),
  } satisfies PriceFormatCustom;
}

/** Abbreviate drawdown ticks together, preserving distinct labels even at fractional thousands. */
export function drawdownTickLabels(
  values: readonly number[],
  thousands: (value: string) => string,
): string[] {
  if (!values.some((value) => Math.abs(value) >= 1000)) return tickLabels(values, 0);
  return tickLabels(
    values.map((value) => value / 1000),
    3,
  ).map((label, index) => (values[index] === 0 ? label : thousands(label)));
}
