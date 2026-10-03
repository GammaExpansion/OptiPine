import type {
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  IPrimitivePaneRenderer,
  Time,
  UTCTimestamp,
} from 'lightweight-charts';
import type { TradeRow } from '../workflows/trades.ts';
import { lowerBound } from './model.ts';

/** A primitive redraws with the price scale too, including when the user drags its axis. */
export function tradePrimitive(
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  colors: { profit: string; loss: string; primary: string },
  percent: (value: number) => string,
  onDraw?: () => void,
) {
  let trades: readonly TradeRow[] = [];
  let starts: number[] = [];
  let ends: number[] = [];
  let lastTime = 0;
  let selected: TradeRow | null = null;
  let requestUpdate = () => {};
  const renderer: IPrimitivePaneRenderer = {
    draw(target) {
      onDraw?.();
      const range = chart.timeScale().getVisibleRange();
      if (!range) return;
      target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
        const first = lowerBound(ends, Number(range.from));
        const last = lowerBound(starts, Number(range.to) + 1);
        const visible = trades.slice(first, last);
        if (selected && !visible.includes(selected)) visible.push(selected);
        for (const trade of visible) {
          if (
            (trade.exitTime ?? lastTime) < Number(range.from) ||
            trade.entryTime > Number(range.to)
          )
            continue;
          const x1 = chart.timeScale().timeToCoordinate(trade.entryTime as UTCTimestamp);
          const x2 = chart
            .timeScale()
            .timeToCoordinate((trade.exitTime ?? lastTime) as UTCTimestamp);
          const y1 = series.priceToCoordinate(trade.entryPrice);
          const y2 = series.priceToCoordinate(trade.exitPrice);
          if (x1 === null || x2 === null || y1 === null || y2 === null) continue;
          const active = selected?.number === trade.number;
          const color = trade.pnl >= 0 ? colors.profit : colors.loss;
          ctx.save();
          if (active) {
            ctx.fillStyle = colors.primary;
            ctx.globalAlpha = 0.07;
            ctx.fillRect(x1, 0, Math.max(2, x2 - x1), mediaSize.height);
            ctx.globalAlpha = 1;
          }
          ctx.strokeStyle = active ? colors.primary : color;
          ctx.lineWidth = active ? 2 : 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          ctx.setLineDash([]);
          if (active) {
            for (const [x, y] of [
              [x1, y1],
              [x2, y2],
            ]) {
              ctx.beginPath();
              ctx.arc(x, y, 5, 0, Math.PI * 2);
              ctx.stroke();
            }
          }
          if (x2 - x1 > 42) {
            ctx.fillStyle = color;
            ctx.font = '11px Barlow, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(percent(trade.pnlPercent), (x1 + x2) / 2, (y1 + y2) / 2 - 7);
          }
          ctx.restore();
        }
      });
    },
  };
  const primitive: ISeriesPrimitive<Time> = {
    attached(context) {
      requestUpdate = context.requestUpdate;
    },
    detached() {
      requestUpdate = () => {};
    },
    paneViews: () => [{ zOrder: () => 'normal', renderer: () => renderer }],
  };
  return {
    primitive,
    setData(value: readonly TradeRow[], end: number) {
      trades = [...value].sort((a, b) => a.entryTime - b.entryTime);
      starts = trades.map((trade) => trade.entryTime);
      let max = -Infinity;
      ends = trades.map((trade) => (max = Math.max(max, trade.exitTime ?? end)));
      lastTime = end;
      requestUpdate();
    },
    select(trade: TradeRow | null) {
      selected = trade;
      requestUpdate();
    },
  };
}
