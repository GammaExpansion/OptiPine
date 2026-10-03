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
  type WalkForwardBounds,
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
import { workflowMessage } from './messages.ts';
import {
  filterValueError,
  metricConstraint,
  naturalDirection,
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
  leaderboardPageSize,
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
  /** Bars in the IS range for IS / OOS, where the OOS range starts; null for None. */
  readonly inSampleBars: number | null;
}

export interface OptimizationResults {
  /** Identifies the run, as a parameter set's origin names it. */
  readonly id: number;
  readonly computedWith: OptimizationSnapshot;
  readonly space: SearchSpace;
  readonly mode: ValidationResultMode;
  readonly combinations: number;
  /** Failed sets, not ranked (R11). */
  readonly failures: readonly FailedCombination[];
  readonly durationMs: number;
  readonly finishedAt: number;
  readonly workers: number;
}

export type OptimizationOutdatedReason = 'source' | 'ranges' | 'validation' | 'properties' | 'data';

export interface WindowPlan {
  readonly index: number;
  /** Half-open month boundaries in Unix seconds, as @pine/optimizer plans them. */
  readonly inSampleStart: number;
  readonly inSampleEnd: number;
  readonly outOfSampleStart: number;
  readonly outOfSampleEnd: number;
  readonly inSampleBars: number;
  readonly outOfSampleBars: number;
  /** The final window's OOS range ends early with the data. */
  readonly partial: boolean;
  readonly gapBefore: boolean;
}

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

function windowPlan(plan: WalkForwardBounds): WindowPlan {
  return {
    index: plan.index,
    inSampleStart: plan.inSampleStart,
    inSampleEnd: plan.inSampleEnd,
    outOfSampleStart: plan.outOfSampleStart,
    outOfSampleEnd: plan.outOfSampleEnd,
    inSampleBars: plan.inSampleEndIndex - plan.inSampleStartIndex,
    outOfSampleBars: plan.outOfSampleEndIndex - plan.outOfSampleStartIndex,
    partial: !!plan.partial,
    gapBefore: plan.gapBefore,
  };
}

