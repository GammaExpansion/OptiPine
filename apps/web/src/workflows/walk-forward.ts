import type { LiteralValue, RunInput, RunResult } from '@pine/engine';
import type { Text } from '@pine/messages';
import {
  consecutiveLossesMetric,
  scoreMetric,
  type AnalysisAxis,
  type AnalysisValue,
  type OptimizerAnalysis,
  type Slice,
  type StabilitySummary,
  type TrialRecord,
  type TrialResult,
  type WalkForwardBounds,
  type WalkForwardConfig,
  type WalkForwardExecution,
  type WalkForwardResult,
} from '@pine/optimizer';
import type { OptimizationTrial } from '@pine/workers';
import type { ParameterOrigin, WindowRanges } from './inputs.ts';
import {
  metricConstraint,
  objectiveMetric,
  reportMetrics,
  type Direction,
  type FilterCondition,
  type ObjectiveId,
} from './optimize-ranking.ts';
import { walkForwardConfig, type SearchRow, type WalkForwardSettings } from './optimize-setup.ts';
import { sliceChips, type MapView } from './optimize-views.ts';

/** Stability starts with the values within 10% of each window's best (W1). */
export const defaultTolerance = 0.1;

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

/** A planned window's ranges, as a window's preview marks them on the chart. */
export function windowRanges(plan: WindowPlan): WindowRanges {
  return {
    inSample: { start: plan.inSampleStart, end: plan.inSampleEnd },
    outOfSample: { start: plan.outOfSampleStart, end: plan.outOfSampleEnd },
  };
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

/** The bounds `finalize` reads back from a window plan. */
function windowBounds(plan: WindowPlan): WalkForwardBounds {
  return {
    index: plan.index,
    inSampleStart: plan.inSampleStart,
    inSampleEnd: plan.inSampleEnd,
    outOfSampleStart: plan.outOfSampleStart,
    outOfSampleEnd: plan.outOfSampleEnd,
    partial: plan.partial,
    inSampleStartIndex: plan.inSampleStartIndex,
    inSampleEndIndex: plan.inSampleStartIndex + plan.inSampleBars,
    outOfSampleStartIndex: plan.outOfSampleStartIndex,
    outOfSampleEndIndex: plan.outOfSampleStartIndex + plan.outOfSampleBars,
    gapBefore: plan.gapBefore,
  };
}

// ----- choosing each window's set

/** What chooses each window's set: the current ranking, filters and smoothing (WEB.md 4.6). */
export interface SelectionSettings {
  readonly objective: ObjectiveId;
  readonly direction: Direction;
  readonly filters: readonly FilterCondition[];
  readonly smooth: boolean;
}

/** The neighbourhood mean ranks the sets when the map is smoothed or it is the objective. */
const byNeighbourhood = (settings: SelectionSettings): boolean =>
  settings.smooth || settings.objective === 'neighbourhoodMean';

/** Identifies the selection settings: windows chosen with another key are chosen again. */
export function selectionKey(settings: SelectionSettings): string {
  return JSON.stringify([
    objectiveMetric(settings.objective),
    settings.direction,
    settings.filters.map(metricConstraint),
    byNeighbourhood(settings),
  ]);
}

/** The configuration the analysis jobs `choose`, `finalize` and `stability` take. */
export function selectionConfig(
  walkForward: WalkForwardSettings,
  settings: SelectionSettings,
  axes: readonly AnalysisAxis[],
  tolerance = defaultTolerance,
): WalkForwardConfig {
  return {
    ...walkForwardConfig(walkForward),
    objective: { name: objectiveMetric(settings.objective), direction: settings.direction },
    neighborhood: byNeighbourhood(settings),
    axes: axes.map(({ title, values }) => ({ title, values })),
    tolerance,
  };
}

/** The metrics the selection reads: the objective's and every filter's. */
export function selectionMetrics(settings: SelectionSettings): string[] {
  return [
    ...new Set([
      objectiveMetric(settings.objective),
      ...settings.filters.map((filter) => reportMetrics[filter.metric]),
    ]),
  ];
}

/**
 * The value of `metric` for each trial, as the analysis reads it, computed once per window and
 * metric: `scoreMetric` looks a report name up among every metric of the run.
 */
export function metricColumn(
  trials: readonly OptimizationTrial[],
  metric: string,
  cache: Map<string, readonly (number | null)[]>,
): readonly (number | null)[] {
  let column = cache.get(metric);
  if (!column || column.length !== trials.length) {
    column = trials.map((trial) => scoreMetric(trial.metrics, metric));
    cache.set(metric, column);
  }
  return column;
}

/**
 * A window's sets as the analysis jobs read them, with only the metrics the selection reads,
 * under the names it reads them by. The jobs see every set of every window, and a set's whole
 * metric table would make each request many megabytes.
 */
export function selectionRecords(
  trials: readonly OptimizationTrial[],
  metrics: readonly string[],
  cache: Map<string, readonly (number | null)[]>,
): TrialRecord[] {
  const columns = metrics
    .filter((metric) => metric !== consecutiveLossesMetric)
    .map((metric) => [metric, metricColumn(trials, metric, cache)] as const);
  return trials.map((trial, index) => ({
    trialId: trial.trialId,
    parameters: { ...trial.parameters.inputs },
    inSampleMetrics: Object.fromEntries(columns.map(([metric, column]) => [metric, column[index]])),
    inSampleStatistics: trial.statistics,
    tradeCount: trial.tradeCount,
    objectiveValue: null,
    inSampleValue: null,
    outOfSampleValue: null,
    valid: !trial.diagnostics.length,
    excluded: false,
  }));
}

/**
 * The run input for bars `start` to `end` of `common`'s. A range that ends before the data does
 * has no realtime tail of its own.
 */
export function rangeInput(common: RunInput, start: number, end: number): RunInput {
  const bars = common.bars.slice(start, end);
  return end < common.bars.length
    ? { ...common, bars, realtimeTail: false, strategyClosePending: false }
    : { ...common, bars };
}

/**
 * Run `tasks` with at most `limit` going at once, in order; each task's outcome lands at its
 * index. A task that throws rejects the whole.
 */
export async function inTurn<T>(tasks: readonly (() => Promise<T>)[], limit: number): Promise<T[]> {
  const outcomes = new Array<T>(tasks.length);
  let next = 0;
  const work = async () => {
    while (next < tasks.length) {
      const at = next++;
      outcomes[at] = await tasks[at]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), tasks.length) }, work));
  return outcomes;
}

