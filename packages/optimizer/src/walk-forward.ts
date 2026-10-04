import type { MarketBar } from '@pine/engine';
import {
  leaderboard,
  optimizeParameters,
  scoreMetric,
  type TrialEvaluator,
  type TrialRecord,
  type TrialResult,
} from './validation.ts';
import { metricValue } from './metrics.ts';
import { errorText, type Text } from '@pine/messages';
import { optimizerError, optimizerMessage } from './text.ts';
import {
  neighborhoodTrials,
  stabilityBands,
  type AnalysisAxis,
  type StabilitySummary,
} from './analysis.ts';

export type WalkForwardMode = 'rolling' | 'anchored';
export interface WalkForwardConfig {
  /** Calendar months in UTC, never a count of bars. */
  inSampleLength: number;
  outOfSampleLength: number;
  step: number;
  mode?: WalkForwardMode;
  objective?: {
    name: string;
    scope?: 'All' | 'Long' | 'Short';
    percent?: boolean;
    direction?: 'maximize' | 'minimize';
  };
  tolerance?: number;
  neighborhood?: boolean;
  axes?: readonly AnalysisAxis[];
}
/** A window's calendar bounds and the bar indices they fall on, without the bars. */
export interface WalkForwardBounds {
  index: number;
  /** Half-open calendar boundaries, in Unix seconds. */
  inSampleStart: number;
  inSampleEnd: number;
  outOfSampleStart: number;
  outOfSampleEnd: number;
  plannedOutOfSampleEnd?: number;
  partial?: boolean;
  /** Half-open bar index ranges. */
  inSampleStartIndex: number;
  inSampleEndIndex: number;
  outOfSampleStartIndex: number;
  outOfSampleEndIndex: number;
  gapBefore: boolean;
}
export interface WalkForwardPlan extends WalkForwardBounds {
  inSampleBars: readonly MarketBar[];
  outOfSampleBars: readonly MarketBar[];
}
export interface WalkForwardExecution extends WalkForwardPlan {
  trials: TrialRecord[];
  bestTrial?: TrialRecord;
  chosenParameters?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
  inSampleResult?: TrialResult;
  outOfSampleResult?: TrialResult;
  error?: Text;
}
export interface WalkForwardWindow extends WalkForwardExecution {
  /** Net-profit aliases retained for table and timeline consumers. */
  inSampleValue: number | null;
  outOfSampleValue: number | null;
  inSampleNet: number | null;
  outOfSampleNet: number | null;
  inSampleObjectiveValue: number | null;
  outOfSampleObjectiveValue: number | null;
  inSampleAnnualized: number | null;
  outOfSampleAnnualized: number | null;
  inSampleTrades: number | null;
  outOfSampleTrades: number | null;
  wfe: number | null;
  /** Real account equity translated by a cash offset, preserving per-bar differences. */
  equity: (number | null)[];
  outOfSampleEquity: readonly (number | null)[];
  /** Chosen IS equity shifted so its last value meets the OOS opening capital. */
  inSampleEquity: readonly (number | null)[];
  startCapital: number | null;
  endCapital: number | null;
}
export interface WalkForwardTotals {
  inSampleValue: number | null;
  outOfSampleValue: number | null;
  inSampleNet: number | null;
  outOfSampleNet: number | null;
  inSampleTrades: number | null;
  outOfSampleTrades: number | null;
  winningWindows: number;
  wfe: number | null;
  metrics: Record<string, number | string | null>;
  equity: (number | null)[];
  equityTimes: (number | null)[];
}
export interface WalkForwardResult {
  windows: WalkForwardWindow[];
  totals: WalkForwardTotals;
  cancelled: boolean;
  durationMs: number;
  stability: StabilitySummary[];
}
export interface WalkForwardSignal {
  cancelled?: () => boolean;
  onProgress?: (completed: number, total: number) => void;
}
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const objective = (config: WalkForwardConfig): NonNullable<WalkForwardConfig['objective']> =>
  config.objective ?? { name: 'Net profit', direction: 'maximize' };

