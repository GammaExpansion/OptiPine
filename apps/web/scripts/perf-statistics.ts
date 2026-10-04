/** Nearest-rank percentiles; absent samples are null, never a false zero-cost claim. */
export function statistics(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (fraction: number) => sorted[Math.ceil(sorted.length * fraction) - 1] ?? null;
  return {
    count: sorted.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
    max: sorted.at(-1) ?? null,
    over50: sorted.filter((value) => value > 50).length,
  };
}

/** Phase/window boundaries and explicit interaction requests are reported separately. */
export function snapshotIntervals(
  samples: readonly { at: number; phase: string; window: number | null }[],
) {
  return samples.slice(1).flatMap((sample, index) => {
    const previous = samples[index];
    return ['in', 'out', 'all'].includes(sample.phase) &&
      sample.phase === previous.phase &&
      sample.window === previous.window
      ? [sample.at - previous.at]
      : [];
  });
}
