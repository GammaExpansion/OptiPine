import { useEffect, useMemo, useRef, useState } from 'react';
import type { SearchRow } from '../../workflows/optimize-setup.ts';
import type { Heatmap, HeatmapCell } from '@pine/optimizer';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { formatNumber } from '../../i18n/translate.ts';
import {
  axisLabel,
  failedConstraintLabel,
  rangeLabel,
  valueLabel,
} from '../../pages/optimize/map/map-labels.ts';
import {
  cellAt,
  cellPitch,
  cellRect,
  colorStep,
  containsSelection,
  heatTokens,
  fitMap,
  mapGeometry,
  verticalTitle,
} from './geometry.ts';
import styles from './canvas.module.css';
import { markersByCell, type MapMarker } from './map-markers.ts';

export interface CellHover {
  readonly cell: HeatmapCell;
  readonly left: number;
  readonly top: number;
  readonly map: Heatmap;
}

const noFrames: readonly HeatmapCell[] = [];
const noMarkers: readonly MapMarker[] = [];

/** One viewport-sized canvas, including for many Z layers. Scrolling never allocates cell nodes. */
export function HeatmapCanvas({
  map: sourceMap,
  selection,
  markers = noMarkers,
  searchRows,
  framed = noFrames,
  showValues = false,
  label,
  keyboardDescription,
  onHover,
  onActivate,
  fitToPanel = true,
}: {
  map: Heatmap;
  searchRows?: readonly SearchRow[];
  selection?: Readonly<Record<string, unknown>>;
  markers?: readonly MapMarker[];
  framed?: readonly HeatmapCell[];
  showValues?: boolean;
  label: string;
  keyboardDescription?: string;
  onHover: (hover: CellHover | null) => void;
  onActivate: (cell: HeatmapCell, map: Heatmap) => void;
  fitToPanel?: boolean;
}) {
  const { t, text } = useI18n();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const map = useMemo(
    () => (showValues || !fitToPanel ? sourceMap : fitMap(sourceMap, size.width, size.height)),
    [sourceMap, size, showValues, fitToPanel],
  );
  const rowFor = (title: string | undefined) =>
    searchRows?.find((row) => row.descriptor.title === title);
  const xRow = rowFor(map.xKey);
  const yRow = rowFor(map.yKey);
  const zRow = rowFor(map.zKey);
  const geometry = useMemo(() => mapGeometry(map), [map]);
  const viewport = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const active = useRef<HeatmapCell | null>(null);
  const redraw = useRef(() => {});
  const [description, setDescription] = useState('');
  const [inspected, setInspected] = useState<HeatmapCell | null>(null);
  const hoverCallback = useRef(onHover);
  hoverCallback.current = onHover;
  const frames = useMemo(() => new Set(framed), [framed]);
  const marked = useMemo(() => markersByCell(map, markers), [map, markers]);

  useEffect(() => {
    const host = viewport.current!;
    const observer = new ResizeObserver(() => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      setSize((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height },
      );
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    active.current = null;
    setInspected(null);
    setDescription('');
    hoverCallback.current(null);
  }, [map]);

  useEffect(() => {
    const element = canvas.current!;
    const host = viewport.current!;
    const ctx = element.getContext('2d');
    if (!ctx) return;
    let frame = 0;
    const draw = () => {
      frame = 0;
      const width = host.clientWidth;
      const height = host.clientHeight;
      const ratio = window.devicePixelRatio || 1;
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
      element.style.width = `${width}px`;
      element.style.height = `${height}px`;
      element.style.transform = `translate(${host.scrollLeft}px, ${host.scrollTop}px)`;
      ctx.scale(ratio, ratio);
      ctx.translate(-host.scrollLeft, -host.scrollTop);
      const tokens = getComputedStyle(host);
      const color = (name: string) => tokens.getPropertyValue(name).trim();
      const ramp = heatTokens.map(color);
      const layoutWidth = Math.max(width, geometry.width);
      ctx.font = `11px ${color('--font-body')}`;
      ctx.textBaseline = 'middle';
      for (const layer of geometry.layers) {
        const bottom = layer.top + layer.ys.length * cellPitch;
        if (bottom + 66 < host.scrollTop || layer.top - 30 > host.scrollTop + height) continue;
        const origin = cellRect(layer, 0, layoutWidth);
        if (map.zKey) {
          ctx.textAlign = 'left';
          ctx.fillStyle = color('--secondary');
          ctx.fillText(
            t('optimize.map.layer', { title: map.zKey, value: text(valueLabel(layer.z, zRow)) }),
            16,
            layer.top - 14,
          );
        }
        for (const [index, cell] of layer.cells) {
          const rect = cellRect(layer, index, layoutWidth);
          if (rect.y + 16 < host.scrollTop || rect.y > host.scrollTop + height) continue;
          const step = colorStep(cell);
          ctx.fillStyle = step === null ? color('--hover') : ramp[step];
          ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
          if (step !== null && cell.count > 0 && cell.excludedCount === cell.count) {
            ctx.fillStyle = color('--panel');
            ctx.fillRect(rect.x + 10, rect.y + 1, 5, 5);
            ctx.fillStyle = color('--caption');
            ctx.fillRect(rect.x + 11, rect.y + 2, 3, 3);
          }
          if (showValues && step !== null) {
            ctx.fillStyle = color(step >= 7 ? '--canvas' : '--text');
            ctx.textAlign = 'center';
            ctx.font = `9px ${color('--font-body')}`;
            ctx.fillText(
              formatNumber(cell.value!, { notation: 'compact', maximumFractionDigits: 0 }),
              rect.x + 8,
              rect.y + 8,
              14,
            );
            ctx.font = `11px ${color('--font-body')}`;
          }
          if (step === null) {
            ctx.strokeStyle = color('--control-border');
            ctx.lineWidth = 1;
            ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, 15, 15);
            ctx.beginPath();
            ctx.moveTo(rect.x + 3, rect.y + 13);
            ctx.lineTo(rect.x + 13, rect.y + 3);
            ctx.stroke();
          }
          if (
            frames.has(cell) ||
            cell === active.current ||
            containsSelection(map, cell, selection)
          ) {
            ctx.strokeStyle =
              frames.has(cell) || cell === active.current ? color('--text') : color('--primary');
            ctx.lineWidth = 2;
            ctx.strokeRect(rect.x - 0.5, rect.y - 0.5, 17, 17);
          }
        }
        // Draw annotations after the cells so a later cell cannot paint over a label.
        const labels: { x: number; y: number; width: number }[] = [];
        for (const [index, cell] of layer.cells) {
          const picks = marked.get(cell);
          if (!picks?.length) continue;
          const rect = cellRect(layer, index, layoutWidth);
          const cx = rect.x + 8;
          const cy = rect.y + 8;
          const label = picks.map((pick) => pick.label).join(', ');
          const labelWidth = ctx.measureText(label).width + 6;
          const x = Math.max(2, Math.min(cx + 12, layoutWidth - labelWidth - 2));
          let y = Math.max(layer.top + 7, cy - 11);
          while (
            labels.some(
              (other) =>
                Math.abs(other.y - y) < 15 && x < other.x + other.width && x + labelWidth > other.x,
            )
          )
            y += 15;
          labels.push({ x, y, width: labelWidth });
          const ink = color(picks.some((pick) => pick.selected) ? '--primary' : '--text');
          ctx.strokeStyle = ink;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(cx, cy, 7.5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.lineWidth = 0.75;
          ctx.beginPath();
          ctx.moveTo(cx + 7, cy);
          ctx.lineTo(x, y);
          ctx.stroke();
          ctx.fillStyle = color('--panel');
          ctx.fillRect(x, y - 7, labelWidth, 14);
          ctx.fillStyle = ink;
          ctx.textAlign = 'left';
          ctx.fillText(label, x + 3, y);
        }
        ctx.fillStyle = color('--caption');
        ctx.textAlign = 'center';
        const xStride = Math.max(
          1,
          Math.ceil(
            Math.max(
              ...layer.columns.map(
                (values) => ctx.measureText(text(rangeLabel(values, xRow))).width,
              ),
              30,
            ) / cellPitch,
          ) + 1,
        );
        for (let index = 0; index < layer.columns.length; index += xStride) {
          ctx.fillText(
            text(rangeLabel(layer.columns[index], xRow)),
            origin.x + index * cellPitch + 8,
            bottom + 12,
          );
        }
        ctx.textAlign = 'right';
        const yStride = layer.rows.some((values) => values.length > 1) ? 2 : 1;
        for (let index = 0; index < layer.rows.length; index += yStride) {
          ctx.fillText(
            text(rangeLabel(layer.rows[index], yRow)),
            origin.x - 8,
            layer.top + index * cellPitch + 8,
            44,
          );
        }
        ctx.textAlign = 'center';
        ctx.fillStyle = color('--secondary');
        if (map.yKey) {
          const title = text(axisLabel(map.yKey, map.display?.yBinSize ?? 1));
          // A layered map's band starts at its rows, below the layer's caption.
          const { centre, span } = verticalTitle(
            ctx.measureText(title).width,
            { top: layer.top, height: layer.ys.length * cellPitch },
            { top: map.zKey ? layer.top : 2, bottom: bottom + 62 },
          );
          ctx.save();
          ctx.translate(14, centre);
          ctx.rotate(-Math.PI / 2);
          ctx.fillText(title, 0, 0, span);
          ctx.restore();
        }
        ctx.fillText(
          text(axisLabel(map.xKey, map.display?.xBinSize ?? 1)),
          layoutWidth / 2,
          bottom + 34,
          layoutWidth - 20,
        );
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    redraw.current = schedule;
    const observer = new ResizeObserver(schedule);
    observer.observe(host);
    schedule();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      redraw.current = () => {};
    };
  }, [geometry, map, selection, frames, marked, showValues, t, text, xRow, yRow, zRow]);

  const hover = (cell: HeatmapCell | null, left = 0, top = 0) => {
    if (active.current === cell) return;
    active.current = cell;
    setInspected(cell);
    setDescription(
      cell
        ? t('optimize.map.cell', {
            x: text(rangeLabel(cell.xValues ?? [cell.x], xRow)),
            y: text(rangeLabel(cell.yValues?.length ? cell.yValues : [cell.y], yRow)),
            value: text(valueLabel(cell.value)),
          })
        : '',
    );
    onHover(cell ? { cell, left, top, map } : null);
    redraw.current();
  };

  return (
    <div className={styles.heatmap} data-detail={showValues || undefined}>
      <div
        ref={viewport}
        className={styles.viewport}
        style={showValues ? { height: Math.min(geometry.height, 320), flex: 'none' } : undefined}
        onScroll={() => {
          hover(null);
          redraw.current();
        }}
      >
        <div
          className={styles.spacer}
          style={{ width: geometry.width, height: geometry.height, minWidth: '100%' }}
        >
          <canvas
            ref={canvas}
            className={styles.canvas}
            tabIndex={0}
            role="img"
            aria-label={label}
            aria-description={keyboardDescription ?? t('optimize.map.keyboard')}
            data-testid="parameter-map"
            data-columns={geometry.layers[0]?.xs.length}
            data-rows={geometry.layers[0]?.ys.length}
            data-map-height={geometry.height}
            onPointerMove={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const host = viewport.current!;
              hover(
                cellAt(
                  geometry,
                  event.clientX - rect.left + host.scrollLeft,
                  event.clientY - rect.top + host.scrollTop,
                  Math.max(host.clientWidth, geometry.width),
                ),
                event.clientX,
                event.clientY,
              );
            }}
            onPointerLeave={() => hover(null)}
            onBlur={() => hover(null)}
            onClick={() => {
              if (active.current) onActivate(active.current, map);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                hover(null);
                return;
              }
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                if (active.current) onActivate(active.current, map);
                return;
              }
              if (
                !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(
                  event.key,
                )
              )
                return;
              event.preventDefault();
              const layer =
                geometry.layers.find((item) =>
                  [...item.cells.values()].includes(active.current!),
                ) ?? geometry.layers[0];
              if (!layer) return;
              const index = [...layer.cells].find(([, cell]) => cell === active.current)?.[0] ?? 0;
              const delta =
                {
                  ArrowLeft: -1,
                  ArrowRight: 1,
                  ArrowUp: -layer.xs.length,
                  ArrowDown: layer.xs.length,
                }[event.key] ?? 0;
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? layer.cells.size - 1
                    : active.current
                      ? Math.max(0, Math.min(layer.cells.size - 1, index + delta))
                      : 0;
              const cell = layer.cells.get(next);
              if (!cell) return;
              const host = viewport.current!;
              const rect = cellRect(layer, next, Math.max(host.clientWidth, geometry.width));
              host.scrollTop = Math.max(0, rect.y - host.clientHeight / 2);
              host.scrollLeft = Math.max(0, rect.x - host.clientWidth / 2);
              const bounds = host.getBoundingClientRect();
              hover(
                cell,
                bounds.left + rect.x - host.scrollLeft,
                bounds.top + rect.y - host.scrollTop,
              );
            }}
          />
        </div>
        <span className={styles.srOnly} role="status">
          {description}
        </span>
      </div>
      {map.cells.some((cell) => cell.count > 0 && cell.excludedCount === cell.count) && (
        <div className={styles.filteredLegend}>
          <i aria-hidden="true" />
          <span>{t('optimize.summary.filtered')}</span>
        </div>
      )}
      {!!inspected?.excludedCount && (
        <div className={styles.filterStatus} role="status">
          <span>{t('optimize.summary.filtered')}</span>
          {(inspected.failedConstraints ?? []).map((constraint, index) => (
            <span key={index}>{text(failedConstraintLabel(constraint))}</span>
          ))}
        </div>
      )}
    </div>
  );
}
