import type {
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  IPrimitivePaneRenderer,
  SeriesType,
  Time,
  UTCTimestamp,
} from 'lightweight-charts';
import { lowerBound, type PlotMarker } from './model.ts';

const sizes = { auto: 5, tiny: 4, small: 5, normal: 7, large: 10, huge: 14 };

/** Pine glyphs use media pixels, so their sizes survive zoom and high-DPI displays. */
export function drawPlotMarker(
  ctx: CanvasRenderingContext2D,
  marker: PlotMarker,
  x: number,
  y: number,
): void {
  const r = marker.radius ?? sizes[marker.size ?? 'auto'];
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = marker.color;
  ctx.strokeStyle = marker.color;
  ctx.lineWidth = Math.max(1, r / 3);
  ctx.font = `${r * 2 + 4}px Barlow, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (marker.char !== undefined) ctx.fillText(marker.char, 0, 0);
  else {
    ctx.beginPath();
    const polygon = (points: number[][]) => {
      ctx.moveTo(points[0][0] * r, points[0][1] * r);
      for (const [px, py] of points.slice(1)) ctx.lineTo(px * r, py * r);
      ctx.closePath();
    };
    const down = marker.shape?.endsWith('down');
    const d = down ? -1 : 1;
    switch (marker.shape) {
      case 'triangleup':
      case 'triangledown':
        polygon([
          [0, -d],
          [1, d],
          [-1, d],
        ]);
        break;
      case 'arrowup':
      case 'arrowdown':
        polygon([
          [0, -1.4 * d],
          [1, 0],
          [0.35, 0],
          [0.35, 1.4 * d],
          [-0.35, 1.4 * d],
          [-0.35, 0],
          [-1, 0],
        ]);
        break;
      case 'square':
        ctx.rect(-r, -r, 2 * r, 2 * r);
        break;
      case 'diamond':
        polygon([
          [0, -1.3],
          [1, 0],
          [0, 1.3],
          [-1, 0],
        ]);
        break;
      case 'cross':
      case 'xcross':
        if (marker.shape === 'xcross') ctx.rotate(Math.PI / 4);
        ctx.moveTo(-r, 0);
        ctx.lineTo(r, 0);
        ctx.moveTo(0, -r);
        ctx.lineTo(0, r);
        ctx.stroke();
        if (marker.shape === 'xcross') ctx.rotate(-Math.PI / 4);
        break;
      case 'flag':
        polygon([
          [-0.7, 1.4],
          [-0.7, -1.4],
          [1.3, -1.4],
          [0.7, -0.5],
          [-0.4, -0.5],
          [-0.4, 1.4],
        ]);
        break;
      case 'labelup':
      case 'labeldown':
        polygon([
          [0, -1.4 * d],
          [0.5, -0.6 * d],
          [1.4, -0.6 * d],
          [1.4, 1.2 * d],
          [-1.4, 1.2 * d],
          [-1.4, -0.6 * d],
          [-0.5, -0.6 * d],
        ]);
        break;
      case 'circle':
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        break;
    }
    ctx.fill();
  }
  if (marker.text) {
    ctx.font = '11px Barlow, sans-serif';
    ctx.fillText(marker.text, 0, marker.location === 'belowbar' ? r + 9 : -r - 9);
  }
  ctx.restore();
}

/** Draw only the visible markers; no DOM nodes or chart series are allocated per signal. */
export function plotPrimitive(
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
  markers: readonly PlotMarker[],
  tradeMarkers: readonly { time: number; location: 'abovebar' | 'belowbar' }[] = [],
): ISeriesPrimitive<Time> {
  const times = markers.map((marker) => marker.time);
  const reserved = {
    abovebar: tradeMarkers
      .filter((marker) => marker.location === 'abovebar')
      .map((marker) => marker.time)
      .sort((a, b) => a - b),
    belowbar: tradeMarkers
      .filter((marker) => marker.location === 'belowbar')
      .map((marker) => marker.time)
      .sort((a, b) => a - b),
  };
  const margins = { above: 0, below: 0 };
  for (const marker of markers) {
    if (marker.location !== 'abovebar' && marker.location !== 'belowbar') continue;
    const side = marker.location === 'abovebar' ? 'above' : 'below';
    const radius = marker.radius ?? sizes[marker.size ?? 'auto'];
    margins[side] = Math.max(
      margins[side],
      radius * 2.5 + 7 + (reserved[marker.location].length ? 24 : 0) + (marker.text ? 14 : 0),
    );
  }
  const renderer: IPrimitivePaneRenderer = {
    draw(target) {
      const range = chart.timeScale().getVisibleRange();
      if (!range) return;
      const first = lowerBound(times, Number(range.from));
      const last = lowerBound(times, Number(range.to) + 1);
      target.useMediaCoordinateSpace(({ context, mediaSize }) => {
        for (let i = first; i < last; i++) {
          const marker = markers[i];
          const x = chart.timeScale().timeToCoordinate(marker.time as UTCTimestamp);
          const valueY = series.priceToCoordinate(marker.value);
          const r = marker.radius ?? sizes[marker.size ?? 'auto'];
          let offset = r * 1.5 + 5;
          if (x !== null && (marker.location === 'abovebar' || marker.location === 'belowbar')) {
            // Fills commonly occur one bar after a signal. Keep its glyph outside the fill label.
            const occupied = reserved[marker.location];
            const next = lowerBound(occupied, marker.time);
            if (
              [occupied[next - 1], occupied[next]].some((time) => {
                if (time === undefined) return false;
                const tradeX = chart.timeScale().timeToCoordinate(time as UTCTimestamp);
                return tradeX !== null && Math.abs(tradeX - x) < 40 + r;
              })
            )
              offset += 24;
          }
          const y =
            marker.location === 'top'
              ? offset
              : marker.location === 'bottom'
                ? mediaSize.height - offset
                : valueY === null
                  ? null
                  : valueY +
                    (marker.location === 'belowbar'
                      ? offset
                      : marker.location === 'abovebar'
                        ? -offset
                        : 0);
          if (x !== null && y !== null) drawPlotMarker(context, marker, x, y);
        }
      });
    },
  };
  return {
    autoscaleInfo: () => ({ priceRange: null, margins }),
    paneViews: () => [{ zOrder: () => 'normal', renderer: () => renderer }],
  };
}
