import type {
  Diagnostic,
  InputDescriptor,
  LiteralValue,
  MarketBar,
  ParameterSet,
  RunInput,
} from '@pine/engine';
import { errorText, type Message, type Text } from '@pine/messages';
import {
  splitBars,
  type AnalysisAxis,
  type OptimizerSummary,
  type SearchSpace,
  type Slice,
  type TrialResult,
  type WalkForwardResult,
} from '@pine/optimizer';
import {
  AnalysisRun,
  OptimizationCompileError,
  WorkerCancelledError,
  type AnalysisClient,
  type AnalysisRunView,
  type OptimizationOptions,
  type OptimizationProgress,
  type OptimizationResult,
  type OptimizationTrial,
} from '@pine/workers';
import type { BacktestSession, BacktestState, Dataset, Readiness } from './backtest.ts';
import { inputValues } from './inputs.ts';
import { windowSelectionRecords } from './optimize-records.ts';
import { workflowMessage } from './messages.ts';
import {
  filterValueError,
  metricConstraint,
  naturalDirection,
  objectiveBreakEven,
  objectiveMetric,
  type Direction,
  type FilterCondition,
  type ObjectiveId,
  defaultFilters,
} from './optimize-ranking.ts';
import {
  dataRange,
  defaultSampleCount,
  defaultSeed,
  defaultValidation,
  estimateDurationMs,
  gridLimit,
  keepSearchDraft,
  searchSetup,
  splitRatio,
  walkForwardConfig,
  type DataRange,
  type SamplingSettings,
  type SearchDraft,
  type SearchSetup,
  type ValidationSettings,
  type WalkForwardSettings,
} from './optimize-setup.ts';
import {
  curveView,
  distributionView,
  draftPreview,
  failedCombination,
  filterDiagnosis,
  leadingSets,
  leaderboardPageForRank,
  defaultLeaderboardPageSize,
  normalizeLeaderboardPageSize,
  leaderboardView,
  mapView,
  medianCurve,
  rankResults,
  scatterView,
  selectionOf,
  sensitivityView,
  summaryRequest,
  topEquityCount,
  type CurveView,
  type DistributionView,
  type DraftPreview,
  type FailedCombination,
  type FailedRange,
  type FilterDiagnosis,
  type LeaderboardView,
  type MapSurface,
  type MapView,
  type RankedResults,
  type ScatterView,
  type Selection,
  type SensitivityView,
  type ValidationResultMode,
} from './optimize-views.ts';
import { propertyIds, propertySettings, type PropertyOverrides } from './properties.ts';
import { createStore, type Observable, type Store } from './store.ts';
import {
  defaultTolerance,
  equityResult,
  fixedParameters,
  inTurn,
  rangeInput,
  sameMetrics,
  selectionConfig,
  selectionKey,
  selectionMetrics,
  stabilityRows,
  stitchedEquity,
  walkForwardTotals,
  windowExecution,
  windowMapView,
  windowPlan,
  windowResults,
  windowSelection,
  windowStatus,
  type FixedParameters,
  type StabilityRow,
  type WalkForwardView,
  type WindowChoice,
  type WindowMapSurface,
  type WindowMapView,
  type WindowPlan,
} from './walk-forward.ts';

export type { WindowPlan } from './walk-forward.ts';

/** The parts of `OptimizationWorkerPool` the session uses, so tests can pass a fake. */
export interface OptimizationPool {
  optimize(
    source: string,
    common: RunInput,
    parameters: readonly ParameterSet[],
    options?: OptimizationOptions,
  ): Promise<OptimizationResult>;
  /** Runs `runWithEquity` for one set in a Worker of its own; aborting terminates it. */
  reproduce(
    source: string,
    common: RunInput,
    parameters: ParameterSet,
    sourceRevision?: number,
    signal?: AbortSignal,
  ): Promise<TrialResult>;
  /** Terminates every Worker of the run and of reproductions at once. */
  cancel(): void;
}

/** Timers the session schedules snapshots with, so tests control time. */
export interface Timers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** A live run's views are refreshed at most this often (WEB.md 3.2). */
export const snapshotIntervalMs = 250;

/** Map axes the user chose (R4, R12); an axis left out takes the analysis' choice. */
export interface MapAxes {
  readonly x?: string;
  readonly y?: string;
  readonly z?: string;
}

/** How results are viewed. None of it needs a re-run (WEB.md 3.1). */
export interface ViewSettings {
  readonly objective: ObjectiveId;
  readonly direction: Direction;
  readonly filters: readonly FilterCondition[];
  /** The condition being written in R10's popover: previewed, not applied. */
  readonly draft: FilterCondition | null;
  /** Null until the user picks an axis. */
  readonly axes: MapAxes | null;
  readonly slices: Readonly<Record<string, Slice>>;
  /** Each map cell becomes the mean of its ±1 step neighbours. */
  readonly smooth: boolean;
  readonly surface: MapSurface;
  readonly selectedTrialId: string | null;
  readonly page: number;
  /** Whole leaderboard rows that fit the currently rendered body. */
  readonly pageSize: number;
  /** The selected walk-forward window; null selects the last one that ran a set (W1). */
  readonly window: number | null;
  readonly windowSurface: WindowMapSurface;
  /** Stability's tolerance as a fraction of each window's best (W1). */
  readonly tolerance: number;
}

export type OptimizationPhase = 'preparing' | 'all' | 'in' | 'out' | 'analyzing';

/** The run block during a run (O8), refreshed with each snapshot. */
export interface RunProgress {
  /**
   * `preparing` lists the parameter sets, `all`, `in` and `out` run the full, IS and OOS range,
   * and `analyzing` builds the final views.
   */
  readonly phase: OptimizationPhase;
  readonly combinations: number;
  /** Backtests finished: one per combination, two for IS / OOS (the IS range, then the OOS). */
  readonly completed: number;
  readonly total: number;
  /** Combinations whose run failed so far. */
  readonly failed: number;
  readonly elapsedMs: number;
  /** From the pool's measured trials; null until it has measured one. */
  readonly remainingMs: number | null;
  readonly workers: number;
  /**
   * Walk-forward: the window being optimized (0-based) of `count` (W4). `completed` and `total`
   * then count the sets of that window's IS range.
   */
  readonly window: { readonly index: number; readonly count: number } | null;
}

export interface OptimizationFailure {
  /** The script's compile diagnostics, when it failed to compile in the Workers. */
  readonly diagnostics: readonly Diagnostic[];
  /** Set when a Worker failed rather than the script. */
  readonly error: Text | null;
}

/** A run is complete or absent: a cancelled or failed run leaves the previous results. */
export type OptimizationRunState =
  | { readonly status: 'idle' }
  | { readonly status: 'running'; readonly startedAt: number; readonly progress: RunProgress }
  | { readonly status: 'done'; readonly startedAt: number; readonly finishedAt: number }
  | {
      readonly status: 'failed';
      readonly startedAt: number;
      readonly finishedAt: number;
      readonly failure: OptimizationFailure;
    }
  | { readonly status: 'cancelled'; readonly startedAt: number; readonly finishedAt: number };

/** Exactly what results were computed with (R5). */
export interface OptimizationSnapshot {
  readonly source: string;
  readonly sourceRevision: number;
  readonly dataset: Dataset;
  readonly properties: PropertyOverrides;
  readonly validation: ValidationSettings;
  /** The rows, space and sampling as they were. */
  readonly search: SearchSetup;
  /** Bars in the IS range for IS / OOS, where the OOS range starts; null otherwise. */
  readonly inSampleBars: number | null;
}

export interface OptimizationResults {
  /** Identifies the run, as a parameter set's origin names it. */
  readonly id: number;
  readonly computedWith: OptimizationSnapshot;
  readonly space: SearchSpace;
  readonly mode: ValidationResultMode | 'walk-forward';
  /** The sets each range, or each window's IS range, ran. */
  readonly combinations: number;
  /** Walk-forward: the windows the run took; null otherwise. */
  readonly windows: number | null;
  /** Failed sets, not ranked (R11). */
  readonly failures: readonly FailedCombination[];
  readonly durationMs: number;
  readonly finishedAt: number;
  readonly workers: number;
}

export type OptimizationOutdatedReason = 'source' | 'ranges' | 'validation' | 'properties' | 'data';

/** The walk-forward windows (O3), planned and validated by the analysis job `plan`. */
export type WalkForwardPlanState =
  | { readonly status: 'idle' }
  | { readonly status: 'planning' }
  | { readonly status: 'planned'; readonly windows: readonly WindowPlan[] }
  | { readonly status: 'failed'; readonly error: Text };

/** The run block pinned under the panel (O1, O3, O5). */
export interface RunBlock {
  /** Null while the search ranges have an error. */
  readonly combinations: number | null;
  /** Backtests the run takes: combinations, twice that for IS / OOS, times windows for walk-forward. */
  readonly backtests: number | null;
  readonly windows: number | null;
  /** Null until a backtest or an optimization of this script has measured the cost. */
  readonly estimatedMs: number | null;
  readonly threads: number;
  /** Results exist, so the action reads Re-optimize. */
  readonly rerun: boolean;
}

export interface EquityCurve {
  readonly trialId: string;
  readonly rank: number;
  /** One account value per bar over the whole data range; null when the set's run failed. */
  readonly equity: readonly number[] | null;
  readonly error: Text | null;
}

/** Top 20 equity (R1): the leading sets rerun with `runWithEquity` over the whole range. */
export interface TopEquity {
  readonly status: 'idle' | 'running' | 'ready';
  readonly resultsId: number | null;
  /** #1 first. */
  readonly curves: readonly EquityCurve[];
  readonly median: readonly number[] | null;
  /** Bar open times of the results' data, aligned with each curve. */
  readonly times: readonly number[];
  /** The first OOS bar, where the split is marked; null for validation None. */
  readonly splitIndex: number | null;
}

