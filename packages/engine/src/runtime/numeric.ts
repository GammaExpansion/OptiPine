export const missing = (x: unknown): boolean =>
  x === null || x === undefined || (typeof x === 'number' && !Number.isFinite(x));
export const num = (x: unknown): number => (missing(x) ? NaN : Number(x));
export const sum = (a: number[]): number => a.reduce((s, x) => s + x, 0);
export const mean = (a: number[]): number => (a.length ? sum(a) / a.length : NaN);
export function variance(a: number[], biased = true): number {
  const m = mean(a);
  return sum(a.map((x) => (x - m) ** 2)) / (a.length - (biased ? 0 : 1));
}
export function percentile(a: number[], p: number, nearest = false): number {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  if (nearest) return s[Math.max(0, Math.ceil((p * s.length) / 100) - 1)];
  const i = ((s.length - 1) * p) / 100,
    lo = Math.floor(i),
    hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}
export function mode(a: number[]): number {
  const counts = new Map<number, number>();
  let best = NaN,
    count = 0;
  for (const x of a) {
    const c = (counts.get(x) ?? 0) + 1;
    counts.set(x, c);
    if (c > count || (c === count && x < best)) {
      count = c;
      best = x;
    }
  }
  return best;
}