/** The chosen set reproduced on the IS range must report what the sweep reported for it. */
export function sameMetrics(left: RunResult['metrics'], right: RunResult['metrics']): boolean {
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && Object.is(left[key], right[key]))
  );
}

/** A reproduced run without its plots and trades, which the walk-forward views never read. */
export function equityResult(result: TrialResult): TrialResult {
  return {
    plots: [],
    trades: [],
    metrics: result.metrics,
    diagnostics: result.diagnostics,
    ...(result.equity ? { equity: result.equity } : {}),
  };
}

// ----- what the session holds per window

/** How a window's set was chosen and how it ran. */
export interface WindowChoice {
  /** The selection settings it was chosen with (`selectionKey`). */
  readonly key: string;
  /** The window's sets as the selection scored them, for stability and the window map. */
  readonly records: readonly TrialRecord[];
  /** Null for a flat window. */
  readonly trialId: string | null;
  readonly parameters: Readonly<Record<string, LiteralValue>> | null;
  readonly inSample: TrialResult | null;
  readonly outOfSample: TrialResult | null;
  /** Set for a flat or failed window. */
  readonly error: Text | null;
}

/** One window as the session holds it. */
export interface WindowState {
  readonly plan: WindowPlan;
  /** Null until the window's IS range is optimized and its set chosen. */
  readonly choice: WindowChoice | null;
  /** The window's IS range is being optimized or its set run. */
  readonly running: boolean;
  /** The sets finished on the window's IS range. */
  readonly trials: readonly OptimizationTrial[];
}

