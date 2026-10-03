import type { LiteralValue } from '@pine/engine';
import type { Text } from '@pine/messages';
import type { AnalysisValue, WalkForwardBounds } from '@pine/optimizer';
import type { ParameterOrigin } from './inputs.ts';
import type { MapView } from './optimize-views.ts';

/** One planned walk-forward window (O3), from the analysis job `plan`. */
export interface WindowPlan {
  readonly index: number;
  /** Half-open month boundaries in Unix seconds, as @pine/optimizer plans them. */
  readonly inSampleStart: number;
  readonly inSampleEnd: number;
  readonly outOfSampleStart: number;
  readonly outOfSampleEnd: number;
  /** Where the window's IS and OOS bars start in the data. */
  readonly inSampleStartIndex: number;
  readonly outOfSampleStartIndex: number;
  readonly inSampleBars: number;
  readonly outOfSampleBars: number;
  /** The final window's OOS range ends early with the data. */
  readonly partial: boolean;
  readonly gapBefore: boolean;
}

export function windowPlan(plan: WalkForwardBounds): WindowPlan {
  return {
    index: plan.index,
    inSampleStart: plan.inSampleStart,
    inSampleEnd: plan.inSampleEnd,
    outOfSampleStart: plan.outOfSampleStart,
    outOfSampleEnd: plan.outOfSampleEnd,
    inSampleStartIndex: plan.inSampleStartIndex,
    outOfSampleStartIndex: plan.outOfSampleStartIndex,
    inSampleBars: plan.inSampleEndIndex - plan.inSampleStartIndex,
    outOfSampleBars: plan.outOfSampleEndIndex - plan.outOfSampleStartIndex,
    partial: !!plan.partial,
    gapBefore: plan.gapBefore,
  };
}

/** A window's chosen set on one of its ranges (W1). */
export interface WindowFigures {
  readonly netProfit: number | null;
  /** Annualized return (CAGR) in percent; WFE is the OOS one over the IS one. */
  readonly annualizedReturn: number | null;
  readonly trades: number | null;
}

export type WindowStatus =
  /** Not reached yet (W4). */
  | 'waiting'
  /** Its IS range is being optimized, or its chosen set run (W4). */
  | 'running'
  | 'done'
  /** No set passes the filters, so the window stays flat for its OOS range (W5). */
  | 'flat'
  /** The chosen set failed on the OOS range; the stitched equity breaks there. */
  | 'failed';

/** One row of the per-window table (W1, W4, W5) with what the charts draw for it. */
export interface WindowResult {
  readonly plan: WindowPlan;
  readonly status: WindowStatus;
  /** Sets finished on the window's IS range, of the run's combinations. */
  readonly completed: number;
  /** The chosen set; null while waiting or running, and for a flat window. */
  readonly trialId: string | null;
  /** Every input the run set, keyed by title. */
  readonly parameters: Readonly<Record<string, LiteralValue>> | null;
  readonly inSample: WindowFigures | null;
  readonly outOfSample: WindowFigures | null;
  /** OOS annualized return over IS annualized return. */
  readonly wfe: number | null;
  /** Why the window is flat or failed. */
  readonly error: Text | null;
  /** Account equity per IS bar, shifted to end where the OOS range opens (W2's dashed line). */
  readonly inSampleEquity: readonly number[];
  /** Account equity per OOS bar on the stitched scale; level for a flat window. */
  readonly outOfSampleEquity: readonly number[];
}

/** The total row and the summary's figures, over the windows finished so far (W1, W4, W5). */
export interface WalkForwardTotals {
  readonly windows: number;
  /** Windows finished: done, flat or failed. The totals are final when it equals `windows`. */
  readonly completed: number;
  /** Windows that ran a set on their OOS range. */
  readonly traded: number;
  /** Traded windows with a positive OOS net profit. */
  readonly profitable: number;
  readonly flat: number;
  readonly failed: number;
  readonly inSampleNet: number | null;
  readonly outOfSampleNet: number | null;
  readonly outOfSampleTrades: number | null;
  /** Summed OOS annualized return over summed IS annualized return; null until every window is done. */
  readonly wfe: number | null;
}

