import { missing } from './numeric.ts';

/** Round the exact IEEE-754 value to a decimal integer, with half-even ties. */
function scaledInteger(value: number, digits: number): bigint {
  const bytes = new DataView(new ArrayBuffer(8));
  bytes.setFloat64(0, Math.abs(value));
  const bits = bytes.getBigUint64(0);
  const exponent = Number((bits >> 52n) & 0x7ffn);
  const significand = (bits & ((1n << 52n) - 1n)) + (exponent ? 1n << 52n : 0n);
  const shift = (exponent || 1) - 1023 - 52 + digits;
  let numerator = significand * 5n ** BigInt(digits);
  if (shift >= 0) return numerator << BigInt(shift);
  const denominator = 1n << BigInt(-shift);
  const integer = numerator / denominator;
  const remainder = numerator % denominator;
  return (
    integer +
    (remainder * 2n > denominator || (remainder * 2n === denominator && integer % 2n === 1n)
      ? 1n
      : 0n)
  );
}

function scaledDecimalInteger(value: number, digits: number): bigint {
  const [coefficient, exponent = '0'] = Math.abs(value).toString().split('e');
  const fractionalDigits = coefficient.split('.')[1]?.length ?? 0;
  const integer = BigInt(coefficient.replace('.', ''));
  const shift = Number(exponent) - fractionalDigits + digits;
  if (shift >= 0) return integer * 10n ** BigInt(shift);
  const divisor = 10n ** BigInt(-shift);
  return integer / divisor + ((integer % divisor) * 2n >= divisor ? 1n : 0n);
}

export function decimal(
  value: number,
  pattern: string,
  rounding: 'binary-even' | 'decimal-away' = 'binary-even',
): string {
  if (missing(value)) return 'NaN';
  const [integerPattern, fractionPattern = ''] = pattern.split('.');
  const digits = fractionPattern.length;
  const required = fractionPattern.replace(/#/g, '').length;
  const scaled = (
    rounding === 'binary-even' ? scaledInteger(value, digits) : scaledDecimalInteger(value, digits)
  )
    .toString()
    .padStart(digits + 1, '0');
  let whole = digits ? scaled.slice(0, -digits) : scaled;
  const fraction = (digits ? scaled.slice(-digits) : '').replace(/0+$/, '').padEnd(required, '0');
  whole = whole.padStart(integerPattern.replace(/[^0]/g, '').length, '0');
  if (integerPattern.includes(',')) whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (value < 0 || Object.is(value, -0) ? '-' : '') + whole + (fraction ? '.' + fraction : '');
}

/** Decimal places of a tick, including ticks that stringify in exponent form such as 1e-7. */
export function tickDigits(tick: number): number {
  if (!(tick > 0) || !Number.isFinite(tick)) return 0;
  const [coefficient, exponent = '0'] = tick.toString().toLowerCase().split('e');
  return Math.max(0, (coefficient.split('.')[1] ?? '').length - Number(exponent));
}

export function tostring(value: unknown, pattern?: string, tick = 0.01, version = 6): string {
  if (missing(value)) return 'NaN';
  if (typeof value !== 'number') return String(value);
  if (!pattern) {
    if (version === 5 || value === 0 || Math.abs(value) >= 1e21) return String(value);
    return decimal(value, '#.##########', 'decimal-away');
  }
  if (pattern === 'format.mintick') {
    const digits = tickDigits(tick);
    return decimal(
      Math.sign(value) * Math.round(Math.abs(value) / tick) * tick,
      digits ? `0.${'0'.repeat(digits)}` : '0',
      'decimal-away',
    );
  }
  if (pattern === 'format.percent') return decimal(value, '#.##', 'decimal-away') + '%';
  if (pattern === 'format.volume') {
    for (const [scale, suffix] of [
      [1e12, 'T'],
      [1e9, 'B'],
      [1e6, 'M'],
      [1e3, 'K'],
    ] as const)
      if (Math.abs(value) >= scale) return decimal(value / scale, '#.###', 'decimal-away') + suffix;
    return decimal(value, '#.###', 'decimal-away');
  }
  return decimal(value, pattern, 'decimal-away');
}
