import { mean, missing, mode, num, percentile, sum, variance } from './numeric.ts';
import { decimal, tostring } from './format.ts';
import type { MutationJournal } from './rollback.ts';
import { arrayBuiltin, collectionSize, matrixBuiltin, mapBuiltin } from './collections.ts';

/** Pine strings are limited to 4096 characters; str.repeat is the one builtin that multiplies. */
const MAX_STRING_LENGTH = 4096;

export function round(value: number, precision = 0, version = 6): number {
  if (missing(value)) return NaN;
  if (version === 5) {
    const [coefficient, exponent = '0'] = Math.abs(value).toString().split('e');
    const shifted = Number(coefficient + 'e' + (Number(exponent) + precision));
    return (Math.sign(value) * Math.floor(shifted + 0.5)) / 10 ** precision;
  }
  const scale = 10 ** precision;
  return (
    (Math.sign(value) *
      Math.floor(Math.abs(value) * scale + 0.5 + Number.EPSILON * Math.abs(value) * scale)) /
    scale
  );
}
export const colors: Record<string, number> = {
  red: 0xf23645,
  green: 0x4caf50,
  blue: 0x2962ff,
  orange: 0xff9800,
  gray: 0x787b86,
  white: 0xffffff,
  black: 0x363a45,
  yellow: 0xfdd835,
  purple: 0x9c27b0,
  aqua: 0x00bcd4,
  lime: 0x00e676,
  maroon: 0x880e4f,
  navy: 0x311b92,
  olive: 0x808000,
  silver: 0xb2b5be,
  teal: 0x089981,
  fuchsia: 0xe040fb,
};
export const color = (rgb: number, transparency = 0) => ({ __color: true, rgb, transparency });

