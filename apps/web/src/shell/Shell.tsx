import { lazy, Suspense, useEffect } from 'react';
import { LazyPropertiesDialog } from '../dialogs/properties/LazyPropertiesDialog.tsx';
import { BacktestPage } from '../pages/backtest/BacktestPage.tsx';
import { useBacktestStore } from '../state/backtest.ts';
import { getServices } from '../state/services.ts';
import { useUiStore } from '../state/ui.ts';
import { DialogsRoot } from './DialogsRoot.tsx';
import { Header } from './Header.tsx';
import { installShortcuts } from './shortcuts.ts';
import styles from './Shell.module.css';

// Every session starts on Backtest, so the Optimize page loads when it is first opened, with the
// optimization side's session and Workers alongside it rather than after it mounts.
const OptimizePage = lazy(() => {
  void getServices().loadOptimization();
  return import('../pages/optimize/OptimizePage.tsx').then((module) => ({
    default: module.OptimizePage,
  }));
});

export function Shell({ canOptimize }: { canOptimize?: boolean }) {
  const page = useUiStore((state) => state.page);
  // Optimize opens once there are a script and data; its run block says what else is missing.
  const hasWorkspace = useBacktestStore(
    (state) => state.source.trim() !== '' && state.dataset !== null,
  );
  useEffect(() => installShortcuts(), []);
  return (
    <div className={styles.shell}>
      <Header canOptimize={canOptimize ?? hasWorkspace} />
      {page === 'backtest' ? (
        <BacktestPage />
      ) : (
        <Suspense fallback={null}>
          <OptimizePage />
        </Suspense>
      )}
      <DialogsRoot slots={{ properties: LazyPropertiesDialog }} />
    </div>
  );
}
