import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../../../i18n/I18nProvider.tsx';
import { formatDate } from '../../../../i18n/translate.ts';
import type { WalkForwardView } from '../../../../workflows/walk-forward.ts';
import { compactNet, dateRange, figure, windowLabel } from './copy.ts';
import { drawSummary } from './draw.ts';
import { summaryGeometry, type SummaryMode } from './geometry.ts';
import styles from './Results.module.css';

export function SummaryChart({
  view,
  mode,
  selectWindow,
}: {
  view: WalkForwardView;
  mode: SummaryMode;
  selectWindow: (index: number) => void;
}) {
  const { t, text } = useI18n();
  const canvas = useRef<HTMLCanvasElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = host.current!;
    const resize = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!size.width || !size.height || !view.windows.length) return;
    const element = canvas.current!;
    const context = element.getContext('2d');
    if (!context) return;
    const ratio = window.devicePixelRatio || 1;
    element.width = Math.round(size.width * ratio);
    element.height = Math.round(size.height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const { from, to } = summaryGeometry(view.windows, size.width, size.height, mode);
    const ticks: { time: number; label: string }[] = [];
    const tick = new Date(from * 1000);
    tick.setUTCMonth(Math.floor(tick.getUTCMonth() / 6) * 6 + 6, 1);
    while (tick.getTime() / 1000 < to) {
      ticks.push({ time: tick.getTime() / 1000, label: formatDate(tick).slice(0, 7) });
      tick.setUTCMonth(tick.getUTCMonth() + 6);
    }
    const draw = () =>
      drawSummary(context, view, mode, size.width, size.height, {
        windows: view.windows.map((window) => ({
          label: text(windowLabel(window.plan.index)),
          net: text(figure(window.outOfSample?.netProfit, 0, true)),
          compact: text(compactNet(window.outOfSample?.netProfit)),
          is: text(figure(window.inSample?.netProfit, 0, true)),
          equity: text(figure(window.outOfSampleEquity.at(-1))),
          status: t(`optimize.wfResults.status.${window.status}`),
        })),
        ticks,
        value: (value) => text(figure(value)),
      });
    draw();
    let active = true;
    void document.fonts?.ready.then(() => {
      if (active) draw();
    });
    return () => {
      active = false;
    };
  }, [view, mode, size, t, text]);
  const geometry = summaryGeometry(view.windows, size.width, size.height, mode);
  return (
    <div className={styles.chartScroll}>
      <div
        ref={host}
        className={styles.chart}
        style={{
          minHeight:
            mode === 'windows'
              ? Math.max(220, view.windows.length * 44 + 40)
              : Math.max(230, view.windows.length * 20 + 140),
        }}
      >
        <canvas
          ref={canvas}
          role="img"
          data-testid="wf-equity"
          aria-label={t(
            mode === 'stitched'
              ? 'optimize.wfResults.chartStitched'
              : 'optimize.wfResults.chartWindows',
            { count: view.windows.length },
          )}
        />
        {geometry.lanes.map(({ window, top, height }) => (
          <button
            key={window.plan.index}
            type="button"
            className={styles.lane}
            style={{ top: top - 2, height: height + 4 }}
            aria-label={t('optimize.wfResults.selectWindow', {
              window: windowLabel(window.plan.index),
            })}
            aria-pressed={view.selection?.window.plan.index === window.plan.index}
            title={text(dateRange(window.plan.inSampleStart, window.plan.outOfSampleEnd))}
            onClick={() => selectWindow(window.plan.index)}
          />
        ))}
      </div>
    </div>
  );
}
