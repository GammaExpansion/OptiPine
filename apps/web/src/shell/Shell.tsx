import { useEffect } from 'react';
import { LazyPropertiesDialog } from '../dialogs/properties/LazyPropertiesDialog.tsx';
import { BacktestPage } from '../pages/backtest/BacktestPage.tsx';
import { OptimizePage } from '../pages/optimize/OptimizePage.tsx';
import { useBacktestStore } from '../state/backtest.ts';
import { useUiStore } from '../state/ui.ts';
import { DialogsRoot } from './DialogsRoot.tsx';
import { Header } from './Header.tsx';
import { installShortcuts } from './shortcuts.ts';
import styles from './Shell.module.css';

export function Shell({ canOptimize }: { canOptimize?: boolean }) {
  const page = useUiStore((state) => state.page);
  const hasWorkspace = useBacktestStore(
    (state) => state.compile.status === 'compiled' && state.dataset !== null,
  );
  useEffect(() => installShortcuts(), []);
  return (
    <div className={styles.shell}>
      <Header canOptimize={canOptimize ?? hasWorkspace} />
      {page === 'backtest' ? <BacktestPage /> : <OptimizePage />}
      <DialogsRoot slots={{ properties: LazyPropertiesDialog }} />
    </div>
  );
}
