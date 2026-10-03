import type { MarketBar } from '../types.ts';

import { missing, num, sum, mean, variance, percentile, mode } from './numeric.ts';
import { RollingSum } from './rolling-sum.ts';

export interface TAContext {
  bar: MarketBar;
  previous?: MarketBar;
  /** Default for the VWAP variable and one-argument overload only. */
  vwapAnchor: boolean;
}
export interface State {
  samples: unknown[][];
  nested: Map<string, State>;
  average: number;
  previous?: unknown;
  total?: number;
  extreme: number;
  since?: number;
  matches?: unknown[];
  atr?: number;
  lower: number;
  upper: number;
  trend?: number;
  result?: number;
  acceleration: number;
  below?: boolean;
  prev2?: MarketBar;
  pv: number;
  v: number;
  p2v: number;
  started?: boolean;
  bar?: number;
  value?: unknown;
  seed?: bigint;
  rolling?: RollingSum;
}
export const state = (): State => ({
  samples: [],
  nested: new Map(),
  average: NaN,
  extreme: NaN,
  lower: NaN,
  upper: NaN,
  acceleration: NaN,
  pv: NaN,
  v: NaN,
  p2v: NaN,
});

/** Builtins whose second argument is a bar count; TradingView rejects lengths below one. */
const lengthFunctions = new Set([
  'sma',
  'sum',
  'ema',
  'rma',
  'wma',
  'vwma',
  'hma',
  'alma',
  'linreg',
  'variance',
  'stdev',
  'dev',
  'roc',
  'highest',
  'lowest',
  'highestbars',
  'lowestbars',
  'range',
  'rising',
  'falling',
  'percentile_nearest_rank',
  'percentile_linear_interpolation',
  'median',
  'mode',
  'percentrank',
  'rsi',
  'cci',
  'mfi',
  'cog',
  'cmo',
  'dmi',
  'bb',
  'bbw',
  'kc',
  'kcw',
  'supertrend',
]);

/** A missing second argument keeps each builtin's own default; na, zero and negatives are errors. */
function lengthArgument(name: string, value: unknown): number {
  if (value === undefined || !lengthFunctions.has(name))
    return Math.max(1, Math.trunc(num(value)) || 1);
  const raw = num(value),
    length = Math.trunc(raw);
  if (!(length >= 1))
    throw new Error(
      `Invalid value of the 'length' argument (${missing(raw) ? 'na' : raw}) in the "${name}" function. It must be > 0.`,
    );
  return length;
}

