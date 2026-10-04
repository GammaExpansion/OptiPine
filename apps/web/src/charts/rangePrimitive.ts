import type { IChartApi, ISeriesPrimitive, Logical, Time } from 'lightweight-charts';
import type { WindowRanges } from '../workflows/inputs.ts';
import { lowerBound } from './model.ts';

/** Where a window's ranges fall on the bars, as bar indices. */
export interface WindowBands {
  /** The IS range's first bar. */
  readonly from: number;
  /** The OOS range's first bar. */
  readonly split: number;
  /** The bar after the OOS range's last. */
  readonly to: number;
}

/** The bars of a window's ranges; null when the ranges hold none of these bars. */
export function windowBands(times: readonly number[], ranges: WindowRanges): WindowBands | null {
  const from = lowerBound(times, ranges.inSample.start);
  const split = lowerBound(times, ranges.outOfSample.start);
  const to = lowerBound(times, ranges.outOfSample.end);
  return to > from ? { from, split, to } : null;
}

/**
 * The logical range that opens a window's preview: the split a fifth of the way in, with the OOS
 * range after it, as much of it as `most` bars allow (a chart shows no more than its width at
 * the narrowest bar spacing), and a little IS range before it.
 */
export function windowView(bands: WindowBands, most: number): { from: number; to: number } {
  const span = Math.min(most, (bands.to - bands.split) * 1.25);
  const from = Math.max(bands.from, bands.split - span * 0.2);
  return { from, to: from + span };
}

/**
 * A previewed walk-forward window's IS and OOS ranges behind the candles, marked as the Optimize
 * summary marks its split: a faint IS band, an amber OOS band, the split line and both labels,
 * which sit at the pane's foot, clear of the legend at its head.
 */
export function rangePrimitive(
  chart: IChartApi,
  times: () => readonly number[],
  style: {
    readonly inSample: string;
    readonly outOfSample: string;
    readonly split: string;
    readonly font: string;
    readonly labels: { readonly inSample: string; readonly outOfSample: string };
  },
) {
  let ranges: WindowRanges | null = null;
  let requestUpdate = () => {};
  const primitive: ISeriesPrimitive<Time> = {
    attached: (params) => {
      requestUpdate = params.requestUpdate;
    },
    detached: () => {
      requestUpdate = () => {};
    },
    paneViews: () => [
      {
        zOrder: () => 'bottom',
        renderer: () => ({
          draw(target) {
            const bands = ranges && windowBands(times(), ranges);
            if (!bands) return;
            // The chart places whole bars only, so an edge is halfway between two bars' centres.
            const scale = chart.timeScale();
            const edge = (bar: number) => {
              const before = scale.logicalToCoordinate((bar - 1) as Logical);
              const after = scale.logicalToCoordinate(bar as Logical);
              return before === null || after === null ? null : (before + after) / 2;
            };
            const from = edge(bands.from);
            const split = edge(bands.split);
            const to = edge(bands.to);
            if (from === null || split === null || to === null) return;
            target.useMediaCoordinateSpace(({ context, mediaSize }) => {
              context.save();
              context.fillStyle = style.inSample;
              context.globalAlpha = 0.05;
              context.fillRect(from, 0, split - from, mediaSize.height);
              context.fillStyle = style.outOfSample;
              context.globalAlpha = 0.07;
              context.fillRect(split, 0, to - split, mediaSize.height);
              context.globalAlpha = 1;
              context.strokeStyle = style.split;
              context.beginPath();
              context.moveTo(Math.round(split) + 0.5, 0);
              context.lineTo(Math.round(split) + 0.5, mediaSize.height);
              context.stroke();
              context.font = `11px ${style.font}`;
              context.textBaseline = 'bottom';
              context.fillStyle = style.inSample;
              context.textAlign = 'right';
              context.fillText(style.labels.inSample, split - 8, mediaSize.height - 6);
              context.fillStyle = style.outOfSample;
              context.textAlign = 'left';
              context.fillText(style.labels.outOfSample, split + 8, mediaSize.height - 6);
              context.restore();
            });
          },
        }),
      },
    ],
  };
  return {
    primitive,
    setRanges(next: WindowRanges | null) {
      ranges = next;
      requestUpdate();
    },
  };
}
