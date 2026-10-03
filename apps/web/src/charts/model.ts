import type { MarketBar, PlotOutput, PlotShape, PlotLocation, PlotSize } from '@pine/engine';
import { message, type Message } from '@pine/messages';
import type { DailyPnl, PeriodReturn } from '../workflows/equity.ts';
import type { TradeRow } from '../workflows/trades.ts';

/** Declaration order, including boolean plots; cycle only after all six colours are used. */
export const plotPalette = [
  '#2bb3a3',
  '#8fb8de',
  '#b59bd5',
  '#d9c38c',
  '#6cb6dd',
  '#f2a33a',
] as const;
export const plotColor = (index: number): string => plotPalette[index % plotPalette.length];

/** Fractional ticks such as 0.25 require two places, even though their order of magnitude is 0.1. */
export function pricePrecision(mintick: number): number {
  const [coefficient, exponent = '0'] = String(mintick).split('e');
  const decimals = coefficient.split('.')[1]?.length ?? 0;
  return Math.max(0, Math.min(8, decimals - Number(exponent)));
}

export interface LinePoint {
  time: number;
  value?: number;
  color?: string;
}

/** Whitespace reserves the bar; transparent outgoing segments prevent bridging an na gap. */
export function linePoints(times: readonly number[], values: readonly unknown[]): LinePoint[] {
  return times.map((time, index) => {
    const value = values[index];
    if (typeof value !== 'number' || !Number.isFinite(value)) return { time };
    const next = values[index + 1];
    return {
      time,
      value,
      ...(index < times.length - 1 && (typeof next !== 'number' || !Number.isFinite(next))
        ? { color: 'transparent' }
        : {}),
    };
  });
}

export interface PlotMarker {
  time: number;
  value: number;
  location: PlotLocation;
  shape?: PlotShape;
  char?: string;
  text?: string;
  color: string;
  size?: PlotSize;
  radius?: number;
}

/** Explicit na hides a plot; only an absent colour uses declaration-order fallback. */
export function declaredColor(plot: PlotOutput, index: number, bar?: number): string {
  const color =
    bar !== undefined && plot.colors && bar in plot.colors ? plot.colors[bar] : plot.style?.color;
  return color === null ? 'transparent' : (color ?? plotColor(index));
}

export function mapPlots(bars: readonly MarketBar[], plots: readonly PlotOutput[]) {
  const times = bars.map((bar) => bar.time);
  return plots.map((plot, index) => {
    const style = plot.style;
    const markerPlot = style
      ? style.kind !== 'plot'
      : plot.values.some((value) => typeof value === 'boolean');
    const kind = markerPlot
      ? 'markers'
      : style?.style === 'histogram' ||
          style?.style === 'columns' ||
          style?.style === 'circles' ||
          style?.style === 'cross'
        ? style.style
        : style?.style === 'area' || style?.style === 'areabr'
          ? 'area'
          : 'line';
    const location = style?.location ?? 'abovebar';
    const points = linePoints(
      times,
      markerPlot && location !== 'absolute' ? bars.map((bar) => bar.close) : plot.values,
    ).map((point, i) => ({
      ...point,
      ...(point.value === undefined
        ? {}
        : {
            color:
              (kind === 'line' || kind === 'area') && point.color === 'transparent'
                ? 'transparent'
                : declaredColor(plot, index, i),
          }),
    }));
    const markers: PlotMarker[] =
      markerPlot || kind === 'cross'
        ? bars.flatMap((bar, i) => {
            const value = plot.values[i];
            const absolute = kind === 'cross' || location === 'absolute';
            const active = absolute
              ? typeof value === 'number' && Number.isFinite(value)
              : value === true ||
                (typeof value === 'number' && Number.isFinite(value) && value !== 0);
            if (!active) return [];
            return [
              {
                time: bar.time,
                value: absolute ? (value as number) : location === 'belowbar' ? bar.low : bar.high,
                location: absolute ? 'absolute' : location,
                color: declaredColor(plot, index, i),
                ...(style?.kind === 'char'
                  ? { char: style.char ?? '' }
                  : {
                      shape: (kind === 'cross' ? 'cross' : (style?.style ?? 'circle')) as PlotShape,
                    }),
                text: style?.text,
                size: style?.size,
                ...(kind === 'cross' ? { radius: style?.linewidth ?? 1 } : {}),
              },
            ];
          })
        : [];
    return {
      title: plot.title,
      color: declaredColor(plot, index),
      pane: plot.overlay ? 0 : 1,
      kind,
      linewidth: style?.linewidth ?? 1,
      stepped: style?.style === 'stepline' || style?.style === 'steplinebr',
      absolute: location === 'absolute' || kind === 'cross',
      points,
      markers,
    };
  });
}

