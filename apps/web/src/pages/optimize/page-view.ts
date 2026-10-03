import type { OptimizationState } from '../../workflows/optimize-session.ts';

type ResultsState = Pick<OptimizationState, 'results' | 'run' | 'outdated'>;

/**
 * The results area shows the panels while there are results or a run fills them (O8, R1), and
 * the O1 empty state otherwise: a cancelled or failed first run leaves nothing to show.
 */
export function showsResults(state: ResultsState): boolean {
  return state.results !== null || state.run.status === 'running';
}

/** Settings changed since the shown results were computed (R5); a live run shows its own views. */
export function resultsOutdated(state: ResultsState): boolean {
  return state.run.status !== 'running' && !!state.outdated?.reasons.length;
}
