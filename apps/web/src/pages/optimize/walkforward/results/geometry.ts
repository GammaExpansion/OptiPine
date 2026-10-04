import type { WalkForwardView, WindowResult } from '../../../../workflows/walk-forward.ts';

export type SummaryMode = 'stitched' | 'windows';
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Null/nonfinite values break the line, including failed windows on the stitched account. */
export function equitySegments(
  times: readonly number[],
  values: readonly (number | null)[],
  x: (time: number) => number,
  y: (value: number) => number,
): readonly (readonly Point[])[] {
  const segments: Point[][] = [];
  let segment: Point[] | null = null;
  for (let index = 0; index < Math.min(times.length, values.length); index++) {
    const value = values[index];
    if (value === null || !Number.isFinite(value) || !Number.isFinite(times[index])) {
      segment = null;
      continue;
    }
    if (!segment) segments.push((segment = []));
    segment.push({ x: x(times[index]), y: y(value) });
  }
  return segments;
}

export function valueScale(values: readonly (number | null)[], top: number, bottom: number) {
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (value === null || !Number.isFinite(value)) continue;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  if (!Number.isFinite(min)) min = max = 0;
  const pad = Math.max((max - min) * 0.15, Math.abs(max) * 0.001, 1);
  min -= pad;
  max += pad;
  return {
    min,
    max,
    y: (value: number) => bottom - ((value - min) / (max - min)) * (bottom - top),
  };
}

/** Equity samples use the data's actual bar times, including weekends and session gaps. */
export function windowSeries(view: WalkForwardView, window: WindowResult, sample: 'is' | 'oos') {
  const start =
    sample === 'is' ? window.plan.inSampleStartIndex : window.plan.outOfSampleStartIndex;
  const values = sample === 'is' ? window.inSampleEquity : window.outOfSampleEquity;
  return { times: view.times.slice(start, start + values.length), values };
}

export function summaryGeometry(
  windows: readonly WindowResult[],
  width: number,
  height: number,
  mode: SummaryMode,
) {
  const from = Math.min(...windows.map((window) => window.plan.inSampleStart));
  const to = Math.max(...windows.map((window) => window.plan.outOfSampleEnd));
  const left = 40;
  const right = Math.max(left + 1, width - (mode === 'windows' ? 88 : 72));
  const x = (time: number) => left + ((time - from) / Math.max(1, to - from)) * (right - left);
  const laneTop = mode === 'windows' ? 16 : Math.max(90, height - windows.length * 20 - 24);
  const laneStep = mode === 'windows' ? (height - 40) / Math.max(1, windows.length) : 20;
  return {
    left,
    right,
    from,
    to,
    x,
    laneTop,
    laneStep,
    lanes: windows.map((window, index) => ({
      window,
      top: laneTop + index * laneStep,
      height: mode === 'windows' ? laneStep - 8 : 14,
      isStart: x(window.plan.inSampleStart),
      isEnd: x(window.plan.inSampleEnd),
      oosStart: x(window.plan.outOfSampleStart),
      oosEnd: x(window.plan.outOfSampleEnd),
    })),
  };
}