export function windowStatus(window: Pick<WindowState, 'choice' | 'running'>): WindowStatus {
  const { choice } = window;
  if (!choice) return window.running ? 'running' : 'waiting';
  if (choice.trialId === null) return 'flat';
  return choice.error ? 'failed' : 'done';
}

/** The execution `finalize` takes for a window that ran its set; without trials it stays cheap. */
export function windowExecution(
  plan: WindowPlan,
  common: RunInput,
  choice: WindowChoice,
): WalkForwardExecution {
  const bounds = windowBounds(plan);
  return {
    ...bounds,
    inSampleBars: common.bars.slice(bounds.inSampleStartIndex, bounds.inSampleEndIndex),
    outOfSampleBars: common.bars.slice(bounds.outOfSampleStartIndex, bounds.outOfSampleEndIndex),
    trials: [],
    chosenParameters: { ...choice.parameters },
    inSampleResult: choice.inSample ?? undefined,
    outOfSampleResult: choice.outOfSample ?? undefined,
  };
}

// ----- the view

/** A window's chosen set on one of its ranges (W1). */
export interface WindowFigures {
  /** Equity change at the last bar, including open P&L; no hypothetical exit fee. */
  readonly netProfit: number | null;
  /** Annualized equity change in percent; WFE is the OOS one over the positive IS one. */
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
  /** The chosen set failed, or its IS rerun disagreed with the sweep; the equity breaks there. */
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
  /** Null unless the window is done. */
  readonly inSample: WindowFigures | null;
  readonly outOfSample: WindowFigures | null;
  /** OOS annualized return over positive IS annualized return; otherwise null. */
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
  /** Traded windows with positive reported OOS net profit, excluding open P&L. */
  readonly profitable: number;
  readonly flat: number;
  readonly failed: number;
  /** Summed equity changes over the traded windows; null before one is done. */
  readonly inSampleNet: number | null;
  readonly outOfSampleNet: number | null;
  readonly outOfSampleTrades: number | null;
  /** Stitched OOS CAGR over positive stitched IS CAGR; null until every window is done. */
  readonly wfe: number | null;
}

/** The stitched OOS equity: each finished window's OOS bars in turn, on one account (W1). */
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
   * How far the set's IS objective falls short of each window's best set, as a fraction of it,
   * averaged over the windows that ran a set; null when a window did not rank the set, because it
   * was not sampled there or failed the filters, or its best is zero.
   */
  readonly meanLoss: number | null;
  readonly origin: ParameterOrigin;
}

/** One window's band on a stability row (W1). */
export interface StabilityBand {
  /** The window's index; windows that ran no set have no band. */
  readonly window: number;
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
  /** One band per window that ran a set, in window order. */
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
  /** Rows for another tolerance or selection are being computed; `rows` are the previous ones. */
  readonly pending: boolean;
  readonly rows: readonly StabilityRow[];
}

/** The window map shows one window's IS surface, or the mean over every window (W3). */
export type WindowMapSurface = 'window' | 'mean';

export interface WindowMapView extends Omit<MapView, 'surface'> {
  readonly surface: WindowMapSurface;
  /** The window whose surface `window` shows, and whose set fixed slices default to. */
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
  /** For View backtest; null unless the window is done. */
  readonly origin: ParameterOrigin | null;
}

/** Everything the walk-forward results area shows, for the live run or the latest results. */
export interface WalkForwardView {
  /** The run's search rows: which inputs it searched, in declaration order, and at what step. */
  readonly searchRows: readonly SearchRow[];
  /** A run is still filling the windows in (W4). */
  readonly inProgress: boolean;
  /** Windows are being chosen again after the ranking, filters or smoothing changed. */
  readonly pending: boolean;
  readonly windows: readonly WindowResult[];
  readonly totals: WalkForwardTotals;
  readonly equity: StitchedEquity;
  /** Bar open times of the results' data, which the window plans index. */
  readonly times: readonly number[];
  /** Null until every window is done, or when an input has no value that holds up. */
  readonly fixed: FixedParameters | null;
  /** Null until every window is done. */
  readonly stability: StabilityView | null;
  /** Null until every window is done and the analysis has drawn it, or with one searched input. */
  readonly map: WindowMapView | null;
  /** A map for other settings is being drawn. */
  readonly mapPending: boolean;
  /** The analysis could not choose, finalize, rate stability or draw the map. */
  readonly error: Text | null;
  readonly selection: WindowSelection | null;
}

