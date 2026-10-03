import { getOptimizationStore } from '../src/state/optimization.ts';

/** Search `title` from `from` to `to` with every other input fixed. */
function searchOne(title: string, from: number, to: number) {
  const { search, actions } = getOptimizationStore().getState();
  for (const row of search.rows)
    if (row.draft && row.descriptor.title !== title)
      actions.setSearched(row.descriptor.title, false);
  actions.setRange(title, { from, to, step: 1 });
}

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
      windows: state.walkForward?.windows.map((window) => window.status) ?? null,
      /** Walk-forward results with their selection, stability and window map all computed. */
      walkForwardSettled: (() => {
        const view = state.walkForward;
        return !!view?.stability && !view.pending && !view.mapPending && !view.stability.pending;
      })(),
    };
  },
  /** Search `title` from `from` to `to` with every other input fixed, and run it to its end. */
  async runOne(title: string, from: number, to: number) {
    searchOne(title, from, to);
    await getOptimizationStore().getState().actions.start();
  },
  /**
   * `runOne` walking forward by month, two IS months and one OOS month a step, with no filters, so
   * every window chooses a set.
   */
  async runWalkForward(title: string, from: number, to: number) {
    const store = getOptimizationStore();
    const { actions, viewSettings } = store.getState();
    searchOne(title, from, to);
    for (let index = viewSettings.filters.length - 1; index >= 0; index--)
      actions.removeFilter(index);
    actions.setValidation({
      mode: 'walk-forward',
      walkForward: { inSampleMonths: 2, outOfSampleMonths: 1, stepMonths: 1 },
    });
    // The window plan follows the validation; a start before it is ready does nothing.
    await new Promise<void>((resolve) => {
      const check = () => {
        if (!store.getState().readiness.ok) return;
        unsubscribe();
        resolve();
      };
      const unsubscribe = store.subscribe(check);
      check();
    });
    await store.getState().actions.start();
  },
};

export type OptimizeHooks = typeof optimizeHooks;
