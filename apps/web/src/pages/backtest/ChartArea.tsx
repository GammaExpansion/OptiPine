import { lazy, Suspense, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useBacktestStore } from '../../state/backtest.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { FirstLaunch } from './FirstLaunch.tsx';
import { PreviewBanner } from './preview/PreviewBanner.tsx';
import { chartView } from './states/chart-view.ts';
import styles from './ChartArea.module.css';

const ResultChart = lazy(() =>
  import('./ResultChart.tsx').then((module) => ({ default: module.ResultChart })),
);

/**
 * The chart area (B1, B6–B12): the first-launch steps until there are a script and data, then the
 * result chart, which loads on first use. The banner of a previewed set (B16) sits above either.
 */
export function ChartArea() {
  const { t } = useI18n();
  const parts = useBacktestStore(
    useShallow((state) => ({
      source: state.source,
      dataset: state.dataset,
      compile: state.compile,
      run: state.run,
      result: state.result,
      preview: state.preview,
    })),
  );
  const view = useMemo(() => chartView(parts), [parts]);
  return (
    <div className={styles.stack}>
      {view.kind !== 'firstLaunch' && <h1 className={styles.pageTitle}>{t('shell.backtest')}</h1>}
      <PreviewBanner />
      <div className={styles.body}>
        {view.kind === 'firstLaunch' ? (
          <FirstLaunch />
        ) : (
          <Suspense fallback={<div className={styles.area} />}>
            <ResultChart view={view} />
          </Suspense>
        )}
      </div>
    </div>
  );
}
