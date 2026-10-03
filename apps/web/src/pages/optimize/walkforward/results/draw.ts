import type { WalkForwardView } from '../../../../workflows/walk-forward.ts';
import {
  equitySegments,
  summaryGeometry,
  valueScale,
  windowSeries,
  type Point,
  type SummaryMode,
} from './geometry.ts';

export interface ChartCopy {
  readonly windows: readonly {
    label: string;
    net: string;
    compact: string;
    is: string;
    equity: string;
    status: string;
  }[];
  readonly ticks: readonly { time: number; label: string }[];
  readonly value: (value: number) => string;
}

function line(
  context: CanvasRenderingContext2D,
  segments: readonly (readonly Point[])[],
  color: string,
  dashed = false,
) {
  context.strokeStyle = color;
  context.lineWidth = 1.5;
  context.setLineDash(dashed ? [3, 2] : []);
  context.beginPath();
  for (const segment of segments) {
    segment.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    if (segment.length === 1) {
      context.moveTo(segment[0].x - 1, segment[0].y);
      context.lineTo(segment[0].x + 1, segment[0].y);
    }
  }
  context.stroke();
  context.setLineDash([]);
}

/** Draws only the workflow snapshot; no ranking, stitching or per-trial subscriptions. */
export function drawSummary(
  context: CanvasRenderingContext2D,
  view: WalkForwardView,
  mode: SummaryMode,
  width: number,
  height: number,
  copy: ChartCopy,
) {
  const geometry = summaryGeometry(view.windows, width, height, mode);
  const { x, left, right, laneTop } = geometry;
  const selected = view.selection?.window.plan.index;
  context.clearRect(0, 0, width, height);
  context.font = '11px "Barlow", "Noto Sans SC", sans-serif';
  context.textBaseline = 'middle';
  const label = (
    text: string,
    at: number,
    y: number,
    color = '#7f8790',
    align: CanvasTextAlign = 'left',
  ) => {
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(text, at, y);
  };
  if (mode === 'stitched') {
    const chosen = geometry.lanes.find((lane) => lane.window.plan.index === selected);
    if (chosen) {
      context.fillStyle = 'rgba(108,182,221,0.08)';
      context.fillRect(chosen.isStart, 26, chosen.isEnd - chosen.isStart, height - 44);
      context.fillStyle = 'rgba(242,163,58,0.10)';
      context.fillRect(chosen.oosStart, 26, chosen.oosEnd - chosen.oosStart, height - 44);
    }
    const scale = valueScale(view.equity.values, 48, laneTop - 22);
    const ending = view.equity.values.at(-1);
    const endingY = ending == null ? null : scale.y(ending);
    for (const fraction of [0.2, 0.5, 0.8]) {
      const value = scale.min + fraction * (scale.max - scale.min);
      const y = scale.y(value);
      line(
        context,
        [
          [
            { x: left, y },
            { x: right, y },
          ],
        ],
        '#23272d',
        true,
      );
      if (endingY === null || Math.abs(y - endingY) > 16) label(copy.value(value), right + 8, y);
    }
    geometry.lanes.forEach((lane, index) => {
      line(
        context,
        [
          [
            { x: lane.oosStart, y: 26 },
            { x: lane.oosStart, y: laneTop - 16 },
          ],
        ],
        '#23272d',
      );
      const item = copy.windows[index];
      const net = lane.window.outOfSample?.netProfit;
      const text = `${item.label} ${item.compact}`;
      const half = context.measureText(text).width / 2;
      const center = Math.min(
        right - half,
        Math.max(left + half, (lane.oosStart + lane.oosEnd) / 2),
      );
      // Tiny partial windows retain their result in the table instead of colliding with neighbours.
      if (lane.oosEnd - lane.oosStart >= half * 2 + 4 || index === geometry.lanes.length - 1) {
        label(text, center, 34, net != null && net < 0 ? '#f06a5d' : '#aab1b9', 'center');
      }
    });
    const segments = equitySegments(view.equity.times, view.equity.values, x, scale.y);
    for (const segment of segments) {
      if (segment.length < 2) continue;
      context.beginPath();
      context.moveTo(segment[0].x, laneTop - 16);
      segment.forEach((point) => context.lineTo(point.x, point.y));
      context.lineTo(segment.at(-1)!.x, laneTop - 16);
      context.closePath();
      context.fillStyle = 'rgba(242,163,58,0.07)';
      context.fill();
    }
    line(context, segments, '#f2a33a');
    const last = segments.at(-1)?.at(-1);
    const value = view.equity.values.at(-1);
    if (last && value != null) {
      context.fillStyle = '#f2a33a';
      context.beginPath();
      context.arc(last.x, last.y, 3, 0, 2 * Math.PI);
      context.fill();
      context.fillRect(right + 6, last.y - 9, width - right - 8, 18);
      label(copy.value(value), right + 10, last.y, '#1a1206');
    }
  }
  geometry.lanes.forEach((lane, index) => {
    const { window, top, height: laneHeight } = lane;
    const active = window.plan.index === selected;
    const waiting = window.status === 'waiting' || window.status === 'running';
    const item = copy.windows[index];
    context.fillStyle = waiting ? '#171c23' : active ? '#3b6f8c' : '#223140';
    context.fillRect(lane.isStart, top, lane.isEnd - lane.isStart, laneHeight);
    context.fillStyle = waiting ? '#241e15' : active ? '#f2a33a' : '#5c4622';
    context.fillRect(lane.oosStart, top, lane.oosEnd - lane.oosStart, laneHeight);
    if (active) {
      context.strokeStyle = '#e8eaed';
      context.lineWidth = 1;
      context.strokeRect(lane.isStart - 2, top - 2, lane.oosEnd - lane.isStart + 4, laneHeight + 4);
    }
    label(item.label, 32, top + laneHeight / 2, active ? '#f5b155' : '#7f8790', 'right');
    if (mode === 'windows') {
      const scale = valueScale(
        [...window.inSampleEquity, ...window.outOfSampleEquity],
        top + 5,
        top + laneHeight - 4,
      );
      for (const sample of ['is', 'oos'] as const) {
        const series = windowSeries(view, window, sample);
        line(
          context,
          equitySegments(series.times, series.values, x, scale.y),
          sample === 'is' ? '#8fd0f0' : '#ffd08a',
          sample === 'is',
        );
      }
      label(
        waiting || window.status === 'failed' ? item.status : item.is,
        lane.isStart + 6,
        top + 9,
        '#aab1b9',
      );
      label(
        item.net,
        width - 12,
        top + laneHeight / 2 - 6,
        window.outOfSample?.netProfit == null
          ? '#7f8790'
          : window.outOfSample.netProfit < 0
            ? '#f06a5d'
            : '#3fbf8a',
        'right',
      );
      label(item.equity, width - 12, top + laneHeight / 2 + 9, '#7f8790', 'right');
    } else if (waiting) {
      label(item.status, lane.isStart + 6, top + laneHeight / 2);
    }
  });
  for (const tick of copy.ticks) label(tick.label, x(tick.time), height - 7, '#7f8790', 'center');
}
