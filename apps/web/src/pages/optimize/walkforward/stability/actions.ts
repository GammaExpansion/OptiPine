import type { WindowMapSurface } from '../../../../workflows/walk-forward.ts';

/** Additive session contract while the walk-forward workflow is being merged independently. */
export interface StabilityActions {
  setStabilityTolerance(tolerance: number): void;
  setWindowMapSurface(surface: WindowMapSurface): void;
  selectWindow(index: number): void;
}

/** Missing actions disable their controls until the store exposes the session methods. */
export function stabilityActions(actions: object): Partial<StabilityActions> {
  return actions;
}
