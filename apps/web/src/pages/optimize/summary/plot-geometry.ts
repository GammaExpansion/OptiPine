/** Finite plotting bounds with room for a constant series and optional zero reference. */
export function extent(
  series: readonly ArrayLike<number>[],
  includeZero = false,
): [number, number] {
  let low = includeZero ? 0 : Infinity;
  let high = includeZero ? 0 : -Infinity;
  for (const values of series)
    for (let index = 0; index < values.length; index++) {
      const value = values[index];
      if (Number.isFinite(value)) {
        low = Math.min(low, value);
        high = Math.max(high, value);
      }
    }
  if (!Number.isFinite(low) || !Number.isFinite(high)) return [0, 1];
  const padding = high === low ? Math.max(1, Math.abs(high) * 0.01) : (high - low) * 0.06;
  return [low - padding, high + padding];
}

export function scale(domain: readonly [number, number], start: number, end: number) {
  return (value: number) => start + ((value - domain[0]) / (domain[1] - domain[0])) * (end - start);
}

/** Leave room for full UTC dates, including the inward-aligned first and last labels. */
export function timeTicks(bounds: readonly [number, number], width: number): number[] {
  const intervals = Math.min(4, Math.max(1, Math.floor(width / 110)));
  return Array.from(
    { length: intervals + 1 },
    (_, index) => bounds[0] + ((bounds[1] - bounds[0]) * index) / intervals,
  );
}

/** Expand to round 1/2/2.5/5 ticks. Zero is an exact tick whenever the domain crosses it. */
export function roundAxis(
  bounds: readonly [number, number],
  intervals = 4,
  integer = false,
): { bounds: [number, number]; ticks: number[] } {
  let [low, high] = bounds;
  if (!Number.isFinite(low) || !Number.isFinite(high) || high < low) [low, high] = [0, 1];
  if (high === low) {
    const padding = Math.max(1, Math.abs(low) * 0.01);
    low -= padding;
    high += padding;
  }
  const raw = Math.max(integer ? 1 : 0, (high - low) / Math.max(1, intervals));
  const power = 10 ** Math.floor(Math.log10(raw));
  const step =
    ([1, 2, 2.5, 5, 10].find(
      (value) => value * power >= raw && (!integer || Number.isInteger(value * power)),
    ) ?? 10) * power;
  const first = Math.floor(low / step);
  const last = Math.ceil(high / step);
  // Multiplication (instead of accumulation) and significant digits avoid decimal tick drift.
  const ticks = Array.from({ length: last - first + 1 }, (_, index) =>
    Number(((first + index) * step).toPrecision(12)),
  );
  return { bounds: [ticks[0], ticks.at(-1)!], ticks };
}

/** Preserve local extrema while bounding the drawing work to two points per CSS pixel. */
export function envelope(
  values: readonly number[],
  pixels: number,
): { index: number; value: number }[] {
  const step = Math.max(1, Math.ceil(values.length / Math.max(1, pixels)));
  const points: { index: number; value: number }[] = [];
  for (let start = 0; start < values.length; start += step) {
    let low = start;
    let high = start;
    for (let index = start + 1; index < Math.min(start + step, values.length); index++) {
      if (values[index] < values[low]) low = index;
      if (values[index] > values[high]) high = index;
    }
    for (const index of low === high ? [low] : [Math.min(low, high), Math.max(low, high)])
      points.push({ index, value: values[index] });
  }
  if (values.length && points.at(-1)?.index !== values.length - 1)
    points.push({ index: values.length - 1, value: values.at(-1)! });
  return points;
}

export function nearestPoint(
  points: readonly { x: number; y: number }[],
  x: number,
  y: number,
  radius = 9,
): number | null {
  let distance = radius ** 2;
  let nearest: number | null = null;
  points.forEach((point, index) => {
    const next = (point.x - x) ** 2 + (point.y - y) ** 2;
    if (next <= distance) {
      distance = next;
      nearest = index;
    }
  });
  return nearest;
}
