import { lazy, Suspense, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useBacktestStore } from '../../state/backtest.ts';
import { FirstLaunch } from './FirstLaunch.tsx';
import { chartView } from './states/chart-view.ts';
import styles from './ChartArea.module.css';

const ResultChart = lazy(() =>
  import('./ResultChart.tsx').then((module) => ({ default: module.ResultChart })),
);

/**
 * The chart area (B1, B6–B12): the first-launch steps until there are a script and data, then the
 * result chart, which loads on first use.
 */
export function ChartArea() {
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
  return view.kind === 'firstLaunch' ? (
    <FirstLaunch />
  ) : (
    <Suspense fallback={<div className={styles.area} />}>
      <ResultChart view={view} />
    </Suspense>
  );
}