function validate(config: WalkForwardConfig): void {
  for (const [name, value] of [
    [optimizerMessage('inSampleMonthCount'), config.inSampleLength],
    [optimizerMessage('outSampleMonthCount'), config.outOfSampleLength],
    [optimizerMessage('stepMonthCount'), config.step],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 1 || value > 1200)
      throw optimizerError('monthCountRange', { name });
  }
  if (config.step < config.outOfSampleLength) throw optimizerError('stepOverlappingWindows');
  if (config.mode !== undefined && config.mode !== 'rolling' && config.mode !== 'anchored')
    throw optimizerError('windowModeInvalid');
  if (
    config.tolerance !== undefined &&
    (!finite(config.tolerance) || config.tolerance < 0 || config.tolerance > 1)
  )
    throw optimizerError('stabilityToleranceRange');
}

const monthStart = (time: number): number => {
  const date = new Date(time * 1000);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000;
};
const addMonths = (time: number, months: number): number => {
  const date = new Date(time * 1000);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1) / 1000;
};
function lowerBound(times: readonly number[], time: number): number {
  let from = 0,
    to = times.length;
  while (from < to) {
    const middle = Math.floor((from + to) / 2);
    if (times[middle] < time) from = middle + 1;
    else to = middle;
  }
  return from;
}

/**
 * The windows over bars that open at `times` (ascending, Unix seconds), as calendar bounds and
 * indices into `times`: a caller that holds the bars need not send or receive them. The first
 * observed UTC month starts the plan; a final observed OOS segment is retained.
 */
export function planWalkForwardBounds(
  times: readonly number[],
  config: WalkForwardConfig,
): WalkForwardBounds[] {
  validate(config);
  if (!times.length) return [];
  times.forEach((time, index) => {
    if (
      !finite(time) ||
      !Number.isFinite(new Date(time * 1000).valueOf()) ||
      (index && time <= times[index - 1])
    )
      throw optimizerError('walkForwardTimesInvalid');
  });
  const durations = times
    .slice(1)
    .map((time, index) => time - times[index])
    .sort((a, b) => a - b);
  const interval = durations.length ? durations[Math.floor(durations.length / 2)] : 0;
  const coverageEnd = times.at(-1)! + interval;
  const beginning = monthStart(times[0]);
  const windows: WalkForwardBounds[] = [];
  for (let offset = 0; ; offset += config.step) {
    const inSampleStart = config.mode === 'anchored' ? beginning : addMonths(beginning, offset);
    const inSampleEnd = addMonths(beginning, offset + config.inSampleLength);
    const outOfSampleStart = inSampleEnd;
    const plannedOutOfSampleEnd = addMonths(outOfSampleStart, config.outOfSampleLength);
    if (outOfSampleStart > times.at(-1)!) break;
    const outOfSampleEnd = Math.min(plannedOutOfSampleEnd, coverageEnd);
    const inSampleStartIndex = lowerBound(times, inSampleStart),
      inSampleEndIndex = lowerBound(times, inSampleEnd);
    const outOfSampleStartIndex = inSampleEndIndex,
      outOfSampleEndIndex = lowerBound(times, outOfSampleEnd);
    if (inSampleEndIndex === inSampleStartIndex || outOfSampleEndIndex === outOfSampleStartIndex)
      throw optimizerError('windowMissingBars', { window: windows.length + 1 });
    windows.push({
      index: windows.length,
      inSampleStart,
      inSampleEnd,
      outOfSampleStart,
      outOfSampleEnd,
      plannedOutOfSampleEnd,
      partial: outOfSampleEnd < plannedOutOfSampleEnd,
      inSampleStartIndex,
      inSampleEndIndex,
      outOfSampleStartIndex,
      outOfSampleEndIndex,
      gapBefore: windows.length > 0 && outOfSampleStart > windows.at(-1)!.outOfSampleEnd,
    });
  }
  return windows;
}

