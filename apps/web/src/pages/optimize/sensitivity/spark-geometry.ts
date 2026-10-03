import type { SensitivityPoint } from '@pine/optimizer';

/** Every row projects onto the workflow's shared scale, including the interquartile spread. */
export function sensitivityPaths(
  points: readonly SensitivityPoint[],
  scale: readonly [number, number] | null,
) {
  const [low, high] = scale ?? [0, 1];
  const x = (index: number) => 2 + (points.length < 2 ? 0.5 : index / (points.length - 1)) * 146;
  const y = (value: number) => 24 - ((value - low) / (high - low || 1)) * 22;
  const segments: { mean: string; band: string }[] = [];
  let mean: string[] = [];
  let upper: string[] = [];
  let lower: string[] = [];
  const flush = () => {
    if (mean.length)
      segments.push({
        mean: `M${mean.join('L')}`,
        band: upper.length ? `M${upper.join('L')}L${lower.reverse().join('L')}Z` : '',
      });
    mean = [];
    upper = [];
    lower = [];
  };
  const dots: { x: number; y: number }[] = [];
  points.forEach((point, index) => {
    if (point.mean === null || !Number.isFinite(point.mean)) {
      flush();
      return;
    }
    mean.push(`${x(index)},${y(point.mean)}`);
    if (point.q1 !== null && point.q3 !== null) {
      upper.push(`${x(index)},${y(point.q3)}`);
      lower.push(`${x(index)},${y(point.q1)}`);
    }
    if (points.length <= 8) dots.push({ x: x(index), y: y(point.mean) });
  });
  flush();
  return { segments, dots };
}
