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
export interface WalkForwardPlan {
  index: number;
  /** Half-open calendar boundaries, in Unix seconds. */
  inSampleStart: number;
  inSampleEnd: number;
  outOfSampleStart: number;
  outOfSampleEnd: number;
  plannedOutOfSampleEnd?: number;
  partial?: boolean;
  inSampleStartIndex: number;
  inSampleEndIndex: number;
  outOfSampleStartIndex: number;
  outOfSampleEndIndex: number;
  inSampleBars: readonly MarketBar[];
  outOfSampleBars: readonly MarketBar[];
  gapBefore: boolean;
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
function lowerBound(bars: readonly MarketBar[], time: number): number {
  let from = 0,
    to = bars.length;
  while (from < to) {
    const middle = Math.floor((from + to) / 2);
    if (bars[middle].time < time) from = middle + 1;
    else to = middle;
  }
  return from;
}

/** The first observed UTC month starts the plan; a final observed OOS segment is retained. */
export function planWalkForwardWindows(
  bars: readonly MarketBar[],
  config: WalkForwardConfig,
): WalkForwardPlan[] {
  validate(config);
  if (!bars.length) return [];
  bars.forEach((bar, index) => {
    if (
      !finite(bar.time) ||
      !Number.isFinite(new Date(bar.time * 1000).valueOf()) ||
      (index && bar.time <= bars[index - 1].time)
    )
      throw optimizerError('walkForwardTimesInvalid');
  });
  const durations = bars
    .slice(1)
    .map((bar, index) => bar.time - bars[index].time)
    .sort((a, b) => a - b);
  const interval = durations.length ? durations[Math.floor(durations.length / 2)] : 0;
  const coverageEnd = bars.at(-1)!.time + interval;
  const beginning = monthStart(bars[0].time);
  const windows: WalkForwardPlan[] = [];
  for (let offset = 0; ; offset += config.step) {
    const inSampleStart = config.mode === 'anchored' ? beginning : addMonths(beginning, offset);
    const inSampleEnd = addMonths(beginning, offset + config.inSampleLength);
    const outOfSampleStart = inSampleEnd;
    const plannedOutOfSampleEnd = addMonths(outOfSampleStart, config.outOfSampleLength);
    if (outOfSampleStart > bars.at(-1)!.time) break;
    const outOfSampleEnd = Math.min(plannedOutOfSampleEnd, coverageEnd);
    const inSampleStartIndex = lowerBound(bars, inSampleStart),
      inSampleEndIndex = lowerBound(bars, inSampleEnd);
    const outOfSampleStartIndex = inSampleEndIndex,
      outOfSampleEndIndex = lowerBound(bars, outOfSampleEnd);
    const inSampleBars = bars.slice(inSampleStartIndex, inSampleEndIndex),
      outOfSampleBars = bars.slice(outOfSampleStartIndex, outOfSampleEndIndex);
    if (!inSampleBars.length || !outOfSampleBars.length)
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
      inSampleBars,
      outOfSampleBars,
      gapBefore: windows.length > 0 && outOfSampleStart > windows.at(-1)!.outOfSampleEnd,
    });
  }
  return windows;
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
      wfe:
        inAnnualized !== null && inAnnualized !== 0 && outAnnualized !== null
          ? outAnnualized / inAnnualized
          : null,
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
  const inAnnualized = sum(windows.map((window) => window.inSampleAnnualized)),
    outAnnualized = sum(windows.map((window) => window.outOfSampleAnnualized));
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
      wfe:
        inAnnualized !== null && inAnnualized !== 0 && outAnnualized !== null
          ? outAnnualized / inAnnualized
          : null,
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
