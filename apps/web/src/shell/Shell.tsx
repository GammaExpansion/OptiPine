import { Suspense, useEffect } from 'react';
import { lazyWithCatalog } from '../i18n/lazyWithCatalog.tsx';
import { LazyPropertiesDialog } from '../dialogs/properties/LazyPropertiesDialog.tsx';
import { BacktestPage } from '../pages/backtest/BacktestPage.tsx';
import { useBacktestStore } from '../state/backtest.ts';
import { getServices } from '../state/services.ts';
import { useUiStore } from '../state/ui.ts';
import { DialogsRoot } from './DialogsRoot.tsx';
import { installFileDrop } from './file-drop.ts';
import { Header } from './Header.tsx';
import { installLeaveGuard } from './leave-guard.ts';
import { installShortcuts } from './shortcuts.ts';
import styles from './Shell.module.css';

// Every session starts on Backtest, so the Optimize page loads when it is first opened, with the
// optimization side's session and Workers alongside it rather than after it mounts.
const OptimizePage = lazyWithCatalog('optimize', () => {
  void getServices().loadOptimization();
  return import('../pages/optimize/OptimizePage.tsx').then((module) => ({
    default: module.OptimizePage,
  }));
});
// It opens from optimization results only, so the optimization side has loaded by then.
const FailedCombinationsDialog = lazyWithCatalog('optimize', () =>
  import('../pages/optimize/leaderboard/FailedCombinationsDialog.tsx').then((module) => ({
    default: module.FailedCombinationsDialog,
  })),
);

export function Shell({ canOptimize }: { canOptimize?: boolean }) {
  const page = useUiStore((state) => state.page);
  // Optimize opens once there are a script and data; its run block says what else is missing.
  const hasWorkspace = useBacktestStore(
    (state) => state.source.trim() !== '' && state.dataset !== null,
  );
  useEffect(() => installShortcuts(), []);
  useEffect(() => installFileDrop(), []);
  useEffect(() => installLeaveGuard(), []);
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
      <DialogsRoot
        slots={{ properties: LazyPropertiesDialog, failedCombinations: FailedCombinationsDialog }}
      />
    </div>
  );
}