/** `planWalkForwardBounds` over `bars`, with each window's IS and OOS bars. */
export function planWalkForwardWindows(
  bars: readonly MarketBar[],
  config: WalkForwardConfig,
): WalkForwardPlan[] {
  return planWalkForwardBounds(
    bars.map((bar) => bar.time),
    config,
  ).map((window) => ({
    ...window,
    inSampleBars: bars.slice(window.inSampleStartIndex, window.inSampleEndIndex),
    outOfSampleBars: bars.slice(window.outOfSampleStartIndex, window.outOfSampleEndIndex),
  }));
}

/** Neighbourhood selection retunes each window using its observed trial surface. */
export function selectWalkForwardTrial(
  trials: readonly TrialRecord[],
  config: WalkForwardConfig,
): TrialRecord | undefined {
  const accepted = trials.filter(
    (trial) =>
      trial.valid &&
      !trial.excluded &&
      ![trial.result, trial.inSample, trial.outOfSample].some(
        (result) => !!result?.diagnostics.length,
      ) &&
      !trial.inSampleDiagnostics?.length &&
      !trial.outOfSampleDiagnostics?.length,
  );
  const ranked = config.neighborhood ? neighborhoodTrials(accepted, config.axes) : accepted;
  return leaderboard(ranked, { direction: objective(config).direction, limit: 1 })[0];
}

const cleanResult = (result: TrialResult | undefined): TrialResult | undefined =>
  result && !result.diagnostics.length ? result : undefined;
const readMetric = (
  result: TrialResult | undefined,
  name: string,
  percent = false,
): number | null => (result ? metricValue(result.metrics, name, 'All', percent) : null);
function readObjective(result: TrialResult | undefined, config: WalkForwardConfig): number | null {
  if (!result) return null;
  const selected = objective(config);
  return selected.scope !== undefined || selected.percent !== undefined
    ? metricValue(result.metrics, selected.name, selected.scope ?? 'All', selected.percent ?? false)
    : scoreMetric(result.metrics, selected.name);
}
const sum = (values: readonly (number | null)[]): number | null =>
  !values.length || values.some((value) => value === null)
    ? null
    : (values as number[]).reduce((total, value) => total + value, 0);
function extractEquity(result: TrialResult | undefined, expected: number): number[] {
  return result?.equity?.length === expected && result.equity.every(finite)
    ? [...result.equity]
    : [];
}

/** Losses on IS have no meaningful efficiency; a ratio must also remain finite. */
function efficiency(inside: number | null, outside: number | null): number | null {
  if (inside === null || inside <= 0 || outside === null) return null;
  const ratio = outside / inside;
  return finite(ratio) ? ratio : null;
}

/**
 * Stitch account changes by cash offset, as the OOS curve does, then annualize once. IS runs
 * concatenate their observed durations (including repeated training periods); OOS uses the
 * elapsed span of its chronological curve, including idle gaps. Open profit is part of equity.
 */
function stitchedAnnualized(
  executions: readonly WalkForwardExecution[],
  side: 'inSample' | 'outOfSample',
): number | null {
  if (!executions.length) return null;
  let initial: number | null = null;
  let capital = 0;
  let seconds = 0;
  for (const execution of executions) {
    const result = cleanResult(execution[`${side}Result`]);
    const bars = execution[`${side}Bars`];
    const values = extractEquity(result, bars.length);
    const base = readMetric(result, 'Initial capital');
    if (!values.length || base === null || base <= 0) return null;
    if (initial === null) initial = capital = base;
    capital = values.at(-1)! - base + capital;
    seconds += bars.at(-1)!.time - bars[0].time;
  }
  if (side === 'outOfSample')
    seconds =
      executions.at(-1)!.outOfSampleBars.at(-1)!.time - executions[0].outOfSampleBars[0].time;
  if (initial === null || capital <= 0 || seconds <= 0) return null;
  const annualized = ((capital / initial) ** ((365 * 86400) / seconds) - 1) * 100;
  return finite(annualized) ? annualized : null;
}