/** Everything the results area shows, for the live run or the latest results. */
export interface ResultsViews {
  /** Identifies the displayed run even while its analysis is refreshed. */
  readonly runId: number;
  /** Input order and precision belong to the displayed run, including while settings are outdated. */
  readonly searchRows: SearchSetup['rows'];
  /** A run is still streaming: these are not results yet (O8). */
  readonly inProgress: boolean;
  /** Validation None ranks by full-range figures, which only measure fit (R3). */
  readonly unvalidated: boolean;
  readonly mode: ValidationResultMode;
  /**
   * Sets in the analysis, of `combinations`: those with a result on the range they are ranked by
   * (the IS range for IS / OOS, whose OOS results follow).
   */
  readonly completed: number;
  readonly combinations: number;
  readonly failed: number;
  /** A newer analysis is being computed for the current settings. */
  readonly pending: boolean;
  /** The analysis could not draw the map, for example with too many cells. */
  readonly mapError: Text | null;
  readonly leaderboard: LeaderboardView;
  readonly selection: Selection | null;
  readonly scatter: ScatterView | null;
  readonly distribution: DistributionView;
  /** Filled when no set passes the filters (R9). */
  readonly filterDiagnosis: readonly FilterDiagnosis[];
  /** Null without a draft condition, or until the analysis for it arrives. */
  readonly draftPreview: DraftPreview | null;
  /** Two or more searched inputs. */
  readonly map: MapView | null;
  /** One searched input (R8). */
  readonly curve: CurveView | null;
  readonly sensitivity: SensitivityView;
  /** The analysis Worker's summary, for cell hover (`cellValues`). */
  readonly summary: OptimizerSummary;
}

export interface OptimizationState {
  readonly search: SearchSetup;
  readonly sampling: SamplingSettings;
  readonly validation: ValidationSettings;
  /** Validation None: ranks will only measure fit, which the panel warns about (O2). */
  readonly unvalidated: boolean;
  readonly dataRange: DataRange;
  readonly plan: WalkForwardPlanState;
  readonly viewSettings: ViewSettings;
  readonly runBlock: RunBlock;
  readonly readiness: Readiness;
  readonly run: OptimizationRunState;
  /** The latest complete results; kept through later failures and cancellations. */
  readonly results: OptimizationResults | null;
  /** Null without results; empty reasons while they match the current settings. */
  readonly outdated: { readonly reasons: readonly OptimizationOutdatedReason[] } | null;
  /** Null until an analysis exists for what is shown. */
  readonly views: ResultsViews | null;
  /** The analysis Worker failed on the latest request. */
  readonly analysisError: Text | null;
  readonly topEquity: TopEquity;
  /** The walk-forward run or results on display (W1–W6); null when the results are not walk-forward. */
  readonly walkForward: WalkForwardView | null;
}

/** Internal state captured when a Worker-backed view or Top 20 request is still pending. */
export interface OptimizationDiagnostics {
  readonly topEquity: {
    readonly status: TopEquity['status'];
    readonly key: string | null;
    readonly requestActive: boolean;
  };
  readonly viewKey: string;
  readonly analysisKey: string | null;
  readonly leaderboardFirstTrialId: string | null;
  readonly run: OptimizationRunState;
  readonly lastAnalysisRequestAt: number | null;
  readonly lastReproductionRequestAt: number | null;
}

export interface OptimizationSessionOptions {
  /** Workers for a run: one per CPU thread minus one (`availableWorkerCount`). */
  threads: number;
  /** Milliseconds since the epoch; `Date.now` unless a test fixes the clock. */
  now?: () => number;
  timers?: Timers;
}

interface LiveRun {
  readonly id: number;
  readonly snapshot: OptimizationSnapshot;
  readonly space: SearchSpace;
  readonly mode: ValidationResultMode;
  readonly startedAt: number;
  readonly ranges: readonly { phase: FailedRange; bars: readonly MarketBar[] }[];
  phase: OptimizationPhase;
  combinations: number;
  /**
   * The trials, outside any UI state (WEB.md 3.2): each reaches the analysis Worker once, with the
   * next snapshot's view.
   */
  readonly analysis: AnalysisRun;
  readonly failures: Map<string, FailedCombination>;
  /** The pool's latest progress for the running range. */
  progress: OptimizationProgress | null;
}

/** One walk-forward window as a run fills it in. */
interface WindowRun {
  readonly plan: WindowPlan;
  /** The sweep's trials on the IS range in the order they arrived, outside any UI state. */
  readonly trials: OptimizationTrial[];
  /** Metric columns of `trials` the selection has read, by metric. */
  readonly columns: Map<string, readonly (number | null)[]>;
  running: boolean;
  choice: WindowChoice | null;
}

/** A walk-forward run's windows and what is derived from them, live or as the results. */
interface WalkForwardRun {
  readonly id: number;
  readonly snapshot: OptimizationSnapshot;
  readonly space: SearchSpace;
  /** The data and properties the run took; each range is a slice of its bars. */
  readonly common: RunInput;
  readonly times: readonly number[];
  readonly windows: readonly WindowRun[];
  /** `finalize` over the windows that ran a set. */
  finalized: WalkForwardResult | null;
  stability: {
    readonly key: string;
    readonly rows: readonly StabilityRow[];
    readonly fixed: FixedParameters | null;
  } | null;
  map: {
    readonly key: string;
    readonly view: WindowMapView | null;
    readonly error: Text | null;
  } | null;
  /** Raised with every change to the above, for the derived view. */
  version: number;
}

interface WalkForwardLive {
  readonly data: WalkForwardRun;
  readonly startedAt: number;
  readonly failures: Map<string, FailedCombination>;
  phase: OptimizationPhase;
  /** The window being optimized. */
  current: number;
  combinations: number;
  /** The pool's latest progress on the current window. */
  progress: OptimizationProgress | null;
}

interface AnalysisSlot {
  readonly summary: OptimizerSummary;
  /** The run's trials its positions index. */
  readonly trials: readonly OptimizationTrial[];
  /** The view request it answers, from `viewKey`. */
  readonly key: string;
  readonly draft: FilterCondition | null;
  /** Trials in the analysis, both ranges counted, to tell whether a newer snapshot exists. */
  readonly completed: number;
  /** The results it belongs to, or the live run. */
  readonly runId: number;
}

const sameJson = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);
const sameProperties = (a: PropertyOverrides, b: PropertyOverrides): boolean =>
  propertyIds.every((id) => Object.is(a[id], b[id]));

const defaultTimers: Timers = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

const idleEquity: TopEquity = {
  status: 'idle',
  resultsId: null,
  curves: [],
  median: null,
  times: [],
  splitIndex: null,
};

/**
 * The Optimize page: search ranges, validation, ranking and filters over the Backtest page's
 * script, data and properties; the run on the Worker pool; and the views of its results (WEB.md
 * 2.4–2.6, 3.1, 3.2). Trials stream into a buffer outside any state; subscribers see a snapshot
 * at most every 250 ms, and every derived view is computed by the analysis Worker, a newer request
 * replacing one that waits.
 *
 * A walk-forward run optimizes each window's IS range in turn, chooses a set with the current
 * ranking, filters and smoothing, and reruns it on the IS range, where it must match the sweep,
 * and on the OOS range (WEB.md 4.6). Those stay view settings: changing them chooses each window's
 * set again from the trials the run kept and reruns only the sets that changed, without a new run.
 */
export class OptimizationSession implements Observable<OptimizationState> {
  readonly #backtest: BacktestSession;
  readonly #pool: OptimizationPool;
  readonly #analysis: AnalysisClient;
  readonly #threads: number;
  readonly #now: () => number;
  readonly #timers: Timers;
  readonly #store: Store<OptimizationState>;
  readonly #unsubscribe: () => void;
  /** The Backtest page's script the run and results belong to (`BacktestState.scriptId`). */
  #scriptId: number;

