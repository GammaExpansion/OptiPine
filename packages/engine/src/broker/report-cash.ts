/**
 * Project nonnegative closed-cycle cash amounts to report precision. Start at two
 * decimal places and add precision only while a positive amount rounds to zero.
 * Other inputs and values beyond a safe decimal scale retain their representation.
 */
export function reportCycleCash(value: number): number {
  if (value <= 0 || !Number.isFinite(value)) return value;
  for (let places = 2; ; places++) {
    const scale = 10 ** places;
    const scaled = value * scale;
    if (!Number.isFinite(scale) || !Number.isFinite(scaled) || scaled > Number.MAX_SAFE_INTEGER)
      return value;
    const rounded = Math.round(scaled);
    if (rounded !== 0) return rounded / scale;
  }
}
