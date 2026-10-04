import { getBacktestStore } from '../state/backtest.ts';
import { getServices } from '../state/services.ts';

/**
 * Whether leaving would lose work, since nothing is saved (WEB.md 4.8): a run in progress (a
 * backtest, a preview's run or an optimization, which can be many minutes), a script with edits
 * since it was opened, or typed into the empty editor, or an optimization's results.
 */
export function unsavedWork(): boolean {
  const backtest = getBacktestStore().getState();
  const optimization = getServices().optimization?.session.getState();
  return (
    backtest.run.status === 'running' ||
    backtest.preview?.run.status === 'running' ||
    optimization?.run.status === 'running' ||
    (backtest.source.trim() !== '' && (backtest.origin === null || backtest.origin.edited)) ||
    !!optimization?.results
  );
}

/**
 * Reload, Back, closing the tab or any other navigation, by mouse or keyboard, asks first while
 * there is unsaved work.
 */
export function installLeaveGuard(target: Window = window): () => void {
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (unsavedWork()) event.preventDefault();
  };
  target.addEventListener('beforeunload', onBeforeUnload);
  return () => target.removeEventListener('beforeunload', onBeforeUnload);
}
