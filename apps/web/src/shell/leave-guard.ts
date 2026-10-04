import { getBacktestStore } from '../state/backtest.ts';
import { getServices } from '../state/services.ts';

/** Whether a backtest, a preview's run or an optimization is in progress. */
export function runInProgress(): boolean {
  const backtest = getBacktestStore().getState();
  return (
    backtest.run.status === 'running' ||
    backtest.preview?.run.status === 'running' ||
    getServices().optimization?.session.getState().run.status === 'running'
  );
}

/**
 * Reload, Back or closing the tab asks first while something runs. Nothing is saved (WEB.md 4.8),
 * so leaving discards the run, which for an optimization can be many minutes of work.
 */
export function installLeaveGuard(target: Window = window): () => void {
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (runInProgress()) event.preventDefault();
  };
  target.addEventListener('beforeunload', onBeforeUnload);
  return () => target.removeEventListener('beforeunload', onBeforeUnload);
}