export function technical(name: string, args: unknown[], s: State, ctx: TAContext): unknown {
  const { bar: b, previous: prev } = ctx;
  const sub = (key: string, name: string, values: unknown[]) => {
    if (!s.nested.has(key)) s.nested.set(key, state());
    return num(technical(name, values, s.nested.get(key)!, ctx));
  };
  const tr = (handle = false) =>
    !prev
      ? handle
        ? b.high - b.low
        : NaN
      : Math.max(b.high - b.low, Math.abs(b.high - prev.close), Math.abs(b.low - prev.close));
  s.samples.push(args);
  const samples = s.samples;
  const past = (offset: number, index = 0) => num(samples[samples.length - 1 - offset]?.[index]);
  const window = (length: number, index = 0, skipNA = true): number[] => {
    const out: number[] = [];
    for (let i = samples.length - 1; i >= 0 && out.length < length; i--) {
      const v = num(samples[i][index]);
      if (!skipNA || !missing(v)) out.push(v);
    }
    return out.reverse();
  };
  const full = (length: number, index = 0, skipNA = true): number[] => {
    const a = window(length, index, skipNA);
    return a.length === length ? a : Array(Math.max(0, length)).fill(NaN);
  };
  const x = num(args[0]),
    n = lengthArgument(name, args[1]);
  switch (name) {
    case 'tr':
      return tr(Boolean(args[0]));
    case 'sma':
    case 'sum': {
      if (s.rolling && s.rolling.length !== n)
        throw Object.assign(new Error('Changing moving-sum lengths are not implemented'), {
          kind: 'unsupported',
        });
      s.rolling ??= new RollingSum(n);
      const total = s.rolling.push(x);
      return name === 'sma' ? total / n : total;
    }
    case 'ema':
    case 'rma': {
      if (missing(x)) return NaN;
      if (missing(s.average)) {
        const a = window(n);
        if (a.length < n) return NaN;
        s.average = mean(a);
      } else {
        const alpha = name === 'ema' ? 2 / (n + 1) : 1 / n;
        s.average = alpha * x + (1 - alpha) * s.average;
      }
      return s.average;
    }
    case 'wma': {
      const a = full(n);
      return sum(a.map((v, i) => v * (i + 1))) / ((n * (n + 1)) / 2);
    }
    case 'vwma':
      return sub('pv', 'sma', [x * b.volume, n]) / sub('v', 'sma', [b.volume, n]);
    case 'swma': {
      const a = full(4, 0, false);
      return (a[0] + 2 * a[1] + 2 * a[2] + a[3]) / 6;
    }
    case 'hma':
      return sub('out', 'wma', [
        2 * sub('half', 'wma', [x, Math.floor(n / 2)]) - sub('whole', 'wma', [x, n]),
        Math.floor(Math.sqrt(n)),
      ]);
    case 'alma': {
      const a = full(n, 0, false);
      let m = num(args[2]) * (n - 1);
      if (args[4]) m = Math.floor(m);
      const width = n / num(args[3]);
      const weights = a.map((_, i) => Math.exp(-((i - m) ** 2) / (2 * width ** 2)));
      return sum(a.map((v, i) => v * weights[i])) / sum(weights);
    }
    case 'linreg': {
      const a = full(n, 0, false);
      const mx = (n - 1) / 2,
        my = mean(a);
      const slope = sum(a.map((v, i) => (i - mx) * (v - my))) / sum(a.map((_, i) => (i - mx) ** 2));
      return my + slope * (n - 1 - num(args[2] ?? 0) - mx);
    }
    case 'variance':
    case 'stdev': {
      const m = sub('mean', 'sma', [x, n]);
      const q = sub('squareMean', 'sma', [x * x, n]);
      const population = Math.max(0, q - m * m);
      const value = args[2] === false ? (population * n) / (n - 1) : population;
      return name === 'stdev' ? Math.sqrt(value) : value;
    }
    case 'dev': {
      const a = full(n),
        m = mean(a);
      return mean(a.map((v) => Math.abs(v - m)));
    }
    case 'change':
    case 'mom':
      return typeof args[0] === 'boolean'
        ? args[0] !== samples[samples.length - 1 - n]?.[0]
        : x - past(n);
    case 'roc':
      return (100 * (x - past(n))) / past(n);
    case 'cum':
      s.total = (s.total ?? 0) + x;
      return s.total;
    case 'max':
      s.extreme = missing(s.extreme) ? x : Math.max(x, s.extreme);
      return s.extreme;
    case 'min':
      s.extreme = missing(s.extreme) ? x : Math.min(x, s.extreme);
      return s.extreme;
    case 'highest':
    case 'lowest':
    case 'highestbars':
    case 'lowestbars': {
      const isHigh = name.startsWith('highest');
      if (args.length === 1) {
        samples[samples.length - 1] = [isHigh ? b.high : b.low, x];
        return technicalWindow(x);
      }
      return technicalWindow(n);
      function technicalWindow(length: number) {
        if (samples.length < length) return NaN;
        const a = full(length, 0, false);
        const present = a.filter((v) => !missing(v));
        const ex = !present.length ? NaN : isHigh ? Math.max(...present) : Math.min(...present);
        return name.endsWith('bars') ? (missing(ex) ? NaN : a.indexOf(ex) - (length - 1)) : ex;
      }
    }
    case 'range': {
      const a = full(n);
      return Math.max(...a) - Math.min(...a);
    }
    case 'rising':
    case 'falling': {
      const a: number[] = [];
      for (let i = samples.length - 2; i >= 0 && a.length < n; i--) {
        const v = num(samples[i][0]);
        if (!missing(v)) a.push(v);
      }
      const sequence = [x, ...a];
      return (
        a.length === n &&
        sequence.every(
          (v, i) => i === 0 || (name === 'rising' ? sequence[i - 1] > v : sequence[i - 1] < v),
        )
      );
    }
    case 'crossover':
      return x > num(args[1]) && past(1) <= past(1, 1);
    case 'crossunder':
      return x < num(args[1]) && past(1) >= past(1, 1);
    case 'cross':
      return (
        (x > num(args[1]) && past(1) <= past(1, 1)) || (x < num(args[1]) && past(1) >= past(1, 1))
      );
    case 'barssince':
      if (args[0]) s.since = 0;
      else if (s.since !== undefined) s.since++;
      return s.since ?? NaN;
    case 'valuewhen':
      if (args[0]) (s.matches ??= []).push(args[1]);
      return s.matches?.[s.matches.length - 1 - num(args[2])] ?? NaN;
    case 'pivothigh':
    case 'pivotlow': {
      const hi = name === 'pivothigh',
        left = args.length === 2 ? x : n,
        right = num(args[args.length - 1]);
      if (args.length === 2) samples[samples.length - 1] = [hi ? b.high : b.low];
      const a = full(left + right + 1, 0, false),
        p = a[left];
      return a.every(
        (v, i) => i === left || (hi ? (i < left ? v <= p : v < p) : i < left ? v >= p : v > p),
      )
        ? p
        : NaN;
    }
    case 'percentile_nearest_rank':
      return percentile(full(n), num(args[2]), true);
    case 'percentile_linear_interpolation':
      return percentile(full(n), num(args[2]));
    case 'median':
      return percentile(full(n), 50);
    case 'mode':
      return mode(full(n));
    case 'percentrank': {
      const a = samples.slice(-n - 1, -1).map((v) => num(v[0]));
      return a.length !== n || a.some(missing) ? NaN : (a.filter((v) => v <= x).length / n) * 100;
    }
    case 'correlation': {
      const length = num(args[2]);
      const a = full(length),
        bb = full(length, 1);
      const ma = mean(a),
        mb = mean(bb);
      return mean(a.map((v, i) => (v - ma) * (bb[i] - mb))) / Math.sqrt(variance(a) * variance(bb));
    }
    case 'atr':
      return sub('rma', 'rma', [tr(true), x]);
    case 'rsi': {
      const delta = missing(s.previous) || missing(x) ? NaN : x - num(s.previous);
      if (!missing(x)) s.previous = x;
      const up = sub('up', 'rma', [Math.max(delta, 0), n]),
        down = sub('down', 'rma', [-Math.min(delta, 0), n]);
      return down === 0 ? 100 : up === 0 ? 0 : 100 - 100 / (1 + up / down);
    }
    case 'macd': {
      const fast = sub('fast', 'ema', [x, args[1]]),
        slow = sub('slow', 'ema', [x, args[2]]),
        d = fast - slow,
        signal = sub('signal', 'ema', [d, args[3]]);
      return [d, signal, d - signal];
    }
    case 'stoch': {
      const length = num(args[3]),
        high = sub('hi', 'highest', [args[1], length]),
        low = sub('lo', 'lowest', [args[2], length]);
      return (100 * (x - low)) / (high - low);
    }
    case 'cci': {
      const a = full(n),
        avg = mean(a);
      return (x - avg) / (0.015 * mean(a.map((v) => Math.abs(v - avg))));
    }
    case 'mfi': {
      const d = Math.round((x - past(1)) * 1e9) / 1e9;
      const pos = sub('pos', 'sum', [d <= 0 ? 0 : x * b.volume, n]),
        neg = sub('neg', 'sum', [d >= 0 ? 0 : x * b.volume, n]);
      return 100 - 100 / (1 + pos / neg);
    }
    case 'tsi': {
      const delta = x - past(1),
        m = sub('m2', 'ema', [sub('m1', 'ema', [delta, args[2]]), args[1]]),
        ab = sub('a2', 'ema', [sub('a1', 'ema', [Math.abs(delta), args[2]]), args[1]]);
      return m / ab;
    }
    case 'wpr': {
      const hi = sub('hi', 'highest', [b.high, x]),
        lo = sub('lo', 'lowest', [b.low, x]);
      return (-100 * (hi - b.close)) / (hi - lo);
    }
    case 'cog': {
      const a = full(n);
      return -sum(a.map((v, i) => v * (n - i))) / sum(a);
    }
    case 'cmo': {
      const delta = x - past(1);
      const up = sub('up', 'sum', [Math.max(delta, 0), n]),
        down = sub('down', 'sum', [-Math.min(delta, 0), n]);
      return (100 * (up - down)) / (up + down);
    }
    case 'dmi': {
      const up = prev ? b.high - prev.high : NaN,
        down = prev ? prev.low - b.low : NaN;
      const positive = Math.round(up * 1e9) > Math.round(down * 1e9);
      const negative = Math.round(down * 1e9) > Math.round(up * 1e9);
      const range = sub('tr', 'rma', [tr(false), x]);
      const plus =
        (100 * sub('plus', 'rma', [missing(up) ? NaN : positive && up > 0 ? up : 0, x])) / range;
      const minus =
        (100 * sub('minus', 'rma', [missing(down) ? NaN : negative && down > 0 ? down : 0, x])) /
        range;
      const adx =
        100 *
        sub('adx', 'rma', [Math.abs(plus - minus) / (plus + minus === 0 ? 1 : plus + minus), n]);
      return [plus, minus, adx];
    }
    case 'bb':
    case 'bbw': {
      const m = sub('sma', 'sma', [x, n]),
        dev = num(args[2]) * sub('dev', 'stdev', [x, n]);
      return name === 'bb' ? [m, m + dev, m - dev] : (200 * dev) / m;
    }
    case 'kc':
    case 'kcw': {
      const m = sub('ema', 'ema', [x, n]),
        range = args[3] === false ? b.high - b.low : tr(false),
        dev = num(args[2]) * sub('range', 'ema', [range, n]);
      return name === 'kc' ? [m, m + dev, m - dev] : (2 * dev) / m;
    }
    case 'supertrend': {
      const atr = sub('atr', 'atr', [n]);
      let upper = (b.high + b.low) / 2 + x * atr,
        lower = (b.high + b.low) / 2 - x * atr;
      const oldLower = missing(s.lower) ? 0 : s.lower,
        oldUpper = missing(s.upper) ? 0 : s.upper;
      lower = lower > oldLower || (prev?.close ?? 0) < oldLower ? lower : oldLower;
      upper = upper < oldUpper || (prev?.close ?? 0) > oldUpper ? upper : oldUpper;
      let dir: number;
      if (missing(s.atr)) dir = 1;
      else if (s.trend === oldUpper) dir = b.close > upper ? -1 : 1;
      else dir = b.close < lower ? 1 : -1;
      const trend = dir === -1 ? lower : upper;
      Object.assign(s, { atr, upper, lower, trend });
      return [trend, dir];
    }
    case 'sar': {
      if (!prev) return NaN;
      let first = false;
      if (s.result === undefined) {
        s.below = b.close > prev.close;
        s.extreme = s.below ? b.high : b.low;
        s.result = s.below ? prev.low : prev.high;
        s.acceleration = x;
        first = true;
      }
      s.result += s.acceleration * (s.extreme - s.result);
      if ((s.below && s.result > b.low) || (!s.below && s.result < b.high)) {
        first = true;
        s.below = !s.below;
        s.result = s.below ? Math.min(b.low, s.extreme) : Math.max(b.high, s.extreme);
        s.extreme = s.below ? b.high : b.low;
        s.acceleration = x;
      }
      if (!first && ((s.below && b.high > s.extreme) || (!s.below && b.low < s.extreme))) {
        s.extreme = s.below ? b.high : b.low;
        s.acceleration = Math.min(s.acceleration + num(args[1]), num(args[2]));
      }
      s.result = s.below
        ? Math.min(s.result, prev.low, s.prev2?.low ?? Infinity)
        : Math.max(s.result, prev.high, s.prev2?.high ?? -Infinity);
      s.prev2 = prev;
      return s.result;
    }
    case 'vwap': {
      const anchor = args.length > 1 ? Boolean(args[1]) : ctx.vwapAnchor;
      if (anchor) {
        s.pv = 0;
        s.v = 0;
        s.p2v = 0;
        s.started = true;
      }
      if (!s.started) return args.length > 2 ? [NaN, NaN, NaN] : NaN;
      s.pv += x * b.volume;
      s.v += b.volume;
      s.p2v += x * x * b.volume;
      const m = s.pv / s.v,
        dev = Math.sqrt(Math.max(0, s.p2v / s.v - m * m)) * num(args[2]);
      return args.length > 2 ? [m, m + dev, m - dev] : m;
    }
    case 'obv':
      s.total = (s.total ?? 0) + (!prev ? 0 : Math.sign(b.close - prev.close) * b.volume);
      return prev ? s.total : NaN;
    case 'accdist':
      s.total =
        (s.total ?? 0) +
        (b.high === b.low ? 0 : ((2 * b.close - b.low - b.high) / (b.high - b.low)) * b.volume);
      return s.total;
    case 'pvt':
      s.total = (s.total ?? 0) + (!prev ? 0 : ((b.close - prev.close) / prev.close) * b.volume);
      return prev ? s.total : NaN;
    case 'nvi':
    case 'pvi':
      if (s.total === undefined) s.total = 1;
      else if (prev && (name === 'nvi' ? b.volume < prev.volume : b.volume > prev.volume))
        s.total *= b.close / prev.close;
      return s.total;
    case 'wad':
      s.total =
        (s.total ?? 0) +
        (!prev
          ? 0
          : b.close > prev.close
            ? b.close - Math.min(b.low, prev.close)
            : b.close < prev.close
              ? b.close - Math.max(b.high, prev.close)
              : 0);
      return s.total;
    case 'wvad':
      return ((b.close - b.open) / (b.high - b.low)) * b.volume;
    case 'iii':
      return ((2 * b.close - b.high - b.low) / (b.high - b.low)) * b.volume;
    default:
      throw Object.assign(new Error(`Unsupported builtin ta.${name}`), { kind: 'unsupported' });
  }
}
