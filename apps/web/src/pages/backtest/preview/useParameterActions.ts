import type { LiteralValue } from '@pine/engine';
import { useBacktestStore } from '../../../state/backtest.ts';
import { useUiStore } from '../../../state/ui.ts';
import type { ParameterOrigin } from '../../../workflows/inputs.ts';

/** Navigation accompanies the session action; input and result ownership stays in Backtest. */
export function useParameterActions() {
  const actions = useBacktestStore((state) => state.actions);
  const setPage = useUiStore((state) => state.setPage);
  const setDockTab = useUiStore((state) => state.setDockTab);
  return {
    preview(parameters: Readonly<Record<string, LiteralValue>>, origin: ParameterOrigin) {
      void actions.preview(parameters, origin);
      setDockTab(origin.kind === 'failed' ? 'issues' : 'report');
      setPage('backtest');
    },
    apply(parameters: Readonly<Record<string, LiteralValue>>, origin: ParameterOrigin) {
      void actions.applyParameters(parameters, origin);
      setPage('backtest');
    },
    back() {
      actions.backToOptimization();
      setPage('optimize');
    },
  };
}
