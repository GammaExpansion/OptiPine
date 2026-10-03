import type { StabilityActions } from '../stability/actions.ts';

/** The session owns provenance, applying inputs and opening Backtest's preview. */
export interface ResultsActions extends Pick<StabilityActions, 'selectWindow'> {
  applyFixedParameters(): void;
  previewWindow(index: number): Promise<void>;
}

/** Until the workflow exposes these methods, their controls remain disabled. */
export function resultsActions(actions: object): Partial<ResultsActions> {
  return actions;
}
