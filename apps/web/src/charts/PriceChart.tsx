import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  CandlestickSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesType,
  type Time,
  type UTCTimestamp,
  type SeriesMarker,
} from 'lightweight-charts';
import type { MarketBar, PlotOutput } from '@pine/engine';
import type { TradeRow } from '../workflows/trades.ts';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { formatNumber } from '../i18n/translate.ts';
import { declaredColor, lowerBound, mapPlots, tradeMarkers, tradeRange } from './model.ts';
import { barChange, priceFormat, priceTickLabels } from './formatting.ts';
import {
  chartOptions,
  chartTheme,
  keepTimeLabelsInside,
  timeFormat,
  zoomChart,
} from './runtime.ts';
import { tradePrimitive } from './tradePrimitive.ts';
import { plotPrimitive } from './plotPrimitive.ts';
import { addPlotSeries } from './plotSeries.ts';
import styles from './Charts.module.css';

export interface PriceChartProps {
  bars: readonly MarketBar[];
  plots: readonly PlotOutput[];
  trades: readonly TradeRow[];
  symbol: string;
  timeframe?: string;
  timezone: string;
  dimMarkers?: boolean;
  mintick?: number;
  hoveredTrade?: TradeRow | null;
  className?: string;
}
export interface PriceChartHandle {
  /** Uses the same TradeRow as the Trades tab; null clears the focused trade. */
  focusTrade(trade: TradeRow | null): void;
  resetView(): void;
}