export interface TradeMarker {
  time: number;
  position: 'aboveBar' | 'belowBar';
  shape: 'arrowUp' | 'arrowDown' | 'circle';
  side: 'long' | 'short';
  tradeNumber: number;
  label: Message;
}

/** A long enters below and exits above; a short enters above and exits below. */
export function tradeMarkers(trades: readonly TradeRow[]): TradeMarker[] {
  return trades
    .flatMap((trade): TradeMarker[] => {
      const long = trade.side === 'long';
      const markers: TradeMarker[] = [
        {
          time: trade.entryTime,
          position: long ? 'belowBar' : 'aboveBar',
          shape: long ? 'arrowUp' : 'arrowDown',
          side: trade.side,
          tradeNumber: trade.number,
          label: message(long ? 'charts.long' : 'charts.short'),
        },
      ];
      if (!trade.open && trade.exitTime !== null)
        markers.push({
          time: trade.exitTime,
          position: long ? 'aboveBar' : 'belowBar',
          shape: 'circle',
          side: trade.side,
          tradeNumber: trade.number,
          label: message('charts.exitMarker', { number: trade.number }),
        });
      return markers;
    })
    .sort((a, b) => a.time - b.time || a.tradeNumber - b.tradeNumber);
}

export function lowerBound(times: readonly number[], time: number): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (times[mid] < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function tradeRange(times: readonly number[], trade: TradeRow) {
  const start = lowerBound(times, trade.entryTime);
  const end = trade.exitTime === null ? times.length - 1 : lowerBound(times, trade.exitTime);
  const padding = Math.max(12, Math.ceil((end - start) * 0.35));
  return { from: start - padding, to: end + padding };
}

export const dayNumber = (date: string): number => Date.parse(`${date}T00:00:00Z`) / 86_400_000;
/** Monday-first weeks remain aligned across missing days, month boundaries and leap years. */
export function calendarLayout(days: readonly DailyPnl[]) {
  if (!days.length) return { cells: [], weeks: 0, firstMonday: 0 };
  const firstMonday = dayNumber(days[0].date) - days[0].weekday + 1;
  const cells = days.map((day) => {
    const ordinal = dayNumber(day.date);
    const column = Math.floor((ordinal - firstMonday) / 7);
    return { ...day, column, row: day.weekday - 1, monday: firstMonday + column * 7 };
  });
  return { cells, firstMonday, weeks: cells.at(-1)!.column + 1 };
}

/** Buckets retain workflow returns, including null periods, rather than averaging daily returns. */
export function monthlyBuckets(months: readonly PeriodReturn[]) {
  return months.map((month) => {
    const [year, number] = month.period.split('-').map(Number);
    return {
      ...month,
      from: Date.UTC(year, number - 1, 1) / 86_400_000,
      to: Date.UTC(year, number, 1) / 86_400_000,
    };
  });
}

/** Map calendar dates to the same logical bar axis, interpolating days without sessions. */
export function dateAxis(dates: readonly string[]) {
  const days: number[] = [];
  const indices: number[] = [];
  dates.forEach((date, index) => {
    const day = dayNumber(date);
    if (days.at(-1) !== day) {
      days.push(day);
      indices.push(index);
    }
  });
  if (days.length) {
    days.push(days.at(-1)! + 1);
    indices.push(dates.length);
  }
  return (day: number): number => {
    if (days.length < 2) return 0;
    const right = Math.min(days.length - 1, Math.max(1, lowerBound(days, day)));
    const left = right - 1;
    return (
      indices[left] +
      ((day - days[left]) / (days[right] - days[left])) * (indices[right] - indices[left])
    );
  };
}