function additiveMetrics(windows: readonly WalkForwardWindow[]): TrialResult['metrics'] {
  const metrics: TrialResult['metrics'] = {};
  const keys = new Set(
    windows.flatMap((window) => Object.keys(window.outOfSampleResult?.metrics ?? {})),
  );
  for (const key of keys) {
    const name = key.slice(key.indexOf('/') + 1, key.lastIndexOf('/'));
    const additive = !key.endsWith(' %') && ['Net profit', 'Total trades'].includes(name);
    metrics[key] = additive
      ? sum(
          windows.map((window) => {
            const result = cleanResult(window.outOfSampleResult);
            const value = result?.metrics[key];
            return finite(value) ? value : null;
          }),
        )
      : null;
  }
  return metrics;
}

/** Accept actual results from async worker orchestration without executing the engine. */
export function finalizeWalkForward(
  executions: readonly WalkForwardExecution[],
  config: WalkForwardConfig,
  options: { started?: number; cancelled?: boolean } = {},
): WalkForwardResult {
  validate(config);
  const chosenObjective = objective(config);
  let runningCapital: number | null = null;
  let incompleteEquity = false;
  const equity: (number | null)[] = [],
    equityTimes: (number | null)[] = [];
  const windows: WalkForwardWindow[] = executions.map((execution, index) => {
    if (index && execution.outOfSampleStart < executions[index - 1].outOfSampleEnd)
      throw optimizerError('outSampleWindowsOverlap');
    const inResult = cleanResult(execution.inSampleResult),
      outResult = cleanResult(execution.outOfSampleResult);
    const rawIn = extractEquity(inResult, execution.inSampleBars.length),
      rawOut = extractEquity(outResult, execution.outOfSampleBars.length);
    const inNet = readMetric(inResult, 'Net profit'),
      outNet = readMetric(outResult, 'Net profit');
    const inAnnualized = readMetric(inResult, 'Annualized return (CAGR)', true),
      outAnnualized = readMetric(outResult, 'Annualized return (CAGR)', true);
    const initialCapital = readMetric(outResult, 'Initial capital');
    const startCapital = incompleteEquity ? null : (runningCapital ?? initialCapital);
    const shiftedOut =
      startCapital !== null && initialCapital !== null
        ? rawOut.map((value) => value - initialCapital + startCapital)
        : [];
    const shiftedIn =
      startCapital !== null && rawIn.length
        ? rawIn.map((value) => value - rawIn.at(-1)! + startCapital)
        : [];
    const endCapital = shiftedOut.at(-1) ?? null;
    runningCapital = endCapital;
    incompleteEquity ||= endCapital === null;
    const gapBefore =
      execution.gapBefore ||
      (index > 0 && execution.outOfSampleStart > executions[index - 1].outOfSampleEnd);
    if (equity.length && (gapBefore || !shiftedOut.length)) {
      equity.push(null);
      equityTimes.push(null);
    }
    // Long OOS windows can exceed the argument-count limit of Array.push(...values).
    for (let observation = 0; observation < shiftedOut.length; observation++) {
      equity.push(shiftedOut[observation]);
      equityTimes.push(execution.outOfSampleBars[observation].time);
    }
    const error =
      execution.error ??
      [execution.inSampleResult, execution.outOfSampleResult]
        .flatMap((result) => result?.diagnostics ?? [])
        .map((diagnostic) => `L${diagnostic.line} · ${diagnostic.kind}: ${diagnostic.message}`)
        .join('\n');
    return {
      ...execution,
      gapBefore,
      chosenParameters: execution.chosenParameters ?? execution.bestTrial?.parameters,
      parameters:
        execution.chosenParameters ?? execution.bestTrial?.parameters ?? execution.parameters,
      inSampleValue: inNet,
      outOfSampleValue: outNet,
      inSampleNet: inNet,
      outOfSampleNet: outNet,
      inSampleObjectiveValue: readObjective(inResult, config),
      outOfSampleObjectiveValue: readObjective(outResult, config),
      inSampleAnnualized: inAnnualized,
      outOfSampleAnnualized: outAnnualized,
      inSampleTrades: readMetric(inResult, 'Total trades'),
      outOfSampleTrades: readMetric(outResult, 'Total trades'),
      wfe: efficiency(inAnnualized, outAnnualized),
      equity: shiftedOut,
      outOfSampleEquity: shiftedOut,
      inSampleEquity: shiftedIn,
      startCapital,
      endCapital,
      ...(error ? { error } : {}),
    };
  });
  const inNet = sum(windows.map((window) => window.inSampleNet)),
    outNet = sum(windows.map((window) => window.outOfSampleNet));
  const inAnnualized = stitchedAnnualized(executions, 'inSample'),
    outAnnualized = stitchedAnnualized(executions, 'outOfSample');
  const parameters = config.axes?.map((axis) => axis.title) ?? [
    ...new Set(
      windows.flatMap((window) => window.trials.flatMap((trial) => Object.keys(trial.parameters))),
    ),
  ];
  const stability = stabilityBands(
    windows,
    parameters,
    config.tolerance ?? 0.1,
    chosenObjective.direction ?? 'maximize',
    { axes: config.axes, neighborhood: config.neighborhood },
  );
  return {
    windows,
    totals: {
      inSampleValue: inNet,
      outOfSampleValue: outNet,
      inSampleNet: inNet,
      outOfSampleNet: outNet,
      inSampleTrades: sum(windows.map((window) => window.inSampleTrades)),
      outOfSampleTrades: sum(windows.map((window) => window.outOfSampleTrades)),
      winningWindows: windows.filter(
        (window) => window.outOfSampleNet !== null && window.outOfSampleNet > 0,
      ).length,
      wfe: efficiency(inAnnualized, outAnnualized),
      metrics: additiveMetrics(windows),
      equity,
      equityTimes,
    },
    cancelled: options.cancelled ?? false,
    durationMs: Math.max(0, Date.now() - (options.started ?? Date.now())),
    stability,
  };
}

