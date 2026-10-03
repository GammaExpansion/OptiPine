export interface NumberBounds {
  min?: number;
  max?: number;
  step?: number;
}

/** Arrow keys snap to the min-based step grid; pages move ten steps, without decimal drift. */
export function stepNumber(
  raw: string | number,
  direction: -1 | 1,
  page: boolean,
  { min, max, step = 1 }: NumberBounds,
): number | undefined {
  if (
    !Number.isFinite(step) ||
    step <= 0 ||
    (min !== undefined && !Number.isFinite(min)) ||
    (max !== undefined && !Number.isFinite(max)) ||
    (min !== undefined && max !== undefined && min > max)
  )
    return undefined;
  const parsed = typeof raw === 'number' ? raw : raw.trim() ? Number(raw) : NaN;
  const value = Number.isFinite(parsed) ? parsed : (min ?? 0);
  const base = min ?? 0;
  const position = (value - base) / step;
  const nearest = Math.round(position);
  const index =
    Math.abs(position - nearest) < 1e-8
      ? nearest
      : direction === 1
        ? Math.floor(position)
        : Math.ceil(position);
  const candidate = base + (index + direction * (page ? 10 : 1)) * step;
  if (!Number.isFinite(candidate)) return undefined;
  const rounded = Number(candidate.toPrecision(15));
  return Math.min(max ?? Infinity, Math.max(min ?? -Infinity, rounded));
}
