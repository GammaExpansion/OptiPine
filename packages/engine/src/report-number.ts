const decimalFormats = Array.from(
  { length: 9 },
  (_, index) =>
    new Intl.NumberFormat('en-US', {
      maximumSignificantDigits: index + 1,
      useGrouping: false,
      roundingMode: 'halfEven',
    }),
);

/**
 * Report result amounts are serialized through a float32 and its shortest decimal
 * round-trip representation before the final display precision is applied. This is a
 * reporting conversion, not the engine's arithmetic representation. Prices and position
 * sizes use their separately preserved market precision and must not use this adapter.
 */
export function reportNumber(value: number): number {
  if (!Number.isFinite(value)) return value;
  const single = Math.fround(value);
  if (!Number.isFinite(single)) return value;
  for (const format of decimalFormats) {
    const decimal = Number(format.format(single));
    if (Math.fround(decimal) === single) return decimal;
  }
  return single;
}
