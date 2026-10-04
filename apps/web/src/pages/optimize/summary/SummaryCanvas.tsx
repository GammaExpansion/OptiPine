import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { formatDate, formatNumber } from '../../../i18n/translate.ts';
import { getOptimizationStore } from '../../../state/optimization.ts';
import type { TopEquity } from '../../../workflows/optimize-session.ts';
import { leaderboardPageSize, type ScatterView } from '../../../workflows/optimize-views.ts';
import { useResultFormat } from '../leaderboard/useResultFormat.ts';
import { envelope, extent, nearestPoint, roundAxis, scale } from './plot-geometry.ts';
import { axisLabel } from './axis-label.ts';
import { usePlotSize } from './usePlotSize.ts';
import styles from './Summary.module.css';

type Chart = { kind: 'equity'; equity: TopEquity } | { kind: 'scatter'; scatter: ScatterView };

/** Resolve a rank through the workflow's published page, then select that page's row. */
export function selectScatterRank(rank: number) {
  if (rank <= 0) return;
  const store = getOptimizationStore();
  store.getState().actions.setPage(Math.floor((rank - 1) / leaderboardPageSize));
  const row = store.getState().views?.leaderboard.rows.find((item) => item.rank === rank);
  if (row) store.getState().actions.select(row.trialId);
}