/**
 * The Optimize page without walk-forward runs: search ranges, validation, ranking and filters
 * over the Backtest page's script, data and properties; the run on the Worker pool; and the views
 * of its results (WEB.md 2.4, 2.5, 3.1, 3.2). Trials stream into a buffer outside any state;
 * subscribers see a snapshot at most every 250 ms, and every derived view is computed by the
 * analysis Worker, a newer request replacing one that waits.
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

  /** Search-range drafts by input title, with the declaration they were made for. */
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
    smooth: false,
    surface: 'in',
    selectedTrialId: null,
    page: 0,
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
  readonly #curves = new Map<string, { equity: readonly number[] | null; error: Text | null }>();

  #searchMemo: { key: readonly unknown[]; value: SearchSetup } | null = null;
  #rangeMemo: { key: readonly unknown[]; value: DataRange } | null = null;
  #viewsMemo: { key: readonly unknown[]; value: ResultsViews | null } | null = null;
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
    this.#store = createStore(this.#derive());
    this.#unsubscribe = backtest.subscribe(() => {
      if (this.#validation.mode === 'walk-forward') this.#requestPlan();
      this.#publish();
    });
  }

  getState(): OptimizationState {
    return this.#store.getState();
  }

  subscribe(listener: (state: OptimizationState) => void): () => void {
    return this.#store.subscribe(listener);
  }

  /** Stop listening to the Backtest page, stop any run and release the analysis Worker's runs. */
  dispose(): void {
    this.#unsubscribe();
    this.cancel();
    this.#topRequest?.abort();
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
    this.#viewSettings = { ...this.#viewSettings, ...change };
    this.#publish();
    this.#requestView();
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
    const shown = this.getState().views?.summary.axes ?? {};
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

  /** Select a set (3.3): reveal its leaderboard page and move the map; null returns to #1. */
  select(trialId: string | null): void {
    this.#viewSettings = { ...this.#viewSettings, selectedTrialId: trialId };
    const selection = this.#views()?.selection;
    this.#setView(
      selection?.explicit
        ? { page: Math.floor((selection.row.rank - 1) / leaderboardPageSize) }
        : {},
    );
  }

  setPage(page: number): void {
    this.#setView({ page: Math.max(0, Math.floor(page)) });
  }

  // ----- the run

  /** Start the optimization with the current settings; does nothing unless `readiness.ok`. */
  async start(): Promise<void> {
    const state = this.getState();
    const backtest = this.#backtest.getState();
    const { space, sampling } = state.search;
    if (!state.readiness.ok || !space || !sampling || !backtest.dataset) return;
    const bars = backtest.dataset.input.bars;
    const mode: ValidationResultMode = state.validation.mode === 'none' ? 'none' : 'in-out';
    const split =
      mode === 'none' ? null : splitBars(bars, { mode, splitRatio: splitRatio(state.validation) });
    const snapshot: OptimizationSnapshot = {
      source: backtest.source,
      sourceRevision: backtest.sourceRevision,
      dataset: backtest.dataset,
      properties: backtest.propertyOverrides,
      validation: state.validation,
      search: state.search,
      inSampleBars: split ? split.inSample.length : null,
    };
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
    // The pool's run terminates reproductions; an unfinished Top 20 starts over afterwards.
    this.#topRequest?.abort();
    if (this.#topEquity.status === 'running') this.#topEquity = idleEquity;
    this.#viewSettings = { ...this.#viewSettings, selectedTrialId: null, page: 0 };
    this.#run = { status: 'running', startedAt, progress: this.#progress(live) };
    this.#publish();
    let summary: OptimizerSummary;
    let key: string;
    let draft: FilterCondition | null;
    const elapsed = { workerMs: 0, workers: 0 };
    try {
      const parameters = await this.#analysis.request('parameters', {
        space,
        method: sampling.method,
        count: sampling.count,
        seed: sampling.seed,
        limit: gridLimit,
      });
      if (this.#live !== live) return;
      live.combinations = parameters.length;
      const sets: ParameterSet[] = parameters.map((inputs) => ({ inputs }));
      const common: RunInput = {
        ...snapshot.dataset.input,
        settings: propertySettings(snapshot.properties),
      };
      for (const range of live.ranges) {
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
      summary = await live.analysis.view(this.#viewInput(space, mode), this.#summaryRequest(true));
      if (this.#live !== live) return;
      if (sets.length && bars.length)
        this.#measured = {
          source: snapshot.source,
          perBarMs: elapsed.workerMs / (sets.length * bars.length),
        };
    } catch (error) {
      if (this.#live !== live) return;
      this.#endLive();
      live.analysis.close();
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
      return;
    }
    const finishedAt = this.#now();
    this.#endLive();
    this.#results = {
      id: live.id,
      computedWith: snapshot,
      space,
      mode,
      combinations: live.combinations,
      failures: [...live.failures.values()],
      durationMs: finishedAt - startedAt,
      finishedAt,
      workers: elapsed.workers,
    };
    this.#resultsRun?.close();
    this.#resultsRun = live.analysis;
    this.#resultsAnalysis = {
      summary,
      trials: live.analysis.trials,
      key,
      draft,
      completed: summary.total,
      runId: live.id,
    };
    this.#curves.clear();
    this.#topEquity = idleEquity;
    this.#run = { status: 'done', startedAt, finishedAt };
    this.#afterLive();
  }

  /** Stop every Worker at once; the previous results stay (WEB.md 3.1). */
  cancel(): void {
    const run = this.#run;
    const live = this.#live;
    if (!live || run.status !== 'running') return;
    this.#endLive();
    live.analysis.close();
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

  #scheduleSnapshot(live: LiveRun): void {
    if (this.#snapshotTimer !== null) return;
    this.#snapshotTimer = this.#timers.setTimeout(() => {
      this.#snapshotTimer = null;
      const run = this.#run;
      if (this.#live !== live || run.status !== 'running') return;
      this.#run = { ...run, progress: this.#progress(live) };
      this.#publish();
      this.#requestView();
    }, snapshotIntervalMs);
  }

  #clearSnapshot(): void {
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
      } else if (results && this.#resultsRun) {
        const run = this.#resultsRun;
        const current = this.#resultsAnalysis;
        if (current?.key === key && current.runId === results.id) return this.#upToDate();
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
    if (this.#analysisError === null) return;
    this.#analysisError = null;
    this.#publish();
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
    if (this.#live || !results || !slot || slot.runId !== results.id) return;
    // An analysis for older filters would pick other sets; the one on its way decides.
    if (slot.key !== this.#viewKey()) return;
    const top = leadingSets(this.#ranked(slot, results.mode, results.space), topEquityCount);
    const key = JSON.stringify([results.id, top.map((trial) => trial.trialId)]);
    if (this.#topEquity.status !== 'idle' && key === this.#topKey) return;
    this.#topRequest?.abort();
    const request = new AbortController();
    this.#topRequest = request;
    this.#topKey = key;
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
    const drafts = new Map(
      descriptors.map((descriptor) => [
        descriptor.title,
        keepSearchDraft(descriptor, this.#drafts.get(descriptor.title)),
      ]),
    );
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
    if (!slot || !space || !mode || (!live && slot.runId !== results?.id)) return null;
    const settings = this.#viewSettings;
    const completed = live ? live.analysis.count(0) + live.analysis.count(1) : null;
    const key = [slot, settings, completed];
    const memo = this.#viewsMemo;
    if (memo && memo.key.every((part, index) => part === key[index])) return memo.value;
    const ranked = this.#ranked(slot, mode, space);
    const value: ResultsViews = {
      inProgress: !!live,
      unvalidated: mode === 'none',
      mode,
      completed: slot.summary.total,
      combinations: live ? live.combinations : results!.combinations,
      failed: live ? live.failures.size : results!.failures.length,
      pending: slot.key !== this.#viewKey() || (completed !== null && slot.completed !== completed),
      mapError: slot.summary.error ?? null,
      leaderboard: leaderboardView(ranked, settings.page),
      selection: selectionOf(ranked, settings.selectedTrialId, live ? live.id : results!.id),
      scatter: scatterView(ranked, settings.page),
      distribution: distributionView(ranked),
      filterDiagnosis: filterDiagnosis(ranked, settings.filters),
      draftPreview:
        settings.draft && slot.draft && sameJson(slot.draft, settings.draft)
          ? draftPreview(ranked, settings.draft, settings.page)
          : null,
      map: mapView(ranked, settings.surface, settings.slices),
      curve: curveView(ranked),
      sensitivity: sensitivityView(ranked),
      summary: slot.summary,
    };
    this.#viewsMemo = { key, value };
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
    const bars =
      validation.mode === 'walk-forward'
        ? (windows?.reduce(
            (total, window) => total + window.inSampleBars + window.outOfSampleBars,
            0,
          ) ?? 0)
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
          was.validation.outOfSamplePercent !== validation.outOfSamplePercent)
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
    if (mode === 'walk-forward') reasons.push(workflowMessage('optimize.walkForwardUnavailable'));
    if (this.#run.status === 'running') reasons.push(workflowMessage('optimize.running'));
    return { ok: reasons.length === 0, reasons };
  }
}