/** The stitched OOS equity: each window's OOS bars in turn, on one account (W1). */
export interface StitchedEquity {
  /** Bar open times. */
  readonly times: readonly number[];
  /** Account equity at each time; null over a failed window, which breaks the line. */
  readonly values: readonly (number | null)[];
}

/** One set for every window (W1): each input at the value that holds up best across them. */
export interface FixedParameters {
  /** Every input the run set, keyed by title. */
  readonly parameters: Readonly<Record<string, LiteralValue>>;
  /**
   * The set's mean shortfall from each window's best, as a fraction; null when a window did not
   * rank it, because it was not sampled there or failed the filters.
   */
  readonly meanLoss: number | null;
  readonly origin: ParameterOrigin;
}

/** One window's band on a stability row (W1). */
export interface StabilityBand {
  /** The values within the tolerance of the window's best when the other inputs are re-tuned. */
  readonly near: readonly AnalysisValue[];
  /** The value the window chose. */
  readonly chosen: AnalysisValue | null;
}

/** One searched input across the windows: "Common 26–28 · Fixed at 27, mean loss 1.6%" (W1). */
export interface StabilityRow {
  readonly title: string;
  /** The input's searched values in order: the row's scale. */
  readonly values: readonly AnalysisValue[];
  /** One band per window, in window order. */
  readonly bands: readonly StabilityBand[];
  /** Runs of adjacent values near-optimal in every window. */
  readonly common: readonly { readonly from: AnalysisValue; readonly to: AnalysisValue }[];
  /** The value with the least mean loss across windows, and that loss as a fraction. */
  readonly fixed: AnalysisValue | null;
  readonly meanLoss: number | null;
  /** Every value is near-optimal in every window. */
  readonly allNearOptimal: boolean;
}

export interface StabilityView {
  /** As a fraction: 0.1 is 10%. */
  readonly tolerance: number;
  /** Rows for another tolerance are being computed; `rows` are still the previous ones. */
  readonly pending: boolean;
  readonly rows: readonly StabilityRow[];
}

/** The window map shows one window's IS surface, or the mean over every window (W3). */
export type WindowMapSurface = 'window' | 'mean';

export interface WindowMapView extends Omit<MapView, 'surface'> {
  readonly surface: WindowMapSurface;
  /** The window whose surface `window` shows. */
  readonly window: number;
  /** Each window's chosen set, circled on the map. */
  readonly chosen: readonly {
    readonly window: number;
    readonly parameters: Readonly<Record<string, LiteralValue>>;
  }[];
}

/** The selection bar for a window (W1, WEB.md 3.3): its ranges, set and results. */
export interface WindowSelection {
  readonly window: WindowResult;
  /** The user picked it; otherwise it is the last window that ran a set. */
  readonly explicit: boolean;
  /** For View backtest; null for a flat or failed window, which has no set to run. */
  readonly origin: ParameterOrigin | null;
}

/** Everything the walk-forward results area shows, for the live run or the latest results. */
export interface WalkForwardView {
  /** A run is still filling the windows in (W4). */
  readonly inProgress: boolean;
  /** Windows are being chosen again after the ranking, filters or smoothing changed. */
  readonly pending: boolean;
  readonly windows: readonly WindowResult[];
  readonly totals: WalkForwardTotals;
  readonly equity: StitchedEquity;
  /** Bar open times of the results' data, which the window plans index. */
  readonly times: readonly number[];
  /** Null until every window is done. */
  readonly fixed: FixedParameters | null;
  /** Null until every window is done. */
  readonly stability: StabilityView | null;
  /** Null until every window is done and the analysis has drawn it. */
  readonly map: WindowMapView | null;
  readonly mapError: Text | null;
  readonly selection: WindowSelection | null;
}