  /**
   * Search-range drafts by input title, with the declaration they were made for: those the user
   * edited, and the defaults a run took. A row without one follows the input's current value.
   */
  readonly #drafts = new Map<string, { descriptor: InputDescriptor; draft: SearchDraft }>();
  #draftsVersion = 0;
  #sampling: SamplingSettings = { method: 'grid', count: defaultSampleCount, seed: defaultSeed };
  #validation: ValidationSettings = defaultValidation;
  #viewSettings: ViewSettings = {
    objective: 'netProfit',
    direction: 'maximize',
    filters: defaultFilters,
    draft: null,
    axes: null,
    slices: {},
    smooth: true,
    surface: 'in',
    selectedTrialId: null,
    page: 0,
    pageSize: defaultLeaderboardPageSize,
    window: null,
    windowSurface: 'window',
    tolerance: defaultTolerance,
  };
  #plan: WalkForwardPlanState = { status: 'idle' };
  #planKey: string | null = null;
  #planWanted = false;
  #planInFlight = false;

  #nextRunId = 0;
  #run: OptimizationRunState = { status: 'idle' };
  #live: LiveRun | null = null;
  #snapshotTimer: unknown = null;
  #results: OptimizationResults | null = null;
  /** The results' trials, held in the analysis Worker for every later view. */
  #resultsRun: AnalysisRun | null = null;
  #resultsAnalysis: AnalysisSlot | null = null;
  #liveAnalysis: AnalysisSlot | null = null;
  #analysisError: Text | null = null;
  #viewWanted = false;
  #viewInFlight = false;
  /** The last optimization's cost per bar and trial, for the next estimate. */
  #measured: { source: string; perBarMs: number } | null = null;

  #topEquity: TopEquity = idleEquity;
  #topRequest: AbortController | null = null;
  /** The results and sets of the Top 20 request running or done. */
  #topKey: string | null = null;
  #lastAnalysisRequestAt: number | null = null;
  #liveViewTimer: unknown = null;
  #lastReproductionRequestAt: number | null = null;
  readonly #curves = new Map<string, { equity: readonly number[] | null; error: Text | null }>();

  /** The walk-forward run going, and the latest walk-forward results' windows. */
  #wfLive: WalkForwardLive | null = null;
  #wfResults: WalkForwardRun | null = null;
  #wfWanted = false;
  #wfInFlight = false;
  /** Rechoosing the windows' sets, aborted when the selection settings change again. */
  #reselection: { readonly key: string; readonly abort: AbortController } | null = null;
  #wfError: Text | null = null;

  #searchMemo: { key: readonly unknown[]; value: SearchSetup } | null = null;
  #rangeMemo: { key: readonly unknown[]; value: DataRange } | null = null;
  #viewsMemo: { key: readonly unknown[]; value: ResultsViews | null } | null = null;
  #wfMemo: { key: readonly unknown[]; value: WalkForwardView | null } | null = null;
  #rankedMemo: { slot: AnalysisSlot; settings: ViewSettings; value: RankedResults } | null = null;

  constructor(
    backtest: BacktestSession,
    pool: OptimizationPool,
    analysis: AnalysisClient,
    options: OptimizationSessionOptions,
  ) {
    this.#backtest = backtest;
    this.#pool = pool;
    this.#analysis = analysis;
    this.#threads = Math.max(1, Math.floor(options.threads));
    this.#now = options.now ?? Date.now;
    this.#timers = options.timers ?? defaultTimers;
    this.#scriptId = backtest.getState().scriptId;
    this.#store = createStore(this.#derive());
    this.#unsubscribe = backtest.subscribe((state) => {
      if (state.scriptId !== this.#scriptId) this.#forgetScript(state.scriptId);
      if (this.#validation.mode === 'walk-forward') this.#requestPlan();
      this.#publish();
    });
  }

  getState(): OptimizationState {
    return this.#store.getState();
  }

  /** A read-only snapshot for diagnosing a slow or stuck Worker-backed view in end-to-end tests. */
  getDiagnostics(): OptimizationDiagnostics {
    const state = this.getState();
    return {
      topEquity: {
        status: state.topEquity.status,
        key: this.#topKey,
        requestActive: state.topEquity.status === 'running' && this.#topRequest !== null,
      },
      viewKey: this.#viewKey(),
      analysisKey: this.#resultsAnalysis?.key ?? this.#liveAnalysis?.key ?? null,
      leaderboardFirstTrialId: state.views?.leaderboard.rows[0]?.trialId ?? null,
      run: state.run,
      lastAnalysisRequestAt: this.#lastAnalysisRequestAt,
      lastReproductionRequestAt: this.#lastReproductionRequestAt,
    };
  }

  subscribe(listener: (state: OptimizationState) => void): () => void {
    return this.#store.subscribe(listener);
  }

  /** Stop listening to the Backtest page, stop any run and release the analysis Worker's runs. */
  dispose(): void {
    this.#unsubscribe();
    this.cancel();
    this.#topRequest?.abort();
    this.#reselection?.abort.abort();
    this.#resultsRun?.close();
  }

  #publish(): void {
    this.#store.setState(this.#derive());
  }

  // ----- setup

  #editDraft(title: string, edit: (draft: SearchDraft) => SearchDraft | null): void {
    const row = this.getState().search.rows.find((item) => item.descriptor.title === title);
    if (!row?.draft) return;
    const draft = edit(row.draft);
    if (!draft) return;
    this.#drafts.set(title, { descriptor: row.descriptor, draft });
    this.#draftsVersion++;
    this.#publish();
  }

  /** The row's checkbox: search the input, or fix it. */
  setSearched(title: string, searched: boolean): void {
    this.#editDraft(title, (draft) => ({ ...draft, searched }));
  }

  /** From, to and step of a numeric row. */
  setRange(title: string, change: Partial<{ from: number; to: number; step: number }>): void {
    this.#editDraft(title, (draft) =>
      draft.values.kind === 'range' ? { ...draft, values: { ...draft.values, ...change } } : null,
    );
  }

  /** Keep or drop one value of an option or bool row (O4). */
  setValueKept(title: string, value: LiteralValue, kept: boolean): void {
    const row = this.getState().search.rows.find((item) => item.descriptor.title === title);
    if (!row) return;
    const values = row.choices
      .filter((choice) => (sameJson(choice.value, value) ? kept : choice.kept))
      .map((choice) => choice.value);
    this.#editDraft(title, (draft) =>
      draft.values.kind === 'list' ? { ...draft, values: { kind: 'list', values } } : null,
    );
  }

  /** The value of a row that is not searched. */
  setFixedValue(title: string, value: LiteralValue): void {
    this.#editDraft(title, (draft) => ({ ...draft, fixed: value }));
  }

  /** Grid or Random, the sample count and the seed (O5). */
  setSampling(change: Partial<SamplingSettings>): void {
    this.#sampling = { ...this.#sampling, ...change };
    this.#publish();
  }

  setValidation(
    change: Partial<Omit<ValidationSettings, 'walkForward'>> & {
      walkForward?: Partial<WalkForwardSettings>;
    },
  ): void {
    this.#validation = {
      ...this.#validation,
      ...change,
      walkForward: { ...this.#validation.walkForward, ...change.walkForward },
    };
    if (this.#validation.mode === 'walk-forward') this.#requestPlan();
    this.#publish();
  }

  // ----- view settings: never a re-run

  #setView(change: Partial<ViewSettings>): void {
    const previous = this.#viewSettings;
    const next = { ...previous, ...change };
    this.#viewSettings = next;
    // Ready curves must belong to the current ranking, even while its analysis is pending.
    // Walk-forward results have no Top 20 curves to wait for.
    if (
      previous.objective !== next.objective ||
      previous.direction !== next.direction ||
      !sameJson(previous.filters, next.filters)
    ) {
      this.#topRequest?.abort();
      this.#topRequest = null;
      this.#topKey = null;
      this.#topEquity =
        this.#results && this.#results.mode !== 'walk-forward'
          ? { ...idleEquity, status: 'running', resultsId: this.#results.id }
          : idleEquity;
    }
    this.#publish();
    this.#requestView();
    this.#requestWalkForward();
  }

  /** The ranking objective (O7); its natural direction comes with it. */
  setObjective(objective: ObjectiveId): void {
    this.#setView({ objective, direction: naturalDirection(objective), page: 0 });
  }

  setDirection(direction: Direction): void {
    this.#setView({ direction, page: 0 });
  }

  /** Add a condition; the draft closes. Ignored while its value is invalid. */
  addFilter(filter: FilterCondition): void {
    if (filterValueError(filter.value)) return;
    this.#setView({ filters: [...this.#viewSettings.filters, filter], draft: null, page: 0 });
  }

  removeFilter(index: number): void {
    this.#setView({
      filters: this.#viewSettings.filters.filter((_, at) => at !== index),
      page: 0,
    });
  }

  /** The condition being written (R10); null closes the popover. */
  setDraftFilter(draft: FilterCondition | null): void {
    this.#setView({ draft });
  }

  /**
   * Make `title` the X, Y or Z axis (R4, R12). An input that already is another axis swaps
   * places with the one it replaces; null clears Z.
   */
  setAxis(role: keyof MapAxes, title: string | null): void {
    if (title === null && role !== 'z') return;
    const { views, walkForward } = this.getState();
    const map = walkForward?.map;
    const shown =
      views?.summary.axes ??
      (map ? { x: map.x, y: map.y ?? undefined, z: map.z ?? undefined } : {});
    const chosen = this.#viewSettings.axes ?? {};
    const axes: { x?: string; y?: string; z?: string } = {
      x: chosen.x ?? shown.x,
      y: chosen.y ?? shown.y,
      z: chosen.z ?? shown.z,
    };
    const replaced = axes[role];
    for (const other of ['x', 'y', 'z'] as const)
      if (other !== role && title !== null && axes[other] === title) axes[other] = replaced;
    axes[role] = title ?? undefined;
    const set = (['x', 'y', 'z'] as const).filter((name) => axes[name] !== undefined);
    this.#setView({ axes: Object.fromEntries(set.map((name) => [name, axes[name]])) });
  }

  setSlice(title: string, slice: Slice): void {
    this.#setView({ slices: { ...this.#viewSettings.slices, [title]: slice } });
  }

  setSmooth(smooth: boolean): void {
    this.#setView({ smooth });
  }

  /** IS or OOS map surface: both are in the analysis already. */
  setSurface(surface: MapSurface): void {
    this.#setView({ surface });
  }

  /** Update the rendered leaderboard capacity, preserving its leading or selected set. */
  setPageSize(pageSize: number): void {
    if (!Number.isFinite(pageSize)) return;
    const next = normalizeLeaderboardPageSize(pageSize);
    if (next === this.#viewSettings.pageSize) return;
    const views = this.#views();
    const selection = views?.selection;
    const anchor = selection?.explicit
      ? selection.row.rank
      : (views?.leaderboard.rows[0]?.rank ?? 1);
    this.#setView({ pageSize: next, page: leaderboardPageForRank(anchor, next) });
  }

  /** Select a set (3.3): reveal its leaderboard page and move the map; null returns to #1. */
  select(trialId: string | null): void {
    this.#viewSettings = { ...this.#viewSettings, selectedTrialId: trialId };
    const selection = this.#views()?.selection;
    this.#setView(
      selection?.explicit
        ? { page: leaderboardPageForRank(selection.row.rank, this.#viewSettings.pageSize) }
        : {},
    );
  }

  setPage(page: number): void {
    this.#setView({ page: Math.max(0, Math.floor(page)) });
  }

  /** Select a walk-forward window (W1); null returns to the last one that ran a set. */
  selectWindow(window: number | null): void {
    this.#setView({ window: window === null ? null : Math.max(0, Math.floor(window)) });
  }

  /** The window map shows the selected window's IS surface, or the mean over every window (W3). */
  setWindowMapSurface(windowSurface: WindowMapSurface): void {
    this.#setView({ windowSurface });
  }

  /**
   * Stability's tolerance as a fraction of each window's best, from 0 to 1; only the stability is
   * computed again. Ignored outside that range.
   */
  setStabilityTolerance(tolerance: number): void {
    if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 1) return;
    this.#setView({ tolerance });
  }

  /**
   * View backtest for the selected walk-forward window (WEB.md 3.3, B16): its set runs on the
   * Backtest page without changing the current inputs. Does nothing unless the window ran a set.
   */
  previewWindow(): Promise<void> {
    const view = this.getState().walkForward;
    const origin = view?.selection?.origin;
    const parameters = view?.selection?.window.parameters;
    // The banner names the set and its values as this run searched them, whatever runs next.
    return view && origin && parameters
      ? this.#backtest.preview(parameters, { ...origin, searchRows: view.searchRows })
      : Promise.resolve();
  }

  /** Apply to inputs for the fixed parameters for every window (W1, B17). */
  applyFixedParameters(): Promise<void> {
    const view = this.getState().walkForward;
    return view?.fixed
      ? this.#backtest.applyParameters(view.fixed.parameters, {
          ...view.fixed.origin,
          searchRows: view.searchRows,
        })
      : Promise.resolve();
  }

  // ----- the run

  /** Start the optimization with the current settings; does nothing unless `readiness.ok`. */
  async start(): Promise<void> {
    const state = this.getState();
    const backtest = this.#backtest.getState();
    const { space, sampling } = state.search;
    if (!state.readiness.ok || !space || !sampling || !backtest.dataset) return;
    if (state.validation.mode === 'walk-forward') {
      if (state.plan.status === 'planned') await this.#startWalkForward(state.plan.windows);
      return;
    }
    const bars = backtest.dataset.input.bars;
    const mode: ValidationResultMode = state.validation.mode === 'none' ? 'none' : 'in-out';
    const split =
      mode === 'none' ? null : splitBars(bars, { mode, splitRatio: splitRatio(state.validation) });
    const snapshot = this.#snapshot(split ? split.inSample.length : null);
    const startedAt = this.#now();
    const live: LiveRun = {
      id: ++this.#nextRunId,
      snapshot,
      space,
      mode,
      startedAt,
      ranges: split
        ? [
            { phase: 'in', bars: split.inSample },
            { phase: 'out', bars: split.outOfSample },
          ]
        : [{ phase: 'all', bars }],
      phase: 'preparing',
      combinations: sampling.combinations,
      analysis: new AnalysisRun(this.#analysis),
      failures: new Map(),
      progress: null,
    };
    this.#live = live;
    this.#liveAnalysis = null;
    this.#beforeRun();
    this.#run = { status: 'running', startedAt, progress: this.#progress(live) };
    this.#publish();
    let summary: OptimizerSummary;
    let key: string;
    let draft: FilterCondition | null;
    const elapsed = { workerMs: 0, workers: 0 };
    try {
      const sets = await this.#parameterSets(snapshot);
      if (this.#live !== live) return;
      live.combinations = sets.length;
      const common = this.#common(snapshot);
      for (const range of live.ranges) {
        // A timer from IS must not publish again immediately after the OOS boundary.
        this.#clearSnapshot();
        live.phase = range.phase;
        live.progress = null;
        this.#run = { status: 'running', startedAt, progress: this.#progress(live) };
        this.#publish();
        // The IS range ends before the data does, so it has no realtime tail of its own.
        const input: RunInput =
          range.phase === 'in'
            ? { ...common, bars: range.bars, realtimeTail: false, strategyClosePending: false }
            : { ...common, bars: range.bars };
        const result = await this.#pool.optimize(snapshot.source, input, sets, {
          sourceRevision: snapshot.sourceRevision,
          workerCount: this.#threads,
          immutableParameters: true,
          onTrial: (trial) => this.#receive(live, range.phase, trial),
          onProgress: (progress) => {
            if (this.#live !== live) return;
            live.progress = progress;
            this.#scheduleSnapshot(live);
          },
        });
        if (this.#live !== live) return;
        elapsed.workerMs += result.elapsedMs * Math.max(1, result.workers);
        elapsed.workers = Math.max(elapsed.workers, result.workers);
      }
      live.phase = 'analyzing';
      this.#clearSnapshot();
      this.#run = { status: 'running', startedAt, progress: this.#progress(live) };
      this.#publish();
      key = this.#viewKey();
      draft = this.#validDraft();
      this.#lastAnalysisRequestAt = this.#now();
      summary = await live.analysis.view(this.#viewInput(space, mode), this.#summaryRequest(true));
      if (this.#live !== live) return;
      this.#measure(snapshot.source, elapsed.workerMs, sets.length * bars.length);
    } catch (error) {
      if (this.#live !== live) return;
      this.#endLive();
      live.analysis.close();
      this.#endRun(startedAt, error);
      return;
    }
    const finishedAt = this.#now();
    this.#endLive();
    this.#setResults({
      id: live.id,
      computedWith: snapshot,
      space,
      mode,
      combinations: live.combinations,
      windows: null,
      failures: [...live.failures.values()],
      durationMs: finishedAt - startedAt,
      finishedAt,
      workers: elapsed.workers,
    });
    this.#resultsRun = live.analysis;
    this.#resultsAnalysis = {
      summary,
      trials: live.analysis.trials,
      key,
      draft,
      completed: summary.total,
      runId: live.id,
    };
    this.#run = { status: 'done', startedAt, finishedAt };
    this.#afterLive();
  }

  /** What a run starting now computes with (R5). */
  #snapshot(inSampleBars: number | null): OptimizationSnapshot {
    const backtest = this.#backtest.getState();
    const state = this.getState();
    return {
      source: backtest.source,
      sourceRevision: backtest.sourceRevision,
      dataset: backtest.dataset!,
      properties: backtest.propertyOverrides,
      validation: state.validation,
      search: state.search,
      inSampleBars,
    };
  }

  #common(snapshot: OptimizationSnapshot): RunInput {
    return { ...snapshot.dataset.input, settings: propertySettings(snapshot.properties) };
  }

  /** Private scalar sets from the analysis Worker; never mutate them while ranges/windows borrow them. */
  async #parameterSets(snapshot: OptimizationSnapshot): Promise<readonly ParameterSet[]> {
    const { space, sampling } = snapshot.search;
    const parameters = await this.#analysis.request('parameters', {
      space: space!,
      method: sampling!.method,
      count: sampling!.count,
      seed: sampling!.seed,
      limit: gridLimit,
    });
    return parameters.map((inputs) => ({ inputs }));
  }

  /** The cost per bar and set of the run that just finished, for the next estimate. */
  #measure(source: string, workerMs: number, barRuns: number): void {
    if (barRuns > 0) this.#measured = { source, perBarMs: workerMs / barRuns };
  }

  /**
   * The pool's run terminates reproductions; an unfinished Top 20 or rechoice starts over later.
   * The default ranges the run takes stay as they are, so applying one of its sets to the inputs
   * does not move them and outdate the results.
   */
  #beforeRun(): void {
    for (const row of this.getState().search.rows)
      if (row.draft)
        this.#drafts.set(row.descriptor.title, { descriptor: row.descriptor, draft: row.draft });
    this.#topRequest?.abort();
    if (this.#topEquity.status === 'running') this.#topEquity = idleEquity;
    this.#reselection?.abort.abort();
    this.#viewSettings = { ...this.#viewSettings, selectedTrialId: null, page: 0, window: null };
  }

  /** A run that threw: cancelled, or failed with the script's diagnostics or a Worker's error. */
  #endRun(startedAt: number, error: unknown): void {
    const finishedAt = this.#now();
    this.#run =
      error instanceof WorkerCancelledError
        ? { status: 'cancelled', startedAt, finishedAt }
        : {
            status: 'failed',
            startedAt,
            finishedAt,
            failure:
              error instanceof OptimizationCompileError
                ? { diagnostics: error.diagnostics, error: null }
                : { diagnostics: [], error: errorText(error) },
          };
    this.#afterLive();
  }

  /**
   * Another script was opened on the Backtest page. The run and the results belong to the previous
   * script, whose inputs the new one does not have: previewing or applying one of their sets would
   * run the new script at its own values under the old set's name. So they go, where an edit of
   * the same script keeps them outdated (R5).
   */
  #forgetScript(scriptId: number): void {
    this.#scriptId = scriptId;
    this.cancel();
    this.#topRequest?.abort();
    this.#topRequest = null;
    this.#topKey = null;
    this.#reselection?.abort.abort();
    this.#reselection = null;
    this.#setResults(null);
    this.#analysisError = null;
    this.#run = { status: 'idle' };
    this.#viewSettings = {
      ...this.#viewSettings,
      axes: null,
      slices: {},
      selectedTrialId: null,
      page: 0,
      window: null,
    };
  }

  /** New complete results replace the previous ones, whichever validation they used. */
  #setResults(results: OptimizationResults | null): void {
    // The inactive layout will not derive again to evict its memo; drop its old run here.
    this.#viewsMemo = null;
    this.#rankedMemo = null;
    this.#wfMemo = null;
    this.#results = results;
    this.#resultsRun?.close();
    this.#resultsRun = null;
    this.#resultsAnalysis = null;
    this.#wfResults = null;
    this.#wfError = null;
    this.#curves.clear();
    this.#topEquity = idleEquity;
  }

  /** Stop every Worker at once; the previous results stay (WEB.md 3.1). */
  cancel(): void {
    const run = this.#run;
    if (run.status !== 'running') return;
    const live = this.#live;
    if (live) {
      this.#endLive();
      live.analysis.close();
    } else if (this.#wfLive) {
      this.#wfLive = null;
      this.#clearSnapshot();
    } else return;
    this.#pool.cancel();
    this.#run = { status: 'cancelled', startedAt: run.startedAt, finishedAt: this.#now() };
    this.#afterLive();
  }

  #endLive(): void {
    this.#live = null;
    this.#liveAnalysis = null;
    this.#clearSnapshot();
  }

  /** The results are on display again: bring their views and Top 20 up to date. */
  #afterLive(): void {
    this.#publish();
    this.#requestView();
    this.#requestTopEquity();
    this.#requestWalkForward();
  }

  // ----- walk-forward

  /**
   * Optimize each window's IS range in turn, choose its set and run it (WEB.md 4.6). Finished
   * windows show as they finish; the totals, stability and fixed parameters come with the last.
   */
  async #startWalkForward(plans: readonly WindowPlan[]): Promise<void> {
    const snapshot = this.#snapshot(null);
    const space = snapshot.search.space!;
    const common = this.#common(snapshot);
    const startedAt = this.#now();
    const data: WalkForwardRun = {
      id: ++this.#nextRunId,
      snapshot,
      space,
      common,
      times: common.bars.map((bar) => bar.time),
      windows: plans.map((plan) => ({
        plan,
        trials: [],
        columns: new Map(),
        running: false,
        choice: null,
      })),
      finalized: null,
      stability: null,
      map: null,
      version: 0,
    };
    const live: WalkForwardLive = {
      data,
      startedAt,
      failures: new Map(),
      phase: 'preparing',
      current: 0,
      combinations: snapshot.search.sampling!.combinations,
      progress: null,
    };
    this.#wfLive = live;
    this.#beforeRun();
    this.#run = { status: 'running', startedAt, progress: this.#windowProgress(live) };
    this.#publish();
    const elapsed = { workerMs: 0, workers: 0, bars: 0 };
    try {
      const sets = await this.#parameterSets(snapshot);
      if (this.#wfLive !== live) return;
      live.combinations = sets.length;
      for (const window of data.windows) {
        live.current = window.plan.index;
        live.phase = 'in';
        live.progress = null;
        window.running = true;
        this.#refreshWindows(live);
        const { inSampleStartIndex: start, inSampleBars: bars } = window.plan;
        const result = await this.#pool.optimize(
          snapshot.source,
          rangeInput(common, start, start + bars),
          sets,
          {
            sourceRevision: snapshot.sourceRevision,
            workerCount: this.#threads,
            immutableParameters: true,
            onTrial: (trial) => this.#receiveWindowTrial(live, window, trial),
            onProgress: (progress) => {
              if (this.#wfLive !== live) return;
              live.progress = progress;
              this.#scheduleSnapshot(live);
            },
          },
        );
        if (this.#wfLive !== live) return;
        elapsed.workerMs += result.elapsedMs * Math.max(1, result.workers);
        elapsed.workers = Math.max(elapsed.workers, result.workers);
        elapsed.bars += bars;
        live.phase = 'analyzing';
        this.#clearSnapshot();
        this.#refreshWindows(live);
        const [choice] = await this.#chooseWindows(data, [window]);
        if (this.#wfLive !== live) return;
        const choices = data.windows.map((item) => (item === window ? choice : item.choice));
        const finalized = await this.#finalize(data, choices);
        if (this.#wfLive !== live) return;
        window.choice = choice;
        window.running = false;
        data.finalized = finalized;
        this.#refreshWindows(live);
      }
      data.stability = await this.#stability(data);
      if (this.#wfLive !== live) return;
      this.#measure(snapshot.source, elapsed.workerMs, sets.length * elapsed.bars);
    } catch (error) {
      if (this.#wfLive !== live) return;
      this.#wfLive = null;
      this.#clearSnapshot();
      this.#endRun(startedAt, error);
      return;
    }
    const finishedAt = this.#now();
    this.#wfLive = null;
    this.#clearSnapshot();
    this.#setResults({
      id: data.id,
      computedWith: snapshot,
      space,
      mode: 'walk-forward',
      combinations: live.combinations,
      windows: data.windows.length,
      failures: [...live.failures.values()],
      durationMs: finishedAt - startedAt,
      finishedAt,
      workers: elapsed.workers,
    });
    this.#wfResults = data;
    data.version++;
    this.#run = { status: 'done', startedAt, finishedAt };
    this.#afterLive();
  }

  #receiveWindowTrial(live: WalkForwardLive, window: WindowRun, trial: OptimizationTrial): void {
    if (this.#wfLive !== live) return;
    window.trials.push(trial);
    if (!live.failures.has(trial.trialId)) {
      const failure = failedCombination(trial, 'in');
      if (failure) live.failures.set(trial.trialId, failure);
    }
    this.#scheduleSnapshot(live);
  }

  /** The windows changed during the run: show them with the run's progress. */
  #refreshWindows(live: WalkForwardLive): void {
    const run = this.#run;
    if (run.status !== 'running') return;
    live.data.version++;
    this.#run = { ...run, progress: this.#windowProgress(live) };
    this.#publish();
  }

  #windowProgress(live: WalkForwardLive): RunProgress {
    const { windows } = live.data;
    const window = windows[live.current];
    const progress = live.progress;
    let remainingMs = progress?.remainingMs ?? null;
    // The windows still ahead cost in proportion to their IS bars.
    if (remainingMs !== null && progress) {
      const ahead = windows
        .slice(live.current + 1)
        .reduce((bars, item) => bars + item.plan.inSampleBars, 0);
      remainingMs += Math.round(
        ((progress.elapsedMs + remainingMs) * ahead) / Math.max(1, window.plan.inSampleBars),
      );
    }
    return {
      phase: live.phase,
      combinations: live.combinations,
      completed: window.trials.length,
      total: live.combinations,
      failed: live.failures.size,
      elapsedMs: this.#now() - live.startedAt,
      remainingMs,
      workers: progress?.workers ?? 0,
      window: { index: live.current, count: windows.length },
    };
  }

  /**
   * Choose the windows' sets with the current ranking, filters and smoothing, then rerun each new
   * one on its window's IS range, where it must report what the sweep reported, and on its OOS
   * range. A window keeps the runs of a set it chose before; one where no set passes stays flat.
   */
  async #chooseWindows(
    data: WalkForwardRun,
    windows: readonly WindowRun[],
    signal?: AbortSignal,
  ): Promise<WindowChoice[]> {
    const settings = this.#viewSettings;
    const key = selectionKey(settings);
    const metrics = selectionMetrics(settings);
    const groups = [];
    for (const window of windows) {
      if (signal?.aborted) throw new WorkerCancelledError();
      groups.push(await windowSelectionRecords(window.trials, metrics, window.columns));
    }
    if (signal?.aborted || (this.#wfLive?.data !== data && this.#wfResults !== data))
      throw new WorkerCancelledError();
    const chosen = await this.#analysis.request('choose', {
      groups,
      config: selectionConfig(
        data.snapshot.validation.walkForward,
        settings,
        data.space.activeAxes,
      ),
      constraints: settings.filters.map(metricConstraint),
    });
    if (signal?.aborted) throw new WorkerCancelledError();
    const picks = windows.map((window, index) => {
      const best = chosen[index].bestTrial;
      const trial = best && window.trials.find((item) => item.trialId === best.trialId);
      return { window, records: chosen[index].trials, trial };
    });
    const reruns = picks.filter(
      ({ window, trial }) => trial && window.choice?.trialId !== trial.trialId,
    );
    const { source, sourceRevision } = data.snapshot;
    const runs = reruns.flatMap(({ window, trial }) => {
      const { inSampleStartIndex, inSampleBars, outOfSampleStartIndex, outOfSampleBars } =
        window.plan;
      const ranges = [
        [inSampleStartIndex, inSampleStartIndex + inSampleBars],
        [outOfSampleStartIndex, outOfSampleStartIndex + outOfSampleBars],
      ];
      return ranges.map(([start, end]) => async () => {
        // An aborted rechoice starts no more runs.
        if (signal?.aborted) return new WorkerCancelledError();
        try {
          return equityResult(
            await this.#pool.reproduce(
              source,
              rangeInput(data.common, start, end),
              { inputs: { ...trial!.parameters.inputs } },
              sourceRevision,
              signal,
            ),
          );
        } catch (error) {
          return error instanceof Error ? error : new Error(String(error));
        }
      });
    });
    const outputs = await inTurn(runs, this.#threads);
    const cancelled = outputs.find((output) => output instanceof WorkerCancelledError);
    if (cancelled || signal?.aborted) throw cancelled ?? new WorkerCancelledError();
    return picks.map(({ window, records, trial }) => {
      if (!trial)
        return {
          key,
          records,
          trialId: null,
          parameters: null,
          inSample: null,
          outOfSample: null,
          error: workflowMessage('optimize.wf.flat'),
        };
      const kept = window.choice;
      if (kept?.trialId === trial.trialId) return { ...kept, key, records };
      const at = reruns.findIndex((rerun) => rerun.window === window) * 2;
      const inSample = outputs[at];
      const outOfSample = outputs[at + 1];
      const base = {
        key,
        records,
        trialId: trial.trialId,
        parameters: { ...trial.parameters.inputs } as Record<string, LiteralValue>,
      };
      if (inSample instanceof Error || outOfSample instanceof Error)
        return {
          ...base,
          inSample: null,
          outOfSample: null,
          error: errorText(inSample instanceof Error ? inSample : outOfSample),
        };
      const diagnostic = inSample.diagnostics[0] ?? outOfSample.diagnostics[0];
      return {
        ...base,
        inSample,
        outOfSample,
        error: diagnostic
          ? diagnostic.message
          : sameMetrics(trial.metrics, inSample.metrics)
            ? null
            : workflowMessage('optimize.wf.inSampleMismatch', { window: window.plan.index + 1 }),
      };
    });
  }

  /** Figures, equity and totals of the windows that ran a set, from the analysis job `finalize`. */
  async #finalize(
    data: WalkForwardRun,
    choices: readonly (WindowChoice | null)[],
  ): Promise<WalkForwardResult | null> {
    const executions = data.windows.flatMap((window, index) => {
      const choice = choices[index];
      return choice && windowStatus({ choice, running: false }) === 'done'
        ? [windowExecution(window.plan, data.common, choice)]
        : [];
    });
    if (!executions.length) return null;
    return this.#analysis.request('finalize', {
      executions,
      config: selectionConfig(
        data.snapshot.validation.walkForward,
        this.#viewSettings,
        data.space.activeAxes,
      ),
    });
  }

  #stabilityKey(): string {
    return JSON.stringify([selectionKey(this.#viewSettings), this.#viewSettings.tolerance]);
  }

  /**
   * Stability over the windows that ran a set (W1) and the fixed parameters for every window,
   * from the analysis job `stability`.
   */
  async #stability(data: WalkForwardRun): Promise<NonNullable<WalkForwardRun['stability']>> {
    const settings = this.#viewSettings;
    const key = this.#stabilityKey();
    const traded = data.windows.filter((window) => windowStatus(window) === 'done');
    if (!traded.length) return { key, rows: [], fixed: null };
    const summaries = await this.#analysis.request('stability', {
      executions: traded.map((window) => ({
        trials: [...window.choice!.records],
        chosenParameters: { ...window.choice!.parameters },
      })),
      config: selectionConfig(
        data.snapshot.validation.walkForward,
        settings,
        data.space.activeAxes,
        settings.tolerance,
      ),
    });
    const rows = stabilityRows(
      summaries,
      data.space.activeAxes,
      traded.map((window) => window.plan.index),
    );
    return {
      key,
      rows,
      fixed: fixedParameters(
        rows,
        traded.map((window) => window.choice!.records),
        traded[0].choice!.parameters!,
        settings.direction,
        data.id,
      ),
    };
  }

  /** The window the map shows: the selected one, else the last that ran a set, else the last. */
  #mapWindow(data: WalkForwardRun): WindowRun | undefined {
    const chosen = data.windows.filter((window) => window.choice);
    const selected = this.#viewSettings.window;
    return (
      chosen.find((window) => window.plan.index === selected) ??
      chosen.findLast((window) => windowStatus(window) === 'done') ??
      chosen.at(-1)
    );
  }

  #mapKey(data: WalkForwardRun): string {
    const settings = this.#viewSettings;
    return JSON.stringify([
      selectionKey(settings),
      settings.objective,
      settings.smooth,
      this.#mapWindow(data)?.plan.index,
      settings.windowSurface,
      settings.axes,
      settings.slices,
    ]);
  }

  /** The window map from the analysis job `view` of the window's sets, or of every window's (W3). */
  async #windowMap(data: WalkForwardRun): Promise<NonNullable<WalkForwardRun['map']>> {
    const settings = this.#viewSettings;
    const key = this.#mapKey(data);
    const window = this.#mapWindow(data);
    if (!window || data.space.activeAxes.length < 2) return { key, view: null, error: null };
    const choice = window.choice!;
    const surface = settings.windowSurface;
    const analysis = await this.#analysis.request('view', {
      trials: [...choice.records],
      resultSpace: data.space,
      mode: 'walk-forward',
      resultMode: 'walk-forward',
      wfSurface: surface,
      ...(surface === 'mean'
        ? {
            meanTrialGroups: data.windows.flatMap((item) =>
              item.choice ? [[...item.choice.records]] : [],
            ),
          }
        : {}),
      objective: objectiveMetric(settings.objective),
      direction: settings.direction,
      breakEven: objectiveBreakEven(settings.objective),
      constraints: settings.filters.map(metricConstraint),
      ...(settings.objective === 'neighbourhoodMean' ? { rankBy: 'neighborhood' as const } : {}),
      ...(settings.axes ? { axes: settings.axes, preserveAxisOrientation: true } : {}),
      slices: settings.slices,
      neighborhood: settings.smooth,
      ...(choice.trialId ? { selectedTrialId: choice.trialId } : {}),
    });
    const chosen = data.windows.flatMap((item) =>
      windowStatus(item) === 'done'
        ? [{ window: item.plan.index, parameters: item.choice!.parameters! }]
        : [],
    );
    return {
      key,
      view: windowMapView(
        analysis,
        data.space.activeAxes,
        surface,
        window.plan.index,
        settings.slices,
        chosen,
      ),
      error: analysis.error ?? null,
    };
  }

  /**
   * Bring the walk-forward results' views up to date with the settings: choose the windows' sets
   * again, then stability, then the window map. One pass runs at a time; changes made meanwhile
   * are picked up by the next, and a change of selection aborts the reruns of the current one.
   */
  #requestWalkForward(): void {
    const reselection = this.#reselection;
    if (reselection && reselection.key !== selectionKey(this.#viewSettings))
      reselection.abort.abort();
    this.#wfWanted = true;
    if (!this.#wfInFlight) void this.#walkForwardLoop();
  }

  async #walkForwardLoop(): Promise<void> {
    this.#wfInFlight = true;
    while (this.#wfWanted) {
      this.#wfWanted = false;
      const data = this.#wfResults;
      // A run uses the pool; the views follow when it ends.
      if (!data || this.#live || this.#wfLive) continue;
      try {
        await this.#updateWalkForward(data);
        if (this.#wfResults === data && this.#wfError !== null) {
          this.#wfError = null;
          this.#publish();
        }
      } catch (error) {
        if (error instanceof WorkerCancelledError || this.#wfResults !== data) continue;
        this.#wfError = errorText(error);
        this.#publish();
      }
    }
    this.#wfInFlight = false;
  }

  async #updateWalkForward(data: WalkForwardRun): Promise<void> {
    const current = () => this.#wfResults === data && !this.#live && !this.#wfLive;
    const key = selectionKey(this.#viewSettings);
    const stale = data.windows.filter((window) => window.choice && window.choice.key !== key);
    if (stale.length) {
      const abort = new AbortController();
      this.#reselection = { key, abort };
      try {
        const chosen = await this.#chooseWindows(data, stale, abort.signal);
        const choices = data.windows.map((window) => {
          const at = stale.indexOf(window);
          return at < 0 ? window.choice : chosen[at];
        });
        const finalized = await this.#finalize(data, choices);
        if (!current() || abort.signal.aborted) return;
        data.windows.forEach((window, index) => (window.choice = choices[index]));
        data.finalized = finalized;
        data.version++;
        this.#publish();
      } finally {
        if (this.#reselection?.abort === abort) this.#reselection = null;
      }
    }
    if (data.stability?.key !== this.#stabilityKey()) {
      const stability = await this.#stability(data);
      if (!current()) return;
      data.stability = stability;
      data.version++;
      this.#publish();
    }
    if (data.map?.key !== this.#mapKey(data)) {
      const map = await this.#windowMap(data);
      if (!current()) return;
      data.map = map;
      data.version++;
      this.#publish();
    }
  }

  #receive(live: LiveRun, phase: FailedRange, trial: OptimizationTrial): void {
    if (this.#live !== live) return;
    live.analysis.append(phase === 'out' ? 1 : 0, [trial]);
    if (!live.failures.has(trial.trialId)) {
      const failure = failedCombination(trial, phase);
      if (failure) live.failures.set(trial.trialId, failure);
    }
    this.#scheduleSnapshot(live);
  }

  /** A walk-forward snapshot only moves the progress: windows show once they are done (W4). */
  #scheduleSnapshot(live: LiveRun | WalkForwardLive): void {
    if (this.#snapshotTimer !== null) return;
    this.#snapshotTimer = this.#timers.setTimeout(() => {
      this.#snapshotTimer = null;
      const run = this.#run;
      if (run.status !== 'running') return;
      if (live === this.#wfLive) return this.#refreshWindows(live);
      if (live !== this.#live) return;
      this.#run = { ...run, progress: this.#progress(live) };
      this.#publish();
      this.#requestView();
    }, snapshotIntervalMs);
  }

  #clearSnapshot(): void {
    if (this.#liveViewTimer !== null) {
      this.#timers.clearTimeout(this.#liveViewTimer);
      this.#liveViewTimer = null;
    }
    if (this.#snapshotTimer === null) return;
    this.#timers.clearTimeout(this.#snapshotTimer);
    this.#snapshotTimer = null;
  }

  #progress(live: LiveRun): RunProgress {
    const completed = live.analysis.count(0) + live.analysis.count(1);
    const progress = live.progress;
    let remainingMs = progress?.remainingMs ?? null;
    // While the IS range runs, the OOS range is still ahead: it costs in proportion to its bars.
    if (remainingMs !== null && progress && live.phase === 'in') {
      const [inside, outside] = live.ranges;
      remainingMs += Math.round(
        ((progress.elapsedMs + remainingMs) * outside.bars.length) / inside.bars.length,
      );
    }
    return {
      phase: live.phase,
      combinations: live.combinations,
      completed,
      total: live.combinations * live.ranges.length,
      failed: live.failures.size,
      elapsedMs: this.#now() - live.startedAt,
      remainingMs,
      workers: progress?.workers ?? 0,
      window: null,
    };
  }

  // ----- analysis requests

  /** Identifies a view request: everything in it but the trials. */
  #viewKey(): string {
    const settings = this.#viewSettings;
    return JSON.stringify([
      objectiveMetric(settings.objective),
      settings.objective === 'neighbourhoodMean',
      settings.direction,
      settings.filters,
      this.#validDraft(),
      settings.axes,
      settings.slices,
      settings.smooth,
      settings.selectedTrialId,
      settings.pageSize,
    ]);
  }

  #validDraft(): FilterCondition | null {
    const draft = this.#viewSettings.draft;
    return draft && !filterValueError(draft.value) ? draft : null;
  }

  #viewInput(space: SearchSpace, mode: ValidationResultMode): AnalysisRunView {
    const settings = this.#viewSettings;
    const draft = this.#validDraft();
    return {
      resultSpace: space,
      mode,
      resultMode: mode,
      objective: objectiveMetric(settings.objective),
      direction: settings.direction,
      breakEven: objectiveBreakEven(settings.objective),
      constraints: settings.filters.map(metricConstraint),
      ...(settings.objective === 'neighbourhoodMean' ? { rankBy: 'neighborhood' as const } : {}),
      ...(settings.axes ? { axes: settings.axes, preserveAxisOrientation: true } : {}),
      slices: settings.slices,
      neighborhood: settings.smooth,
      ...(settings.selectedTrialId === null ? {} : { selectedTrialId: settings.selectedTrialId }),
      ...(draft ? { constraintDraft: metricConstraint(draft) } : {}),
    };
  }

  /** Columns for the views' figures and filters; full maps only once results are complete. */
  #summaryRequest(fullMaps: boolean) {
    return summaryRequest(this.#viewSettings.filters, fullMaps);
  }

  /**
   * Ask for the analysis of what is shown. One request runs at a time; requests made meanwhile
   * collapse into one that runs next with the latest trials and settings.
   */
  #requestView(): void {
    this.#viewWanted = true;
    if (!this.#viewInFlight) void this.#viewLoop();
  }

  async #viewLoop(): Promise<void> {
    this.#viewInFlight = true;
    while (this.#viewWanted) {
      this.#viewWanted = false;
      await this.#computeView();
    }
    this.#viewInFlight = false;
    this.#publish();
  }

  async #computeView(): Promise<void> {
    const live = this.#live;
    const results = this.#results;
    const key = this.#viewKey();
    const draft = this.#validDraft();
    try {
      if (live) {
        const completed = live.analysis.count(0) + live.analysis.count(1);
        const current = this.#liveAnalysis;
        if (!completed || (current?.key === key && current.completed === completed))
          return this.#upToDate();
        // A slow response can leave a newer request waiting. Do not deliver that second
        // snapshot immediately after the first; explicit view-setting changes still apply now.
        if (current?.key === key && this.#liveViewTimer !== null) return;
        this.#lastAnalysisRequestAt = this.#now();
        const summary = await live.analysis.view(
          this.#viewInput(live.space, live.mode),
          this.#summaryRequest(false),
        );
        // A snapshot with the same settings is progress; one with older settings is dropped.
        if (this.#live !== live || key !== this.#viewKey()) return;
        this.#liveAnalysis = {
          summary,
          trials: live.analysis.trials,
          key,
          draft,
          completed,
          runId: live.id,
        };
        if (this.#liveViewTimer !== null) this.#timers.clearTimeout(this.#liveViewTimer);
        this.#liveViewTimer = this.#timers.setTimeout(() => {
          this.#liveViewTimer = null;
          if (this.#live === live && live.analysis.count(0) + live.analysis.count(1) > completed)
            this.#requestView();
        }, snapshotIntervalMs);
      } else if (results && results.mode !== 'walk-forward' && this.#resultsRun) {
        const run = this.#resultsRun;
        const current = this.#resultsAnalysis;
        if (current?.key === key && current.runId === results.id) return this.#upToDate();
        this.#lastAnalysisRequestAt = this.#now();
        const summary = await run.view(
          this.#viewInput(results.space, results.mode),
          this.#summaryRequest(true),
        );
        if (this.#results !== results || this.#live || key !== this.#viewKey()) return;
        this.#resultsAnalysis = {
          summary,
          trials: run.trials,
          key,
          draft,
          completed: summary.total,
          runId: results.id,
        };
      } else return;
      this.#analysisError = null;
    } catch (error) {
      if (error instanceof WorkerCancelledError) return;
      this.#analysisError = errorText(error);
    }
    this.#publish();
    this.#requestTopEquity();
  }

  /** Nothing to compute: an error from a request since replaced no longer applies. */
  #upToDate(): void {
    if (this.#analysisError !== null) {
      this.#analysisError = null;
      this.#publish();
    }
    // A ranking change undone before its reply can reuse this analysis, but needs curves again.
    this.#requestTopEquity();
  }

  #requestPlan(): void {
    this.#planWanted = true;
    if (!this.#planInFlight) void this.#planLoop();
  }

  #planRequestKey(): string {
    return JSON.stringify([
      this.#backtest.getState().dataset?.revision ?? null,
      this.#validation.walkForward,
    ]);
  }

  async #planLoop(): Promise<void> {
    this.#planInFlight = true;
    while (this.#planWanted) {
      this.#planWanted = false;
      const key = this.#planRequestKey();
      if (this.#validation.mode !== 'walk-forward' || key === this.#planKey) continue;
      this.#plan = { status: 'planning' };
      this.#publish();
      let plan: WalkForwardPlanState;
      try {
        // Without data the job still validates the settings: it plans no window.
        const bars = this.#backtest.getState().dataset?.input.bars ?? [];
        const windows = await this.#analysis.request('plan', {
          times: bars.map((bar) => bar.time),
          config: walkForwardConfig(this.#validation.walkForward),
        });
        plan = { status: 'planned', windows: windows.map(windowPlan) };
      } catch (error) {
        plan =
          error instanceof WorkerCancelledError
            ? { status: 'idle' }
            : { status: 'failed', error: errorText(error) };
      }
      // Settings that changed meanwhile asked for another plan, which follows.
      if (key !== this.#planRequestKey()) continue;
      this.#planKey = plan.status === 'idle' ? null : key;
      this.#plan = plan;
      this.#publish();
    }
    this.#planInFlight = false;
  }

  // ----- Top 20 equity

  /**
   * Rerun the leading sets of the shown results when they changed (R1). A newer request aborts
   * the older one; curves already computed for these results are reused.
   */
  #requestTopEquity(): void {
    const results = this.#results;
    const slot = this.#resultsAnalysis;
    if (this.#live || this.#wfLive || !results || !slot || slot.runId !== results.id) return;
    if (results.mode === 'walk-forward') return;
    // An analysis for older filters would pick other sets; the one on its way decides.
    if (slot.key !== this.#viewKey()) return;
    const top = leadingSets(this.#ranked(slot, results.mode, results.space), topEquityCount);
    const key = JSON.stringify([results.id, top.map((trial) => trial.trialId)]);
    if (this.#topEquity.status !== 'idle' && key === this.#topKey) return;
    this.#topRequest?.abort();
    const request = new AbortController();
    this.#topRequest = request;
    this.#topKey = key;
    this.#lastReproductionRequestAt = this.#now();
    this.#topEquity = { ...idleEquity, status: 'running', resultsId: results.id };
    this.#publish();
    void this.#reproduce(results, top, request);
  }

  async #reproduce(
    results: OptimizationResults,
    top: ReturnType<typeof leadingSets>,
    request: AbortController,
  ): Promise<void> {
    const { source, sourceRevision, dataset, properties, inSampleBars } = results.computedWith;
    const common: RunInput = { ...dataset.input, settings: propertySettings(properties) };
    const queue = top.filter((trial) => !this.#curves.has(trial.trialId));
    const run = async () => {
      while (queue.length && !request.signal.aborted) {
        const trial = queue.shift()!;
        try {
          this.#lastReproductionRequestAt = this.#now();
          const output = await this.#pool.reproduce(
            source,
            common,
            { inputs: trial.parameters },
            sourceRevision,
            request.signal,
          );
          const failure = output.diagnostics[0];
          this.#curves.set(trial.trialId, {
            equity: failure ? null : (output.equity ?? null),
            error: failure ? failure.message : null,
          });
        } catch (error) {
          if (error instanceof WorkerCancelledError || request.signal.aborted) return;
          this.#curves.set(trial.trialId, { equity: null, error: errorText(error) });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.#threads, queue.length) }, run));
    if (request.signal.aborted || this.#topRequest !== request || this.#results !== results) return;
    const curves = top.map((trial, index) => ({
      trialId: trial.trialId,
      rank: index + 1,
      ...(this.#curves.get(trial.trialId) ?? { equity: null, error: null }),
    }));
    const drawn = curves.flatMap((curve) => (curve.equity ? [curve.equity] : []));
    this.#topEquity = {
      status: 'ready',
      resultsId: results.id,
      curves,
      median: drawn.length ? medianCurve(drawn) : null,
      times: dataset.input.bars.map((bar) => bar.time),
      splitIndex: inSampleBars,
    };
    this.#publish();
  }

  // ----- derived state

  #ranked(slot: AnalysisSlot, mode: ValidationResultMode, space: SearchSpace): RankedResults {
    const settings = this.#viewSettings;
    const memo = this.#rankedMemo;
    if (
      memo?.slot === slot &&
      memo.settings.objective === settings.objective &&
      memo.settings.direction === settings.direction
    )
      return memo.value;
    const axes: AnalysisAxis[] = space.activeAxes.map((axis) => ({
      title: axis.title,
      values: axis.values,
    }));
    const value = rankResults(
      slot.summary,
      slot.trials,
      mode,
      settings.objective,
      settings.direction,
      axes,
    );
    this.#rankedMemo = { slot, settings, value };
    return value;
  }

  #searchSetup(backtest: BacktestState): SearchSetup {
    const key = [backtest.description, this.#draftsVersion, backtest.inputs, this.#sampling];
    const memo = this.#searchMemo;
    if (memo && memo.key.every((part, index) => part === key[index])) return memo.value;
    const descriptors = backtest.description?.inputs ?? [];
    const drafts = new Map<string, SearchDraft>();
    for (const descriptor of descriptors) {
      const draft = keepSearchDraft(descriptor, this.#drafts.get(descriptor.title));
      if (draft) drafts.set(descriptor.title, draft);
    }
    const value = searchSetup(descriptors, drafts, inputValues(backtest.inputs), this.#sampling);
    this.#searchMemo = { key, value };
    return value;
  }

  #dataRange(backtest: BacktestState): DataRange {
    const key = [backtest.dataset, this.#validation];
    const memo = this.#rangeMemo;
    if (memo && memo.key.every((part, index) => part === key[index])) return memo.value;
    const value = dataRange(backtest.dataset?.input.bars ?? [], this.#validation);
    this.#rangeMemo = { key, value };
    return value;
  }

  #perBarMs(backtest: BacktestState): number | null {
    if (this.#measured?.source === backtest.source) return this.#measured.perBarMs;
    const result = backtest.result;
    const bars = result?.computedWith.dataset.input.bars.length ?? 0;
    return result && bars && result.computedWith.source === backtest.source
      ? result.durationMs / bars
      : null;
  }

  #views(): ResultsViews | null {
    const live = this.#live;
    const results = this.#results;
    const slot = live ? this.#liveAnalysis : this.#resultsAnalysis;
    const space = live ? live.space : results?.space;
    const mode = live ? live.mode : results?.mode;
    if (!slot || !space || !mode || mode === 'walk-forward') return null;
    if (!live && slot.runId !== results?.id) return null;
    const settings = this.#viewSettings;
    const completed = live ? live.analysis.count(0) + live.analysis.count(1) : null;
    const key = [slot, settings, live];
    const failed = live ? live.failures.size : results!.failures.length;
    const pending =
      slot.key !== this.#viewKey() || (completed !== null && slot.completed !== completed);
    const memo = this.#viewsMemo;
    if (memo?.value && memo.key.every((part, index) => part === key[index])) {
      // More buffered trials change progress, not the last analysis' charts or ranking.
      if (memo.value.pending !== pending || memo.value.failed !== failed)
        memo.value = { ...memo.value, pending, failed };
      return memo.value;
    }
    const ranked = this.#ranked(slot, mode, space);
    const value: ResultsViews = {
      runId: slot.runId,
      searchRows: (live ? live.snapshot : results!.computedWith).search.rows,
      inProgress: !!live,
      unvalidated: mode === 'none',
      mode,
      completed: slot.summary.total,
      combinations: live ? live.combinations : results!.combinations,
      failed,
      pending,
      mapError: slot.summary.error ?? null,
      leaderboard: leaderboardView(ranked, settings.page, settings.pageSize),
      selection: selectionOf(ranked, settings.selectedTrialId, live ? live.id : results!.id),
      scatter: scatterView(ranked, settings.page, settings.pageSize),
      distribution: distributionView(ranked),
      filterDiagnosis: filterDiagnosis(ranked, settings.filters),
      draftPreview:
        settings.draft && slot.draft && sameJson(slot.draft, settings.draft)
          ? draftPreview(ranked, settings.draft, settings.page, settings.pageSize)
          : null,
      map: mapView(ranked, settings.surface, settings.slices),
      curve: curveView(ranked),
      sensitivity: sensitivityView(ranked),
      summary: slot.summary,
    };
    this.#viewsMemo = { key, value };
    return value;
  }

  /** The walk-forward run going, or the walk-forward results unless another run is going. */
  #walkForwardView(): WalkForwardView | null {
    const live = this.#wfLive;
    const data = live ? live.data : this.#live ? null : this.#wfResults;
    if (!data) return null;
    const settings = this.#viewSettings;
    const key = [data, data.version, settings, this.#wfError, !!live];
    const memo = this.#wfMemo;
    if (memo && memo.key.every((part, index) => part === key[index])) return memo.value;
    const rows = windowResults(data.windows, data.finalized);
    const selection = selectionKey(settings);
    const { stability, map } = data;
    const value: WalkForwardView = {
      searchRows: data.snapshot.search.rows,
      inProgress: !!live,
      pending: data.windows.some((window) => window.choice && window.choice.key !== selection),
      windows: rows,
      totals: walkForwardTotals(rows, data.finalized),
      equity: stitchedEquity(rows, data.times),
      times: data.times,
      fixed: live ? null : (stability?.fixed ?? null),
      stability:
        live || !stability
          ? null
          : {
              tolerance: settings.tolerance,
              pending: stability.key !== this.#stabilityKey(),
              rows: stability.rows,
            },
      map: live ? null : (map?.view ?? null),
      mapPending: !live && map?.key !== this.#mapKey(data),
      error: live ? null : (this.#wfError ?? map?.error ?? null),
      selection: windowSelection(rows, settings.window, data.id),
    };
    this.#wfMemo = { key, value };
    return value;
  }

  #derive(): OptimizationState {
    const backtest = this.#backtest.getState();
    const search = this.#searchSetup(backtest);
    const range = this.#dataRange(backtest);
    const validation = this.#validation;
    const plan: WalkForwardPlanState =
      validation.mode === 'walk-forward' ? this.#plan : { status: 'idle' };
    const windows = plan.status === 'planned' ? plan.windows : null;
    const combinations = search.sampling?.combinations ?? null;
    // Each window runs every set on its IS range; its OOS range runs one set.
    const bars =
      validation.mode === 'walk-forward'
        ? (windows?.reduce((total, window) => total + window.inSampleBars, 0) ?? 0)
        : (backtest.dataset?.input.bars.length ?? 0);
    const results = this.#results;
    let outdated: OptimizationState['outdated'] = null;
    if (results) {
      const was = results.computedWith;
      const reasons: OptimizationOutdatedReason[] = [];
      if (was.source !== backtest.source) reasons.push('source');
      if (was.search.key !== search.key) reasons.push('ranges');
      if (
        was.validation.mode !== validation.mode ||
        (validation.mode === 'in-out' &&
          was.validation.outOfSamplePercent !== validation.outOfSamplePercent) ||
        (validation.mode === 'walk-forward' &&
          !sameJson(was.validation.walkForward, validation.walkForward))
      )
        reasons.push('validation');
      if (!sameProperties(was.properties, backtest.propertyOverrides)) reasons.push('properties');
      if (was.dataset.revision !== backtest.dataset?.revision) reasons.push('data');
      outdated = { reasons };
    }
    return {
      search,
      sampling: this.#sampling,
      validation,
      unvalidated: validation.mode === 'none',
      dataRange: range,
      plan,
      viewSettings: this.#viewSettings,
      runBlock: {
        combinations,
        backtests:
          combinations === null
            ? null
            : validation.mode === 'walk-forward'
              ? windows && windows.length * combinations
              : combinations * (validation.mode === 'in-out' ? 2 : 1),
        windows: windows?.length ?? null,
        estimatedMs:
          combinations === null
            ? null
            : estimateDurationMs(this.#perBarMs(backtest), bars, combinations, this.#threads),
        threads: this.#threads,
        rerun: !!results,
      },
      readiness: this.#readiness(backtest, search, range, plan),
      run: this.#run,
      results,
      outdated,
      views: this.#views(),
      analysisError: this.#analysisError,
      topEquity: this.#topEquity,
      walkForward: this.#walkForwardView(),
    };
  }

  #readiness(
    backtest: BacktestState,
    search: SearchSetup,
    range: DataRange,
    plan: WalkForwardPlanState,
  ): Readiness {
    const reasons: Message[] = [];
    if (!backtest.source.trim()) reasons.push(workflowMessage('backtest.noScript'));
    else if (backtest.compile.status === 'compiling')
      reasons.push(workflowMessage('backtest.compiling'));
    else if (backtest.compile.status === 'failed')
      reasons.push(workflowMessage('backtest.compileFailed'));
    if (!backtest.dataset) reasons.push(workflowMessage('backtest.noData'));
    for (const reason of backtest.readiness.reasons)
      if (reason.id === 'backtest.propertyInvalid') reasons.push(reason);
    const mode = this.#validation.mode;
    const errors =
      search.errorCount +
      (mode === 'in-out' && range.error ? 1 : 0) +
      (mode === 'walk-forward' && plan.status === 'failed' ? 1 : 0);
    if (errors) reasons.push(workflowMessage('optimize.fixErrors', { count: errors }));
    // A walk-forward run takes the planned windows, so it waits for a plan of the current data.
    if (mode === 'walk-forward' && (plan.status === 'idle' || plan.status === 'planning'))
      reasons.push(workflowMessage('optimize.wf.planning'));
    else if (mode === 'walk-forward' && plan.status === 'planned' && !plan.windows.length)
      if (backtest.dataset) reasons.push(workflowMessage('optimize.wf.noWindows'));
    if (this.#run.status === 'running') reasons.push(workflowMessage('optimize.running'));
    return { ok: reasons.length === 0, reasons };
  }
}