export function pure(
  name: string,
  a: any[],
  named: Record<string, any>,
  version: number,
  tick: number,
  state: any,
  journal?: MutationJournal,
): any {
  // Collection handles are valid arguments; do not coerce them to a number.
  if (name.startsWith('array.')) return arrayBuiltin(name.slice(6), a, journal);
  if (name.startsWith('matrix.')) return matrixBuiltin(name.slice(7), a, journal, named);
  if (name.startsWith('map.')) return mapBuiltin(name.slice(4), a, journal);
  const x = num(a[0]);
  if (name === 'na') return missing(a[0]);
  if (name === 'nz')
    return missing(a[0]) ? (a[1] ?? (typeof a[0] === 'boolean' ? false : 0)) : a[0];
  if (name === 'fixnan') {
    if (!missing(a[0])) state.previous = a[0];
    return state.previous ?? NaN;
  }
  if (name === 'int') return Math.trunc(x);
  if (name === 'float') return x;
  if (name === 'bool') return !missing(a[0]) && Boolean(a[0]);
  if (name === 'string') return missing(a[0]) ? '' : String(a[0]);
  if (name === 'math.round') return round(x, num(a[1] ?? 0), version);
  if (name === 'math.round_to_mintick') return round(x / tick) * tick;
  if (name === 'math.avg') return mean(a.map(num));
  if (name === 'math.todegrees') return (x * 180) / Math.PI;
  if (name === 'math.toradians') return (x * Math.PI) / 180;
  if (name === 'math.random') {
    if (state.seed === undefined)
      state.seed = (BigInt(Math.trunc(num(a[2] ?? 0))) ^ 0x5deece66dn) & ((1n << 48n) - 1n);
    const next = (bits: number) => {
      state.seed = (state.seed * 0x5deece66dn + 0xbn) & ((1n << 48n) - 1n);
      return Number(state.seed >> BigInt(48 - bits));
    };
    return (
      num(a[0] ?? 0) +
      ((num(a[1] ?? 1) - num(a[0] ?? 0)) * (next(26) * 134217728 + next(27))) / 9007199254740992
    );
  }
  if (name.startsWith('math.')) {
    const fn = (Math as any)[name.slice(5)];
    if (typeof fn === 'function') return fn(...a.map(num));
  }
  if (name.startsWith('str.')) {
    const s = String(a[0] ?? '');
    switch (name.slice(4)) {
      case 'tostring':
        return tostring(a[0], a[1], tick, version);
      case 'tonumber':
        return /^\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)\s*$/.test(s) ? Number(s) : NaN;
      case 'length':
        return s.length;
      case 'pos': {
        const p = s.indexOf(a[1]);
        return p < 0 ? NaN : p;
      }
      case 'repeat': {
        const times = collectionSize(a[1], 'repeat count');
        const separator = String(a[2] ?? '');
        const length = times * s.length + Math.max(0, times - 1) * separator.length;
        if (length > MAX_STRING_LENGTH)
          throw new Error(
            `str.repeat result of ${length} characters exceeds the ${MAX_STRING_LENGTH} character limit`,
          );
        return Array(times).fill(s).join(separator);
      }
      case 'trim':
        return s.trim();
      case 'split':
        return s.split(a[1]);
      case 'substring':
        return s.substring(num(a[1]), a[2] === undefined ? undefined : num(a[2]));
      case 'replace_all':
        return s.split(a[1]).join(a[2]);
      case 'replace': {
        let occurrence = num(a[3] ?? 0),
          offset = 0,
          i = -1;
        do {
          i = s.indexOf(a[1], offset);
          offset = i + String(a[1]).length;
        } while (i >= 0 && occurrence-- > 0);
        return i < 0 ? s : s.slice(0, i) + a[2] + s.slice(offset);
      }
      case 'contains':
        return s.includes(a[1]);
      case 'startswith':
        return s.startsWith(a[1]);
      case 'endswith':
        return s.endsWith(a[1]);
      case 'match':
        return s.match(new RegExp(a[1]))?.[0] ?? '';
      case 'upper':
        return s.toUpperCase();
      case 'lower':
        return s.toLowerCase();
      case 'format':
        return s.replace(
          /\{(\d+)(?:,number(?:,([^}]+))?)?\}/g,
          (_: string, index: string, pattern: string) => {
            const v = a[+index + 1];
            if (!pattern) return typeof v === 'number' ? decimal(v, '#,###.###') : String(v);
            if (pattern === 'integer') return decimal(v, '#,###');
            if (pattern === 'percent') return decimal(v * 100, '#,###') + '%';
            return decimal(v, pattern);
          },
        );
    }
  }
  if (name.startsWith('color.')) {
    const rgb = a[0]?.rgb ?? 0;
    switch (name.slice(6)) {
      case 'r':
        return Math.floor(rgb / 65536);
      case 'g':
        return Math.floor(rgb / 256) % 256;
      case 'b':
        return rgb % 256;
      case 't':
        return a[0]?.transparency ?? NaN;
      case 'new':
        return color((named.color ?? a[0])?.rgb ?? NaN, num(named.transp ?? a[1]));
      case 'rgb':
        return color(
          round(num(named.red ?? a[0])) * 65536 +
            round(num(named.green ?? a[1])) * 256 +
            round(num(named.blue ?? a[2])),
          num(named.transp ?? a[3] ?? 0),
        );
      case 'from_gradient': {
        const t = Math.max(0, Math.min(1, (x - num(a[1])) / (num(a[2]) - num(a[1]))));
        const aa = a[3]?.rgb ?? 0,
          bb = a[4]?.rgb ?? 0;
        let result = 0;
        for (const pow of [65536, 256, 1])
          result +=
            Math.floor((Math.floor(aa / pow) % 256) * (1 - t) + (Math.floor(bb / pow) % 256) * t) *
            pow;
        return color(
          result,
          (a[3]?.transparency ?? 100) * (1 - t) + (a[4]?.transparency ?? 100) * t,
        );
      }
    }
  }
  const error = new Error(`Unsupported builtin ${name}`);
  (error as any).kind = 'unsupported';
  throw error;
}
