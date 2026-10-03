import { useEffect, useRef } from 'react';
import type { SearchRow } from '../../workflows/optimize-setup.ts';
import type { CurveView } from '../../workflows/optimize-views.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { formatNumber } from '../../i18n/translate.ts';
import { valueLabel } from '../../pages/optimize/map/map-labels.ts';
import { curveGeometry } from './curve-geometry.ts';
import styles from './canvas.module.css';

/** A single-input live chart is still one canvas, even for a large random search. */
export function CurveCanvas({
  curve,
  active,
  searchRow,
  onInspect,
  onSelect,
}: {
  curve: CurveView;
  searchRow?: SearchRow;
  active: number;
  onInspect: (index: number) => void;
  onSelect: (index: number) => void;
}) {
  const { t, text } = useI18n();
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const parent = host.current!;
    const element = canvas.current!;
    const ctx = element.getContext('2d');
    if (!ctx) return;
    let frame = 0;
    const draw = () => {
      frame = 0;
      const width = parent.clientWidth;
      const height = 210;
      const ratio = window.devicePixelRatio || 1;
      element.width = width * ratio;
      element.height = height * ratio;
      element.style.width = `${width}px`;
      element.style.height = `${height}px`;
      ctx.scale(ratio, ratio);
      const tokens = getComputedStyle(parent);
      const color = (name: string) => tokens.getPropertyValue(name).trim();
      const { low, high, x, y } = curveGeometry(curve, width, height);
      ctx.font = `11px ${color('--font-body')}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let index = 0; index < 4; index++) {
        const value = low + ((high - low) * index) / 3;
        ctx.fillStyle = color('--caption');
        ctx.fillText(
          formatNumber(value, { notation: 'compact', maximumFractionDigits: 1 }),
          48,
          y(value),
        );
        ctx.strokeStyle = color('--divider');
        ctx.beginPath();
        ctx.moveTo(58, y(value));
        ctx.lineTo(width - 18, y(value));
        ctx.stroke();
      }
      if (curve.nearPeak) {
        const from = curve.points.findIndex((point) => point.x === curve.nearPeak!.from);
        const to = curve.points.findIndex((point) => point.x === curve.nearPeak!.to);
        ctx.fillStyle = color('--primary');
        ctx.globalAlpha = 0.09;
        ctx.fillRect(x(from) - 4, 14, Math.max(8, x(to) - x(from) + 8), height - 48);
        ctx.globalAlpha = 1;
      }
      for (const [key, token] of [
        ['inSample', '--is'],
        ['outOfSample', '--oos'],
        ['neighbourhoodMean', '--secondary'],
      ] as const) {
        ctx.strokeStyle = color(token);
        ctx.lineWidth = key === 'neighbourhoodMean' ? 1 : 1.5;
        ctx.setLineDash(key === 'neighbourhoodMean' ? [4, 3] : []);
        ctx.beginPath();
        let connected = false;
        curve.points.forEach((point, index) => {
          const value = point[key];
          if (value === null || !Number.isFinite(value)) {
            connected = false;
            return;
          }
          if (connected) ctx.lineTo(x(index), y(value));
          else ctx.moveTo(x(index), y(value));
          connected = true;
        });
        ctx.stroke();
        ctx.setLineDash([]);
        const point = curve.points[active];
        const value = point?.[key];
        if (value != null && Number.isFinite(value)) {
          ctx.fillStyle = color(token);
          ctx.beginPath();
          ctx.arc(x(active), y(value), 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.textAlign = 'center';
      ctx.fillStyle = color('--caption');
      const stride = Math.max(
        1,
        Math.ceil(curve.points.length / Math.max(2, Math.floor(width / 70))),
      );
      for (let index = 0; index < curve.points.length; index += stride)
        ctx.fillText(text(valueLabel(curve.points[index].x, searchRow)), x(index), height - 18);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(parent);
    schedule();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [curve, active, text, searchRow]);
  return (
    <div ref={host} className={styles.viewport} style={{ height: 210 }}>
      <canvas
        ref={canvas}
        className={styles.canvas}
        role="img"
        tabIndex={0}
        aria-label={t('optimize.map.curveCanvas', { title: curve.input })}
        aria-description={t('optimize.map.curveKeyboard')}
        data-testid="objective-curve"
        onPointerMove={(event) =>
          onInspect(
            curveGeometry(curve, host.current!.clientWidth, 210).indexAt(
              event.clientX - event.currentTarget.getBoundingClientRect().left,
            ),
          )
        }
        onClick={() => onSelect(active)}
        onKeyDown={(event) => {
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            onInspect(
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? curve.points.length - 1
                  : Math.max(
                      0,
                      Math.min(
                        curve.points.length - 1,
                        active + (event.key === 'ArrowRight' ? 1 : -1),
                      ),
                    ),
            );
          } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect(active);
          }
        }}
      />
    </div>
  );
}
