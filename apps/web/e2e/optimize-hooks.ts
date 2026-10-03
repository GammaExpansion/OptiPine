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
  /** Search `title` from `from` to `to` with every other input fixed, and run it to its end. */
  async runOne(title: string, from: number, to: number) {
    const { search, actions } = getOptimizationStore().getState();
    for (const row of search.rows)
      if (row.draft && row.descriptor.title !== title)
        actions.setSearched(row.descriptor.title, false);
    actions.setRange(title, { from, to, step: 1 });
    await actions.start();
  },
};

export type OptimizeHooks = typeof optimizeHooks;