const numbers = (values: readonly (number | null)[]): number[] =>
  values.map((value) => value ?? Number.NaN);

function figures(
  net: number | null,
  annualized: number | null,
  trades: number | null,
): WindowFigures {
  return { netProfit: net, annualizedReturn: annualized, trades };
}

/**
 * The windows' rows from what the session holds and `finalize`'s result over the windows that ran
 * a set. A flat window keeps the account where the previous window left it.
 */
export function windowResults(
  windows: readonly WindowState[],
  finalized: WalkForwardResult | null,
): WindowResult[] {
  const byIndex = new Map(finalized?.windows.map((window) => [window.index, window]));
  const traded = finalized?.windows ?? [];
  return windows.map((window) => {
    const status = windowStatus(window);
    const { plan, choice } = window;
    const result = status === 'done' ? byIndex.get(plan.index) : undefined;
    let outOfSampleEquity: number[] = [];
    if (result) outOfSampleEquity = numbers(result.outOfSampleEquity);
    else if (status === 'flat') {
      const before = traded.filter((item) => item.index < plan.index).at(-1)?.endCapital;
      const after = traded.find((item) => item.index > plan.index)?.startCapital;
      const level = before ?? after ?? null;
      if (level !== null) outOfSampleEquity = new Array<number>(plan.outOfSampleBars).fill(level);
    }
    return {
      plan,
      status,
      completed: window.trials.length,
      trialId: choice?.trialId ?? null,
      parameters: choice?.parameters ?? null,
      inSample: result
        ? figures(result.inSampleNet, result.inSampleAnnualized, result.inSampleTrades)
        : null,
      outOfSample: result
        ? figures(result.outOfSampleNet, result.outOfSampleAnnualized, result.outOfSampleTrades)
        : null,
      wfe: result?.wfe ?? null,
      error: choice?.error ?? null,
      inSampleEquity: result ? numbers(result.inSampleEquity) : [],
      outOfSampleEquity,
    };
  });
}

export function walkForwardTotals(
  rows: readonly WindowResult[],
  finalized: WalkForwardResult | null,
): WalkForwardTotals {
  const count = (status: WindowStatus) => rows.filter((row) => row.status === status).length;
  const traded = count('done');
  const completed = traded + count('flat') + count('failed');
  const totals = traded ? finalized?.totals : undefined;
  return {
    windows: rows.length,
    completed,
    traded,
    profitable: totals?.winningWindows ?? 0,
    flat: count('flat'),
    failed: count('failed'),
    inSampleNet: totals?.inSampleNet ?? null,
    outOfSampleNet: totals?.outOfSampleNet ?? null,
    outOfSampleTrades: totals?.outOfSampleTrades ?? null,
    wfe: completed === rows.length ? (totals?.wfe ?? null) : null,
  };
}

/** Each finished window's OOS equity in turn, at its bars' open times. */
export function stitchedEquity(
  rows: readonly WindowResult[],
  times: readonly number[],
): StitchedEquity {
  const stitched = { times: [] as number[], values: [] as (number | null)[] };
  for (const row of rows) {
    if (row.status === 'waiting' || row.status === 'running') continue;
    const { outOfSampleStartIndex: start, outOfSampleBars: bars } = row.plan;
    for (let bar = 0; bar < bars; bar++) {
      stitched.times.push(times[start + bar]);
      stitched.values.push(row.outOfSampleEquity[bar] ?? null);
    }
  }
  return stitched;
}

const scalar = (value: LiteralValue): value is AnalysisValue => value !== null;