export function SummaryCanvas({ chart }: { chart: Chart }) {
  const { t } = useI18n();
  const { number } = useResultFormat();
  const { ref, width, height } = usePlotSize();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const helpId = useId();
  const geometry = useMemo(() => {
    const xAxis =
      chart.kind === 'scatter' ? roundAxis(extent([chart.scatter.inSample], true)) : null;
    const xBounds =
      chart.kind === 'scatter'
        ? xAxis!.bounds
        : ([0, Math.max(1, chart.equity.times.length - 1)] as [number, number]);
    const yAxis =
      chart.kind === 'scatter' ? roundAxis(extent([chart.scatter.outOfSample], true), 3) : null;
    const yBounds =
      chart.kind === 'scatter'
        ? yAxis!.bounds
        : extent(chart.equity.curves.flatMap((curve) => (curve.equity ? [curve.equity] : [])));
    const x = scale(xBounds, chart.kind === 'equity' ? 8 : 66, Math.max(67, width - 64));
    const y = scale(yBounds, Math.max(35, height - 28), 20);
    const points =
      chart.kind === 'scatter'
        ? Array.from(chart.scatter.inSample, (value, index) => ({
            x: x(value),
            y: y(chart.scatter.outOfSample[index]),
          }))
        : [];
    return { x, y, xBounds, yBounds, points, xTicks: xAxis?.ticks, yTicks: yAxis?.ticks };
  }, [chart, width, height]);
  useEffect(() => setHover(null), [chart]);
  useEffect(() => {
    const node = canvas.current;
    if (!node || width <= 0 || height <= 0) return;
    const context = node.getContext('2d');
    if (!context) return;
    const ratio = window.devicePixelRatio || 1;
    node.width = Math.round(width * ratio);
    node.height = Math.round(height * ratio);
    context.scale(ratio, ratio);
    const css = getComputedStyle(node);
    const color = (token: string) => css.getPropertyValue(token).trim();
    const { x, y, yBounds, xBounds, points, xTicks, yTicks } = geometry;
    context.font = `11px ${css.fontFamily}`;
    const line = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      stroke: string,
      dash: number[] = [],
    ) => {
      context.beginPath();
      context.strokeStyle = stroke;
      context.lineWidth = 1;
      context.setLineDash(dash);
      context.moveTo(x1, y1);
      context.lineTo(x2, y2);
      context.stroke();
      context.setLineDash([]);
    };
    context.textAlign = chart.kind === 'equity' ? 'left' : 'right';
    for (const value of yTicks ??
      Array.from({ length: 4 }, (_, tick) => yBounds[0] + ((yBounds[1] - yBounds[0]) * tick) / 3)) {
      line(chart.kind === 'equity' ? 8 : 66, y(value), width - 64, y(value), color('--divider'));
      context.fillStyle = color('--caption');
      context.fillText(
        chart.kind === 'scatter'
          ? axisLabel(value)
          : formatNumber(value, { maximumFractionDigits: 0 }),
        chart.kind === 'equity' ? width - 58 : 58,
        y(value) + 4,
      );
    }
    context.textAlign = 'center';
    const horizontalTicks =
      xTicks ??
      Array.from({ length: 5 }, (_, tick) => xBounds[0] + ((xBounds[1] - xBounds[0]) * tick) / 4);
    for (const [tick, value] of horizontalTicks.entries()) {
      let label = axisLabel(value);
      if (chart.kind === 'equity') {
        const time = chart.equity.times[Math.round(value)];
        label = time === undefined ? '' : formatDate(time * 1000);
      }
      context.fillStyle = color('--caption');
      context.textAlign =
        tick === 0 ? 'left' : tick === horizontalTicks.length - 1 ? 'right' : 'center';
      context.fillText(label, x(value), height - 9);
    }
    if (chart.kind === 'equity') {
      const { equity } = chart;
      if (equity.splitIndex !== null) {
        const split = x(equity.splitIndex);
        context.fillStyle = color('--is');
        context.globalAlpha = 0.05;
        context.fillRect(8, 0, split - 8, height - 28);
        context.fillStyle = color('--oos');
        context.globalAlpha = 0.07;
        context.fillRect(split, 0, width - 64 - split, height - 28);
        context.globalAlpha = 1;
        line(split, 0, split, height - 28, color('--primary'));
        context.fillStyle = color('--is');
        context.textAlign = 'right';
        context.fillText(t('optimize.leaderboard.in'), split - 8, 12);
        context.fillStyle = color('--oos');
        context.textAlign = 'left';
        context.fillText(t('optimize.leaderboard.out'), split + 8, 12);
      }
      const curve = (
        values: readonly number[],
        stroke: string,
        thickness: number,
        dash: number[] = [],
      ) => {
        context.beginPath();
        context.strokeStyle = stroke;
        context.lineWidth = thickness;
        context.setLineDash(dash);
        envelope(values, width).forEach((point, index) => {
          if (index === 0) context.moveTo(x(point.index), y(point.value));
          else context.lineTo(x(point.index), y(point.value));
        });
        context.stroke();
        context.setLineDash([]);
      };
      for (const item of equity.curves)
        if (item.equity && item.rank !== 1) {
          context.globalAlpha = 0.4;
          curve(item.equity, color('--is'), 1);
        }
      context.globalAlpha = 1;
      if (equity.median) curve(equity.median, color('--text'), 1.4, [5, 4]);
      const best = equity.curves.find((item) => item.rank === 1)?.equity;
      if (best?.length) {
        curve(best, color('--primary'), 2);
        const last = best.at(-1)!;
        const labelY = Math.max(10, Math.min(height - 38, y(last)));
        context.fillStyle = color('--primary');
        context.fillRect(width - 62, labelY - 9, 60, 18);
        context.textAlign = 'center';
        context.fillStyle = color('--primary-text');
        context.fillText(
          formatNumber(last, { maximumFractionDigits: 0 }),
          width - 32,
          labelY + 4,
          56,
        );
      }
    } else {
      const { scatter } = chart;
      line(x(0), 20, x(0), height - 28, color('--subtle-border'));
      line(66, y(0), width - 64, y(0), color('--subtle-border'));
      points.forEach((point, index) => {
        const rank = scatter.rank[index];
        const onPage =
          scatter.pageRanks && rank >= scatter.pageRanks[0] && rank <= scatter.pageRanks[1];
        context.beginPath();
        context.globalAlpha = rank ? 0.9 : 0.3;
        context.arc(point.x, point.y, rank === 1 ? 4.5 : onPage ? 3.5 : 2.5, 0, Math.PI * 2);
        context.fillStyle = color(
          rank === 1 ? '--primary' : scatter.outOfSample[index] >= 0 ? '--profit' : '--loss',
        );
        context.fill();
        if (onPage || index === hover) {
          context.strokeStyle = color('--text');
          context.lineWidth = index === hover ? 2 : 1;
          context.stroke();
        }
      });
      context.globalAlpha = 1;
      context.fillStyle = color('--secondary');
      context.textAlign = 'left';
      context.fillText(t('optimize.summary.outNet'), 72, 12);
      context.textAlign = 'right';
      context.fillText(t('optimize.summary.inNet'), width - 64, height - 35);
    }
  }, [chart, geometry, width, height, hover, t]);
  const scatter = chart.kind === 'scatter' ? chart.scatter : null;
  const point = scatter && hover !== null && hover < scatter.rank.length ? hover : null;
  return (
    <div ref={ref} className={styles.plot}>
      <canvas
        ref={canvas}
        role="img"
        aria-label={t(
          chart.kind === 'equity' ? 'optimize.summary.equity' : 'optimize.summary.scatter',
        )}
        aria-describedby={scatter ? helpId : undefined}
        tabIndex={scatter ? 0 : undefined}
        onMouseMove={(event) => {
          if (!scatter) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          setHover(
            nearestPoint(geometry.points, event.clientX - bounds.left, event.clientY - bounds.top),
          );
        }}
        onMouseLeave={() => setHover(null)}
        onClick={(event) => {
          if (!scatter) return;
          // Clicks can arrive before the hover update renders, including touch activation.
          const bounds = event.currentTarget.getBoundingClientRect();
          const hit = nearestPoint(
            geometry.points,
            event.clientX - bounds.left,
            event.clientY - bounds.top,
          );
          if (hit !== null) selectScatterRank(scatter.rank[hit]);
        }}
        onKeyDown={(event) => {
          if (!scatter) return;
          if (event.key === 'Enter' && point !== null) selectScatterRank(scatter.rank[point]);
          else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
            event.preventDefault();
            const indices = [...scatter.rank.keys()]
              .filter((index) => scatter.rank[index] > 0)
              .sort((a, b) => scatter.rank[a] - scatter.rank[b]);
            if (!indices.length) return;
            const position = point === null ? -1 : indices.indexOf(point);
            const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
            setHover(indices[(position + direction + indices.length) % indices.length]);
          }
        }}
      />
      {scatter && (
        <span id={helpId} className={styles.srOnly}>
          {t('optimize.summary.scatterHelp')}
        </span>
      )}
      {scatter && point !== null && (
        <div role="status" className={styles.tooltip}>
          <strong>
            {scatter.rank[point]
              ? t('optimize.leaderboard.set', { rank: scatter.rank[point] })
              : t('optimize.summary.filtered')}
          </strong>
          <span>
            {t('optimize.leaderboard.in')} {number(scatter.inSample[point], true, 0)}
          </span>
          <span>
            {t('optimize.leaderboard.out')} {number(scatter.outOfSample[point], true, 0)}
          </span>
        </div>
      )}
    </div>
  );
}
