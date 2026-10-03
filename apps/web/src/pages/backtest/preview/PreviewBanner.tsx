import { lazy, Suspense } from 'react';
import { useBacktestStore } from '../../../state/backtest.ts';

const PreviewContent = lazy(() =>
  import('./PreviewContent.tsx').then((module) => ({ default: module.PreviewContent })),
);

/** Preview and apply controls load only after a set is opened from Optimize. */
export function PreviewBanner() {
  const active = useBacktestStore((state) => !!(state.preview || state.applied));
  return active ? (
    <Suspense fallback={null}>
      <PreviewContent />
    </Suspense>
  ) : null;
}