/** Stability rows from the analysis job, with each band on the window it belongs to. */
export function stabilityRows(
  summaries: readonly StabilitySummary[],
  axes: readonly AnalysisAxis[],
  windows: readonly number[],
): StabilityRow[] {
  return summaries.map((summary) => ({
    title: summary.parameter,
    values: axes.find((axis) => axis.title === summary.parameter)?.values.filter(scalar) ?? [],
    bands: summary.bands.map((band) => ({
      window: windows[band.window],
      near: band.values,
      chosen: band.chosen,
    })),
    common: summary.commonRanges,
    fixed: summary.fixedValue,
    meanLoss: summary.averageShortfall,
    allNearOptimal: !!summary.allNearOptimal,
  }));
}

/** As @pine/optimizer's stability measures it: relative to the best, which must not be zero. */
function shortfall(best: number, value: number, direction: Direction): number | null {
  const loss = Math.max(0, direction === 'maximize' ? best - value : value - best);
  if (best === 0) return loss === 0 ? 0 : null;
  return loss / Math.abs(best);
}

/**
 * The set for every window: each searched input at its stability row's fixed value, the other
 * inputs as the run set them. Null when an input has no fixed value. `windows` holds, for each
 * window that ran a set, its sets as the selection scored them.
 */
export function fixedParameters(
  rows: readonly StabilityRow[],
  windows: readonly (readonly TrialRecord[])[],
  base: Readonly<Record<string, LiteralValue>>,
  direction: Direction,
  optimizationId: number,
): FixedParameters | null {
  if (!windows.length || rows.some((row) => row.fixed === null)) return null;
  const parameters: Record<string, LiteralValue> = { ...base };
  for (const row of rows) parameters[row.title] = row.fixed;
  const same = (record: TrialRecord) =>
    rows.every((row) => JSON.stringify(record.parameters[row.title]) === JSON.stringify(row.fixed));
  const losses = windows.map((records) => {
    const ranked = records.filter(
      (record) =>
        record.valid &&
        !record.excluded &&
        record.objectiveValue !== null &&
        Number.isFinite(record.objectiveValue),
    );
    const set = ranked.find(same);
    if (!set) return null;
    const values = ranked.map((record) => record.objectiveValue!);
    const best = direction === 'maximize' ? Math.max(...values) : Math.min(...values);
    return shortfall(best, set.objectiveValue!, direction);
  });
  return {
    parameters,
    meanLoss: losses.some((loss) => loss === null)
      ? null
      : (losses as number[]).reduce((total, loss) => total + loss, 0) / losses.length,
    origin: { kind: 'fixed', optimizationId },
  };
}

/** The window map from the analysis job `view` of a window's sets (W3). */
export function windowMapView(
  analysis: OptimizerAnalysis,
  axes: readonly AnalysisAxis[],
  surface: WindowMapSurface,
  window: number,
  slices: Readonly<Record<string, Slice>>,
  chosen: WindowMapView['chosen'],
): WindowMapView | null {
  const { x, y, z } = analysis.axes;
  const maps = analysis.maps[0];
  if (axes.length < 2 || !x || !maps) return null;
  const display = maps.panelMap.display;
  const selected = chosen.find((item) => item.window === window)?.parameters ?? {};
  return {
    surface,
    window,
    x,
    y: y ?? null,
    z: z ?? null,
    map: maps.map,
    panel: maps.panelMap,
    binned: !!display && (display.xBinSize > 1 || display.yBinSize > 1),
    slices: sliceChips(axes, analysis.axes, slices, selected),
    chosen,
  };
}

/**
 * The selected window, or the last one that ran a set while none is selected. View backtest
 * previews a done window's set.
 */
export function windowSelection(
  rows: readonly WindowResult[],
  selected: number | null,
  optimizationId: number,
): WindowSelection | null {
  const explicit = selected !== null && selected >= 0 && selected < rows.length;
  const row = explicit ? rows[selected] : rows.findLast((item) => item.status === 'done');
  if (!row) return null;
  return {
    window: row,
    explicit,
    origin:
      row.status === 'done' && row.trialId
        ? {
            kind: 'window',
            optimizationId,
            trialId: row.trialId,
            window: row.plan.index,
            ranges: windowRanges(row.plan),
          }
        : null,
  };
}