/** Synchronous helper for Node tests; browser orchestration calls the plan and finalizer around workers. */
export function runWalkForward(
  parameterSets: readonly Record<string, unknown>[],
  bars: readonly MarketBar[],
  evaluate: TrialEvaluator,
  config: WalkForwardConfig,
  signal?: WalkForwardSignal,
): WalkForwardResult {
  const started = Date.now();
  const plans = planWalkForwardWindows(bars, config);
  const windows: WalkForwardExecution[] = [];
  for (const plan of plans) {
    if (signal?.cancelled?.())
      return finalizeWalkForward(windows, config, { started, cancelled: true });
    const summary = optimizeParameters(
      parameterSets,
      plan.inSampleBars,
      evaluate,
      { validation: { mode: 'none' }, objective: objective(config) },
      {
        cancelled: signal?.cancelled,
        onProgress: (done) =>
          signal?.onProgress?.(
            plan.index + done / Math.max(1, parameterSets.length + 1),
            plans.length,
          ),
      },
    );
    if (summary.cancelled || signal?.cancelled?.())
      return finalizeWalkForward(windows, config, { started, cancelled: true });
    const bestTrial = selectWalkForwardTrial(summary.trials, config);
    let outOfSampleResult: TrialResult | undefined, error: Text | undefined;
    if (bestTrial) {
      try {
        outOfSampleResult = evaluate(bestTrial.parameters, plan.outOfSampleBars, 'out');
      } catch (reason) {
        error = errorText(reason);
      }
    } else error = optimizerMessage('noValidWindowTrial');
    windows.push({
      ...plan,
      trials: summary.trials,
      bestTrial,
      chosenParameters: bestTrial?.parameters,
      inSampleResult: bestTrial?.result,
      outOfSampleResult,
      error,
    });
    signal?.onProgress?.(plan.index + 1, plans.length);
  }
  return finalizeWalkForward(windows, config, { started });
}
