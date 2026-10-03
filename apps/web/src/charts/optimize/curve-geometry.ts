import type { CurveView } from '../../workflows/optimize-views.ts';

export function curveGeometry(curve: CurveView, width: number, height: number) {
  let low = 0;
  let high = 0;
  for (const point of curve.points) {
    for (const value of [point.inSample, point.outOfSample, point.neighbourhoodMean]) {
      if (value !== null && Number.isFinite(value)) {
        low = Math.min(low, value);
        high = Math.max(high, value);
      }
    }
  }
  const span = high - low || 1;
  const left = 58;
  const right = Math.max(left + 1, width - 18);
  return {
    low,
    high,
    x: (index: number) =>
      left + (curve.points.length < 2 ? 0.5 : index / (curve.points.length - 1)) * (right - left),
    y: (value: number) => height - 34 - ((value - low) / span) * (height - 50),
    indexAt: (x: number) =>
      Math.max(
        0,
        Math.min(
          curve.points.length - 1,
          Math.round(((x - left) / (right - left)) * (curve.points.length - 1)),
        ),
      ),
  };
}
