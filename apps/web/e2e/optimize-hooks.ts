import { getOptimizationStore } from '../src/state/optimization.ts';

/**
 * Test-only reads of the Optimize page's run: what a check needs beyond the screen, such as which
 * results are kept after a cancelled run.
 */
export const optimizeHooks = {
  state() {
    const state = getOptimizationStore().getState();
    return {
      run: state.run.status,
      resultsId: state.results?.id ?? null,
      combinations: state.results?.combinations ?? null,
      outdated: state.outdated?.reasons ?? null,
    };
  },
};

export type OptimizeHooks = typeof optimizeHooks;
