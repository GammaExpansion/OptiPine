import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AreaSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Logical,
  type LogicalRange,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { EquityInput, EquitySummary } from '../workflows/equity.ts';
import { localDates } from '../workflows/equity.ts';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { formatNumber } from '../i18n/translate.ts';
import { dateAxis, linePoints, lowerBound } from './model.ts';
import { chartOptions, chartTheme, zoomChart } from './runtime.ts';
import { CalendarStrip } from './CalendarStrip.tsx';
import { MonthlyReturns } from './MonthlyReturns.tsx';
import type { CalendarHandle } from './svg.ts';
import { drawdownTickLabels, priceFormat } from './formatting.ts';
import { pointLabelPrimitive } from './pointLabelPrimitive.ts';
import styles from './Charts.module.css';

export interface EquityChartsProps {
  input: EquityInput;
  summary: EquitySummary;
  /** Disable while a PriceChart on the same screen supplies the single attribution link. */
  showAttribution?: boolean;
  /** Page-owned facts, placed below the toolbar and above the flexible chart stack. */
  afterToolbar?: ReactNode;
  className?: string;
}

// A tab can unmount while another dock tab is active. Retain only a user's view, by result.
const userRanges = new WeakMap<EquityInput, LogicalRange>();

/** The workflow owns all financial calculations; this component only projects its output. */
export function EquityCharts({
  input,
  summary,
  showAttribution = true,
  afterToolbar,
  className,
}: EquityChartsProps) {
  const { t } = useI18n();
  const [unit, setUnit] = useState<'amount' | 'percent'>('amount');
  const equityHost = useRef<HTMLDivElement>(null);
  const drawdownHost = useRef<HTMLDivElement>(null);
  const shade = useRef<HTMLDivElement>(null);
  const calendar = useRef<CalendarHandle>(null);
  const months = useRef<CalendarHandle>(null);
  const charts = useRef<IChartApi[]>([]);
  const resetView = useRef(() => {});

  useEffect(() => {
    const eqHost = equityHost.current!;
    const ddHost = drawdownHost.current!;
    const theme = chartTheme(eqHost);
    const options = chartOptions(eqHost, input.timezone);
    // Own sizing so fitting cannot race the library's asynchronous autoSize observer.
    options.autoSize = false;
    options.layout = { ...options.layout, attributionLogo: false };
    const equity = createChart(eqHost, options);
    const drawdown = createChart(ddHost, options);
    charts.current = [equity, drawdown];
    equity.applyOptions({
      timeScale: { visible: false, minBarSpacing: 0.001 },
      rightPriceScale: { scaleMargins: { top: 0.16, bottom: 0.12 } },
    });
    drawdown.applyOptions({
      timeScale: { visible: false, minBarSpacing: 0.001 },
      rightPriceScale: { scaleMargins: { top: 0.08, bottom: 0.04 } },
    });
    const eq = equity.addSeries(AreaSeries, {
      lineColor: theme.primary,
      topColor: `${theme.primary}20`,
      bottomColor: `${theme.primary}05`,
      lineWidth: 2,
      priceLineVisible: false,
    });
    const dd = drawdown.addSeries(AreaSeries, {
      lineColor: theme.loss,
      topColor: `${theme.loss}08`,
      bottomColor: `${theme.loss}55`,
      lineWidth: 1,
      priceLineVisible: false,
    });
    const equityValues =
      unit === 'amount'
        ? input.equity
        : input.equity.map((value) =>
            input.initialCapital === 0 ? NaN : (value / input.initialCapital - 1) * 100,
          );
    const ddValues = unit === 'amount' ? summary.drawdown : summary.drawdownPercent;
    const format = (value: number) =>
      unit === 'percent'
        ? t('charts.percent', { value: formatNumber(value, { maximumFractionDigits: 1 }) })
        : formatNumber(value, { maximumFractionDigits: 0 });
    for (const series of [eq, dd])
      series.applyOptions({
        priceFormat: {
          ...priceFormat(unit === 'percent' ? 0.01 : 1),
          formatter: format,
          tickmarksFormatter: (values: number[]) => {
            if (unit === 'amount' && series === dd)
              return drawdownTickLabels(values, (value) => t('charts.thousands', { value }));
            const labels = priceFormat(unit === 'percent' ? 0.01 : 1).tickmarksFormatter!(values);
            return unit === 'percent'
              ? labels.map((value) => t('charts.percent', { value }))
              : labels;
          },
        },
      });
    const points = (values: readonly number[]) =>
      linePoints(input.times, values).map(({ color, ...point }) => ({
        ...point,
        time: point.time as UTCTimestamp,
        ...(color ? { lineColor: color, topColor: 'transparent', bottomColor: 'transparent' } : {}),
      }));
    eq.setData(points(equityValues));
    dd.setData(points(ddValues));
    eq.createPriceLine({
      price: unit === 'amount' ? input.initialCapital : 0,
      color: theme.secondary,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: false,
    });
    if (summary.maxDrawdown && (unit === 'amount' || input.initialCapital !== 0)) {
      const peak = summary.maxDrawdown.peak;
      const peakValue =
        unit === 'amount' ? peak.equity : (peak.equity / input.initialCapital - 1) * 100;
      eq.createPriceLine({
        price: peakValue,
        color: theme.secondary,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
        title: t('charts.peak'),
      });
      eq.attachPrimitive(
        pointLabelPrimitive(
          equity,
          eq,
          {
            time: peak.time as UTCTimestamp,
            value: peakValue,
            text: t('charts.peakValue', { value: format(peakValue) }),
          },
          { color: theme.secondary, background: theme.canvas, font: theme.font },
        ),
      );
    }
    const axis = dateAxis(localDates(input.times, input.timezone));
    const fullRange = { from: 0 as Logical, to: Math.max(1, input.times.length - 1) as Logical };
    let view = userRanges.get(input) ?? fullRange;
    let activeChart: IChartApi | null = null;
    let frame = 0;
    const render = () => {
      frame = 0;
      const width = eqHost.clientWidth + 28;
      const viewport = {
        width,
        project: (day: number) =>
          28 + (equity.timeScale().logicalToCoordinate(axis(day) as Logical) ?? 0),
      };
      calendar.current?.render(viewport);
      months.current?.render(viewport);
      const max = summary.maxDrawdown;
      if (shade.current && max) {
        const a = equity.timeScale().timeToCoordinate(max.peak.time as UTCTimestamp);
        const b = equity.timeScale().timeToCoordinate(max.trough.time as UTCTimestamp);
        const left = Math.max(0, a ?? 0);
        const right = Math.min(equity.paneSize().width, b ?? 0);
        shade.current.style.left = `${28 + left}px`;
        shade.current.style.width = `${Math.max(0, right - left)}px`;
        shade.current.style.visibility = right > left ? 'visible' : 'hidden';
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(render);
    };
    let syncing = false;
    const syncRange = (source: IChartApi, target: IChartApi) => (range: LogicalRange | null) => {
      // Only the pane receiving user input may change the shared view. A resize or a queued
      // range update from the other pane must never overwrite it with an intermediate range.
      if (range && source === activeChart) {
        view = range;
        userRanges.set(input, range);
        target.timeScale().setVisibleLogicalRange(range);
      }
      schedule();
    };
    const eqRange = syncRange(equity, drawdown);
    const ddRange = syncRange(drawdown, equity);
    equity.timeScale().subscribeVisibleLogicalRangeChange(eqRange);
    drawdown.timeScale().subscribeVisibleLogicalRangeChange(ddRange);
    const crosshair =
      (target: IChartApi, series: ISeriesApi<'Area'>, values: readonly number[]) =>
      (event: MouseEventParams<Time>) => {
        if (syncing) return;
        syncing = true;
        const index = event.time === undefined ? -1 : lowerBound(input.times, Number(event.time));
        if (index < 0 || !Number.isFinite(values[index])) target.clearCrosshairPosition();
        else target.setCrosshairPosition(values[index], event.time!, series);
        syncing = false;
      };
    const eqCross = crosshair(drawdown, dd, ddValues);
    const ddCross = crosshair(equity, eq, equityValues);
    equity.subscribeCrosshairMove(eqCross);
    drawdown.subscribeCrosshairMove(ddCross);
    const applyView = () => {
      activeChart = null;
      equity.timeScale().setVisibleLogicalRange(view);
      drawdown.timeScale().setVisibleLogicalRange(view);
      schedule();
    };
    resetView.current = () => {
      userRanges.delete(input);
      view = fullRange;
      applyView();
    };
    const sizeCharts = () => {
      if (!eqHost.clientWidth || !eqHost.clientHeight || !ddHost.clientHeight) return;
      activeChart = null;
      equity.resize(eqHost.clientWidth, eqHost.clientHeight, true);
      drawdown.resize(ddHost.clientWidth, ddHost.clientHeight, true);
      applyView();
    };
    const resize = new ResizeObserver(sizeCharts);
    resize.observe(eqHost);
    resize.observe(ddHost);
    sizeCharts();
    const activateEquity = () => (activeChart = equity);
    const activateDrawdown = () => (activeChart = drawdown);
    for (const event of ['pointerdown', 'wheel'] as const) {
      eqHost.addEventListener(event, activateEquity, { capture: true, passive: true });
      ddHost.addEventListener(event, activateDrawdown, { capture: true, passive: true });
    }
    const keyboard = (event: KeyboardEvent) => {
      activeChart = equity;
      if (event.key === '+' || event.key === '=') zoomChart(equity, 0.8);
      else if (event.key === '-') zoomChart(equity, 1.25);
      else if (event.key === 'Home') resetView.current();
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const range = equity.timeScale().getVisibleLogicalRange();
        if (range) {
          const step = (range.to - range.from) * (event.key === 'ArrowLeft' ? -0.1 : 0.1);
          equity
            .timeScale()
            .setVisibleLogicalRange({ from: range.from + step, to: range.to + step });
        }
      } else return;
      event.preventDefault();
    };
    eqHost.addEventListener('keydown', keyboard);
    ddHost.addEventListener('keydown', keyboard);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      for (const event of ['pointerdown', 'wheel'] as const) {
        eqHost.removeEventListener(event, activateEquity, true);
        ddHost.removeEventListener(event, activateDrawdown, true);
      }
      eqHost.removeEventListener('keydown', keyboard);
      ddHost.removeEventListener('keydown', keyboard);
      charts.current = [];
      resetView.current = () => {};
      equity.remove();
      drawdown.remove();
    };
  }, [input, summary, unit, t]);

  useEffect(() => {
    // Ownership can change without reloading series or losing the visible range.
    charts.current[0]?.applyOptions({ layout: { attributionLogo: showAttribution } });
  }, [showAttribution, input, summary, unit, t]);

  return (
    <section className={`${styles.equity} ${className ?? ''}`} data-testid="equity-charts">
      <div className={styles.toolbar}>
        <span className={styles.equityKey}>{t('charts.equity')}</span>
        <span className={styles.drawdownKey}>{t('charts.drawdown')}</span>
        <span className={styles.maxKey}>{t('charts.maxPeriod')}</span>
        <span className={styles.profitKey}>{t('charts.winningDay')}</span>
        <span className={styles.lossKey}>{t('charts.losingDay')}</span>
        <span className={styles.hint}>{t('charts.colorHint')}</span>
        <div className={styles.unit} role="group" aria-label={t('charts.unit')}>
          <button aria-pressed={unit === 'amount'} onClick={() => setUnit('amount')}>
            {t('charts.amount')}
          </button>
          <button aria-pressed={unit === 'percent'} onClick={() => setUnit('percent')}>
            {t('charts.percentage')}
          </button>
        </div>
        <button
          className={styles.reset}
          aria-label={t('charts.resetZoom')}
          onClick={() => resetView.current()}
        >
          {t('charts.resetSymbol')}
        </button>
      </div>
      {afterToolbar}
      <div className={styles.equityBody}>
        <div
          className={styles.equityCanvas}
          ref={equityHost}
          tabIndex={0}
          role="group"
          aria-label={t('charts.equityKeyboard')}
        />
        <div
          className={styles.drawdownCanvas}
          ref={drawdownHost}
          tabIndex={0}
          role="group"
          aria-label={t('charts.drawdownKeyboard')}
        />
        {summary.maxDrawdown && (
          <div ref={shade} className={styles.drawdownShade}>
            <span>
              {t('charts.maxDrawdown', {
                value: formatNumber(summary.maxDrawdown.percent, { maximumFractionDigits: 2 }),
              })}
            </span>
          </div>
        )}
        <CalendarStrip days={summary.days} unit={unit} ref={calendar} />
        <MonthlyReturns months={summary.months} yearly={summary.yearly} ref={months} />
      </div>
    </section>
  );
}
