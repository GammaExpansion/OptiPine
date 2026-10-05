import type { MarketBar, RunResult } from '@pine/engine';
import { metricValue } from './metrics.ts';
import { rangeProfit } from './range-profit.ts';
import { errorText, type Text } from '@pine/messages';
import { optimizerError } from './text.ts';
import { stableTrialId } from './search-space.ts';
import {
  consecutiveLossesMetric,
  tradeStatistics,
  type TradeStatistics,
} from './trade-statistics.ts';

/** An engine result, optionally with the per-bar account equity from `runWithEquity`. */
export type TrialResult = RunResult & { equity?: number[] };

export type ValidationMode = 'none' | 'in-out';
export interface ValidationConfig {
  mode: ValidationMode;
  splitRatio?: number;
}
export interface BarSplit {
  all: readonly MarketBar[];
  inSample: readonly MarketBar[];
  outOfSample: readonly MarketBar[];
}
export function splitBars(bars: readonly MarketBar[], config: ValidationConfig): BarSplit {
  if (config.mode === 'none') return { all: bars, inSample: bars, outOfSample: [] };
  const ratio = config.splitRatio ?? 0.7;
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio >= 1)
    throw optimizerError('splitRatioRange', {}, RangeError);
  const at = Math.floor(bars.length * ratio);
  if (at < 1 || at >= bars.length) throw optimizerError('splitNeedsBars', {}, RangeError);
  return { all: bars, inSample: bars.slice(0, at), outOfSample: bars.slice(at) };
}

export interface TrialRecord {
  trialId: string;
  parameters: Record<string, unknown>;
  result?: TrialResult;
  inSample?: TrialResult;
  outOfSample?: TrialResult;
  objectiveValue: number | null;
  inSampleValue: number | null;
  outOfSampleValue: number | null;
  valid: boolean;
  excluded: boolean;
  error?: Text;
  inSampleDiagnostics?: RunResult['diagnostics'];
  outOfSampleDiagnostics?: RunResult['diagnostics'];
  inSampleWarnings?: RunResult['warnings'];
  outOfSampleWarnings?: RunResult['warnings'];
  inSampleMetrics?: RunResult['metrics'];
  outOfSampleMetrics?: RunResult['metrics'];
  tradeCount?: number;
  inSampleStatistics?: TradeStatistics;
}
export interface OptimizationConfig {
  validation: ValidationConfig;
  objective: {
    name: string;
    scope?: 'All' | 'Long' | 'Short';
    percent?: boolean;
    direction?: 'maximize' | 'minimize';
  };
  constraints?: readonly ((trial: TrialRecord) => boolean)[];
}
export interface OptimizationSummary {
  trials: TrialRecord[];
  excludedCount: number;
  durationMs: number;
  cancelled: boolean;
}
export type TrialEvaluator = (
  parameters: Record<string, unknown>,
  bars: readonly MarketBar[],
  partition: 'all' | 'in' | 'out',
) => TrialResult;

/** Evaluate parameter groups with none or in/out validation. Designed for worker invocation. */
export function optimizeParameters(
  parameterSets: readonly Record<string, unknown>[],
  bars: readonly MarketBar[],
  evaluate: TrialEvaluator,
  config: OptimizationConfig,
  signal?: { cancelled?: () => boolean; onProgress?: (completed: number, total: number) => void },
): OptimizationSummary {
  const started = Date.now();
  const trials: TrialRecord[] = [];
  let excludedCount = 0;
  const total = parameterSets.length;
  const value = (r?: TrialResult) =>
    r
      ? scoreMetric(
          r.metrics,
          config.objective.name,
          config.objective.scope,
          config.objective.percent,
        )
      : null;
  for (let i = 0; i < parameterSets.length; i++) {
    if (signal?.cancelled?.())
      return { trials, excludedCount, durationMs: Date.now() - started, cancelled: true };
    const parameters = { ...parameterSets[i] };
    const trialId = stableTrialId(parameters);
    const trial: TrialRecord = {
      trialId,
      parameters,
      objectiveValue: null,
      inSampleValue: null,
      outOfSampleValue: null,
      valid: true,
      excluded: false,
    };
    try {
      if (config.validation.mode === 'none') {
        trial.result = evaluate(parameters, bars, 'all');
        trial.inSampleValue = value(trial.result);
        trial.objectiveValue = trial.inSampleValue;
      } else {
        const split = splitBars(bars, config.validation);
        trial.inSample = evaluate(parameters, split.inSample, 'in');
        trial.outOfSample = evaluate(parameters, split.outOfSample, 'out');
        trial.inSampleValue = value(trial.inSample);
        trial.outOfSampleValue = value(trial.outOfSample);
        trial.objectiveValue = trial.inSampleValue;
      }
      trial.inSampleMetrics = (trial.result ?? trial.inSample)?.metrics;
      const inside = trial.result ?? trial.inSample;
      if (inside) trial.inSampleStatistics = tradeStatistics(inside);
      trial.outOfSampleMetrics = trial.outOfSample?.metrics;
      trial.inSampleDiagnostics = (trial.result ?? trial.inSample)?.diagnostics;
      trial.outOfSampleDiagnostics = trial.outOfSample?.diagnostics;
      trial.inSampleWarnings = inside?.warnings;
      trial.outOfSampleWarnings = trial.outOfSample?.warnings;
      if (trial.inSampleDiagnostics?.length || trial.outOfSampleDiagnostics?.length)
        trial.valid = false;
      if (config.constraints?.some((constraint) => !constraint(trial))) {
        trial.valid = false;
        trial.excluded = true;
        excludedCount++;
      }
    } catch (error) {
      trial.valid = false;
      trial.error = errorText(error);
    }
    trials.push(trial);
    signal?.onProgress?.(i + 1, total);
  }
  return { trials, excludedCount, durationMs: Date.now() - started, cancelled: false };
}