export const PriceChart = forwardRef<PriceChartHandle, PriceChartProps>(function PriceChart(
  {
    bars,
    plots,
    trades,
    symbol,
    timeframe,
    timezone,
    dimMarkers = false,
    mintick = 0.01,
    hoveredTrade = null,
    className,
  },
  ref,
) {
  const { t, text, language } = useI18n();
  const host = useRef<HTMLDivElement>(null);
  const legend = useRef<HTMLDivElement>(null);
  const paneLegend = useRef<HTMLDivElement>(null);
  const runtime = useRef<{
    chart: IChartApi;
    candles: ISeriesApi<'Candlestick'>;
    overlay: ReturnType<typeof tradePrimitive>;
    times: number[];
    cursor: number;
    showLegend: (index: number) => void;
    markers?: ISeriesMarkersPluginApi<Time>;
    tradeMarkers?: SeriesMarker<Time>[];
  } | null>(null);
  const [focused, setFocused] = useState<TradeRow | null>(null);
  const selected = hoveredTrade ?? focused;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const dimRef = useRef(dimMarkers);
  dimRef.current = dimMarkers;
  const number = (value: number) => formatNumber(value, { maximumFractionDigits: 2 });
  const price = priceFormat(mintick).formatter;
  const resetView = () => {
    const current = runtime.current;
    if (current?.times.length)
      current.chart.timeScale().setVisibleLogicalRange({
        from: Math.max(-1, current.times.length - 150),
        to: current.times.length + 4,
      });
  };
  useImperativeHandle(ref, () => ({
    focusTrade(trade) {
      setFocused(trade);
      const current = runtime.current;
      if (trade && current?.times.length) {
        current.chart.timeScale().setVisibleLogicalRange(tradeRange(current.times, trade));
        current.showLegend(lowerBound(current.times, trade.entryTime));
      }
      host.current?.focus({ preventScroll: true });
    },
    resetView,
  }));

  useEffect(() => {
    const element = host.current!;
    const theme = chartTheme(element);
    const options = chartOptions(element, timezone, language);
    const chart = createChart(element, options);
    const releaseTimeLabels = keepTimeLabelsInside(chart, options.timeScale!.tickMarkFormatter!);
    // Adjacent panes must not paint partial tick labels across their shared boundary.
    chart.applyOptions({ rightPriceScale: { entireTextOnly: true } });
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: theme.canvas,
      borderUpColor: theme.profit,
      wickUpColor: theme.profit,
      downColor: theme.loss,
      borderDownColor: theme.loss,
      wickDownColor: theme.loss,
      priceFormat: priceFormat(mintick),
    });
    const overlay = tradePrimitive(
      chart,
      candles,
      theme,
      (value) => t('charts.percent', { value: number(value) }),
      () => {
        if (paneLegend.current)
          paneLegend.current.style.top = `${chart.panes()[0].getHeight() + 8}px`;
      },
    );
    candles.attachPrimitive(overlay.primitive);
    runtime.current = { chart, candles, overlay, times: [], cursor: -1, showLegend: () => {} };
    return () => {
      runtime.current = null;
      releaseTimeLabels();
      chart.remove();
    };
  }, [timezone, mintick, t, language]);

  useEffect(() => {
    const current = runtime.current!;
    const { chart, candles, overlay } = current;
    const theme = chartTheme(host.current!);
    const times = bars.map((bar) => bar.time);
    current.times = times;
    candles.setData(bars.map((bar) => ({ ...bar, time: bar.time as UTCTimestamp })));
    const format = priceFormat(mintick);
    candles.applyOptions({
      priceFormat: {
        ...format,
        tickmarksFormatter: (values: number[]) =>
          priceTickLabels(
            values,
            format.tickmarksFormatter(values),
            (value) => candles.priceToCoordinate(value),
            bars.at(-1)?.close,
          ),
      },
    });
    const mapped = mapPlots(bars, plots);
    const series: ISeriesApi<SeriesType>[] = [];
    const primitives: {
      series: ISeriesApi<SeriesType>;
      primitive: ReturnType<typeof plotPrimitive>;
    }[] = [];
    const plugins: ISeriesMarkersPluginApi<Time>[] = [];
    const markers: SeriesMarker<Time>[] = tradeMarkers(trades).map((marker) => ({
      ...marker,
      time: marker.time as UTCTimestamp,
      color: marker.side === 'long' ? theme.profit : theme.loss,
      text: text(marker.label),
      size: 0.8,
    }));
    for (const plot of mapped) {
      const onCandles = plot.kind === 'markers' && plot.pane === 0 && !plot.absolute;
      const target = onCandles ? candles : addPlotSeries(chart, plot, mintick);
      if (!onCandles) series.push(target);
      if (plot.markers.length) {
        const primitive = plotPrimitive(
          chart,
          target,
          plot.markers,
          plot.pane === 0
            ? markers.map((marker) => ({
                time: Number(marker.time),
                location: marker.position === 'aboveBar' ? 'abovebar' : 'belowbar',
              }))
            : [],
        );
        target.attachPrimitive(primitive);
        primitives.push({ series: target, primitive });
      }
    }
    current.tradeMarkers = markers.sort((a, b) => Number(a.time) - Number(b.time));
    current.markers = createSeriesMarkers(
      candles,
      current.tradeMarkers.map((marker) => ({
        ...marker,
        color: dimRef.current ? `${marker.color}66` : marker.color,
      })),
    );
    plugins.push(current.markers);
    chart.panes()[0].setStretchFactor(3);
    chart.panes()[1]?.setStretchFactor(1);
    overlay.setData(trades, times.at(-1) ?? 0);
    overlay.select(selectedRef.current);
    overlay.setDimmed(dimRef.current);
    const showLegend = (index: number) => {
      const bar = bars[index];
      if (!bar || !legend.current || !paneLegend.current) return;
      current.cursor = index;
      legend.current.replaceChildren();
      paneLegend.current.replaceChildren();
      const add = (parent: HTMLElement, value: string, color?: string) => {
        const span = document.createElement('span');
        span.textContent = value;
        if (color) span.style.color = color;
        parent.append(span);
      };
      const identity = document.createElement('span');
      const ticker = document.createElement('strong');
      ticker.textContent = symbol;
      identity.append(ticker);
      if (timeframe) add(identity, timeframe);
      legend.current.append(identity);
      add(
        legend.current,
        t('charts.ohlc', {
          open: price(bar.open),
          high: price(bar.high),
          low: price(bar.low),
          close: price(bar.close),
        }),
        bar.close >= bar.open ? theme.profit : theme.loss,
      );
      const change = barChange(bar.close, bars[index - 1]?.close);
      add(
        legend.current,
        change === null ? t('charts.na') : t('charts.percent', { value: change }),
        change?.startsWith('−') ? theme.loss : theme.profit,
      );
      for (let i = 0; i < plots.length; i++) {
        if (mapped[i].kind === 'markers') continue;
        const value = plots[i].values[index];
        add(
          mapped[i].pane === 0 ? legend.current : paneLegend.current,
          t('charts.plotValue', {
            title: plots[i].title,
            value:
              typeof value === 'number' && Number.isFinite(value) ? number(value) : t('charts.na'),
          }),
          declaredColor(plots[i], i, index),
        );
      }
      paneLegend.current.style.top = `${chart.panes()[0].getHeight() + 8}px`;
    };
    current.showLegend = showLegend;
    const crosshair = (event: { time?: Time }) =>
      showLegend(
        event.time === undefined ? bars.length - 1 : lowerBound(times, Number(event.time)),
      );
    chart.subscribeCrosshairMove(crosshair);
    const resized = () => showLegend(current.cursor);
    chart.timeScale().subscribeSizeChange(resized);
    showLegend(bars.length - 1);
    resetView();
    return () => {
      // The owning effect may already have removed the chart (unmount, locale or timezone).
      if (runtime.current?.chart !== chart) return;
      chart.unsubscribeCrosshairMove(crosshair);
      chart.timeScale().unsubscribeSizeChange(resized);
      plugins.forEach((plugin) => plugin.detach());
      primitives.forEach(({ series, primitive }) => series.detachPrimitive(primitive));
      series.forEach((line) => chart.removeSeries(line));
      legend.current?.replaceChildren();
      paneLegend.current?.replaceChildren();
    };
  }, [bars, plots, trades, symbol, timeframe, timezone, mintick, t, text]);

  useEffect(() => {
    const current = runtime.current;
    current?.overlay.setDimmed(dimMarkers);
    current?.markers?.setMarkers(
      (current.tradeMarkers ?? []).map((marker) => ({
        ...marker,
        color: dimMarkers ? `${marker.color}66` : marker.color,
      })),
    );
  }, [dimMarkers]);

  useEffect(() => {
    runtime.current?.overlay.select(selected);
  }, [selected]);

  useEffect(() => {
    setFocused(null);
  }, [bars, trades]);

  return (
    <section
      className={`${styles.price} ${className ?? ''}`}
      data-testid="price-chart"
      data-focused-trade={focused?.number}
      data-markers-dimmed={dimMarkers}
    >
      <div className={styles.legend} ref={legend} />
      <div className={styles.paneLegend} ref={paneLegend} />
      <div
        className={styles.chart}
        ref={host}
        tabIndex={0}
        role="group"
        aria-label={t('charts.priceKeyboard', { symbol, timezone })}
        onKeyDown={(event) => {
          const current = runtime.current;
          if (!current) return;
          if (event.key === 'Escape') {
            setFocused(null);
            current.chart.clearCrosshairPosition();
          } else if (event.key === '+' || event.key === '=') zoomChart(current.chart, 0.8);
          else if (event.key === '-') zoomChart(current.chart, 1.25);
          else if (event.key === 'Home') current.chart.timeScale().fitContent();
          else if (event.key === 'End') resetView();
          else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            const index = Math.max(
              0,
              Math.min(bars.length - 1, current.cursor + (event.key === 'ArrowLeft' ? -1 : 1)),
            );
            const bar = bars[index];
            if (!bar) return;
            const range = current.chart.timeScale().getVisibleLogicalRange();
            if (range && (index < range.from || index > range.to)) {
              const shift = index < range.from ? index - range.from - 1 : index - range.to + 1;
              current.chart
                .timeScale()
                .setVisibleLogicalRange({ from: range.from + shift, to: range.to + shift });
            }
            current.chart.setCrosshairPosition(
              bar.close,
              bar.time as UTCTimestamp,
              current.candles,
            );
            current.showLegend(index);
          } else return;
          event.preventDefault();
        }}
      />
      {selected && (
        <aside className={styles.tradeDetail} role="status" data-testid="trade-detail">
          <strong>
            {t('charts.tradeTitle', {
              number: selected.number,
              side: t(selected.side === 'long' ? 'charts.long' : 'charts.short'),
            })}
          </strong>
          <span className={selected.pnl >= 0 ? styles.profit : styles.loss}>
            {t('charts.pnl', { value: number(selected.pnl), percent: number(selected.pnlPercent) })}
          </span>
          <span>
            {t('charts.entry', {
              time: timeFormat(timezone).format(selected.entryTime * 1000),
              price: price(selected.entryPrice),
            })}
          </span>
          <span>
            {selected.exitTime === null
              ? t('charts.openTrade', { price: price(selected.exitPrice) })
              : t('charts.exit', {
                  time: timeFormat(timezone).format(selected.exitTime * 1000),
                  price: price(selected.exitPrice),
                })}
          </span>
          <span>
            {t('charts.held', {
              count: selected.bars,
              bars: selected.bars,
              quantity: number(selected.quantity),
            })}
          </span>
        </aside>
      )}
    </section>
  );
});
