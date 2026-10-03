import { useMemo } from 'react';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { formatDate } from '../../../i18n/translate.ts';
import { useOptimizationStore } from '../../../state/optimization.ts';
import { planGeometry } from './range-display.ts';
import styles from './WindowPlan.module.css';

/** Lanes are drawn in this band of the chart; the ticks sit below it. */
const lanesTop = 26;
const lanesHeight = 138;
const chartHeight = 196;

/** The month a half-open window boundary ends in: the day before it. */
const lastDay = (time: number) => formatDate((time - 86_400) * 1000);

/**
 * The planned walk-forward windows before a run (O3): one lane per window with its IS range and
 * the OOS range that follows, over the months they cover. Runs come with phase 4.
 */
export function WindowPlan() {
  const { t } = useI18n();
  const plan = useOptimizationStore((state) => state.plan);
  const windows = plan.status === 'planned' ? plan.windows : null;
  const geometry = useMemo(() => planGeometry(windows ?? []), [windows]);
  if (!geometry.lanes.length) return null;
  const pitch = Math.min(23, Math.max(6, Math.floor(lanesHeight / geometry.lanes.length)));
  const laneHeight = Math.max(3, Math.round((pitch * 14) / 23));
  // Label every window while the lanes leave room for the text, otherwise every few.
  const every = Math.ceil(12 / pitch);
  return (
    <section className={styles.plan}>
      <div className={styles.heading}>
        <h2>{t('optimize.setup.windowPlan')}</h2>
        <span>{t('optimize.setup.windowPlanHint')}</span>
      </div>
      <div className={styles.chart} style={{ height: chartHeight }}>
        <ol className={styles.ids}>
          {geometry.lanes.map(({ window }, index) => (
            <li
              key={window.index}
              style={{ top: lanesTop + index * pitch, height: laneHeight }}
              aria-label={t('optimize.setup.windowRanges', {
                index: window.index + 1,
                inSample: t('optimize.setup.dates', {
                  start: formatDate(window.inSampleStart * 1000),
                  end: lastDay(window.inSampleEnd),
                }),
                outOfSample: t('optimize.setup.dates', {
                  start: formatDate(window.outOfSampleStart * 1000),
                  end: lastDay(window.outOfSampleEnd),
                }),
              })}
            >
              {index % every === 0 && t('optimize.setup.windowId', { index: window.index + 1 })}
            </li>
          ))}
        </ol>
        <svg
          className={styles.lanes}
          height={chartHeight}
          role="img"
          aria-label={t('optimize.setup.windowPlanLabel')}
        >
          {geometry.lanes.map(({ window, inSample, outOfSample }, index) => {
            const y = lanesTop + index * pitch + 0.5;
            return (
              <g key={window.index}>
                <rect
                  className={styles.inSample}
                  x={`${inSample.left}%`}
                  width={`${inSample.width}%`}
                  y={y}
                  height={laneHeight - 1}
                  rx={1}
                />
                <rect
                  className={styles.outOfSample}
                  x={`${outOfSample.left}%`}
                  width={`${outOfSample.width}%`}
                  y={y}
                  height={laneHeight - 1}
                  rx={1}
                />
              </g>
            );
          })}
          {geometry.ticks.map((tick) => (
            <text key={tick.label} x={`${tick.at}%`} y={chartHeight - 8} textAnchor="middle">
              {tick.label}
            </text>
          ))}
        </svg>
      </div>
    </section>
  );
}