export interface LeaderboardOptions {
  direction?: 'maximize' | 'minimize';
  limit?: number;
}
export function leaderboard(
  trials: readonly TrialRecord[],
  options: LeaderboardOptions = {},
): TrialRecord[] {
  const direction = options.direction ?? 'maximize';
  return trials
    .filter(
      (t) =>
        t.valid && !t.excluded && t.objectiveValue !== null && Number.isFinite(t.objectiveValue),
    )
    .slice()
    .sort(
      (a, b) =>
        (direction === 'maximize'
          ? b.objectiveValue! - a.objectiveValue!
          : a.objectiveValue! - b.objectiveValue!) ||
        (a.trialId ?? '').localeCompare(b.trialId ?? ''),
    )
    .slice(0, options.limit ?? Infinity);
}

export interface MetricConstraint {
  metric: string;
  operator: '>=' | '<=';
  value: number;
}
export function constraintValue(trial: TrialRecord, metric: string): number | null {
  return metric === consecutiveLossesMetric
    ? (trial.inSampleStatistics?.maxConsecutiveLosses ?? null)
    : scoreMetric(
        trial.inSampleMetrics ?? trial.inSample?.metrics ?? trial.result?.metrics ?? {},
        metric,
      );
}
/**
 * Optimization scoring accepts report names or exact keys. Account-wide Net profit (amount or
 * percent) is marked to market; metricValue and the original report remain closed-trade values.
 * Side-specific metrics and all other objectives keep their engine definitions.
 */
export function scoreMetric(
  metrics: RunResult['metrics'],
  metric: string,
  scope?: 'All' | 'Long' | 'Short',
  percent?: boolean,
): number | null {
  if (
    (scope ?? 'All') === 'All' &&
    (metric === 'Net profit' || /^Performance\/Net profit\/All(?: .*)?$/.test(metric))
  ) {
    if (metric !== 'Net profit' && !Object.hasOwn(metrics, metric)) return null;
    // Window selection can send only a previously scored percentage column.
    if (
      Object.hasOwn(metrics, metric) &&
      metric.endsWith('/All %') &&
      metricValue(metrics, 'Net profit') === null
    )
      return typeof metrics[metric] === 'number' && Number.isFinite(metrics[metric])
        ? metrics[metric]
        : null;
    return rangeProfit(metrics, percent ?? metric.endsWith('/All %'));
  }
  if (scope !== undefined || percent !== undefined)
    return metricValue(metrics, metric, scope ?? 'All', percent ?? false);
  const direct = metrics[metric];
  if (typeof direct === 'number') return Number.isFinite(direct) ? direct : null;
  return metricValue(metrics, metric) ?? metricValue(metrics, metric, 'All', true);
}
export function viewTrials(
  trials: readonly TrialRecord[],
  objective: string,
  constraints: readonly MetricConstraint[],
): TrialRecord[] {
  return trials.map((trial) => {
    const inMetrics =
      trial.inSampleMetrics ?? trial.inSample?.metrics ?? trial.result?.metrics ?? {};
    const outMetrics = trial.outOfSampleMetrics ?? trial.outOfSample?.metrics;
    const inValue = scoreMetric(inMetrics, objective);
    return {
      ...trial,
      objectiveValue: inValue,
      inSampleValue: inValue,
      outOfSampleValue: outMetrics ? scoreMetric(outMetrics, objective) : null,
      excluded: constraints.some((constraint) => {
        const value = constraintValue(trial, constraint.metric);
        return (
          value === null ||
          (constraint.operator === '>=' ? value < constraint.value : value > constraint.value)
        );
      }),
    };
  });
}
