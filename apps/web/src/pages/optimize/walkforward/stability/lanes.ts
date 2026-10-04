import type { AnalysisValue } from '@pine/optimizer';

/** Geometry only: the workflow has already determined which values qualify. */
export function valuePosition(values: readonly AnalysisValue[], value: AnalysisValue | null) {
  if (value === null || !values.includes(value)) return null;
  if (values.length === 1) return 32;
  const numeric = values.every((item) => typeof item === 'number');
  const minimum = numeric ? Math.min(...(values as number[])) : 0;
  const maximum = numeric ? Math.max(...(values as number[])) : values.length - 1;
  const position = numeric ? (value as number) : values.indexOf(value);
  return maximum === minimum ? 32 : 54 - ((position - minimum) / (maximum - minimum)) * 44;
}

/** Keep holes visible instead of suggesting the intervening values qualify. */
export function nearSegments(values: readonly AnalysisValue[], near: readonly AnalysisValue[]) {
  const kept = new Set(near);
  const runs: { from: AnalysisValue; to: AnalysisValue }[] = [];
  let current: (typeof runs)[number] | undefined;
  for (const value of values) {
    if (!kept.has(value)) current = undefined;
    else if (current) current.to = value;
    else {
      current = { from: value, to: value };
      runs.push(current);
    }
  }
  return runs;
}

export function bandRect(values: readonly AnalysisValue[], from: AnalysisValue, to: AnalysisValue) {
  const first = valuePosition(values, from);
  const last = valuePosition(values, to);
  if (first === null || last === null) return null;
  return { y: Math.min(first, last) - 3, height: Math.abs(first - last) + 6 };
}
