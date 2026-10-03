import { serializeError } from '@pine/messages';
import {
  analyzeOptimizer,
  enumerateGrid,
  sampleRandom,
  scoreMetric,
  stabilityBands,
  summarizeOptimizerAnalysis,
  viewTrials,
  finalizeWalkForward,
  planWalkForwardBounds,
  selectWalkForwardTrial,
  type OptimizerSummary,
  type OptimizerSummaryRequest,
  type TrialRecord,
} from '@pine/optimizer';
import type { AnalysisRequest, AnalysisResponse, AnalysisRunView } from './analysis-protocol.ts';
import { workerError } from './messages.ts';
import type { OptimizationTrial, WorkerScope } from './protocol.ts';

/**
 * A trial record from a set's trial on the IS (or full) range and, for IS / OOS, its OOS trial.
 * Without an objective the scores stay null: an analysis scores records itself.
 */
function trialRecord(
  trial: OptimizationTrial,
  out: OptimizationTrial | undefined,
  objective: string | null,
): TrialRecord {
  const value = objective === null ? null : scoreMetric(trial.metrics, objective);
  return {
    trialId: trial.trialId,
    parameters: { ...trial.parameters.inputs },
    inSampleMetrics: trial.metrics,
    inSampleStatistics: trial.statistics,
    outOfSampleMetrics: out?.metrics,
    inSampleDiagnostics: trial.diagnostics,
    outOfSampleDiagnostics: out?.diagnostics,
    tradeCount: trial.tradeCount,
    inSampleWarnings: trial.warnings,
    outOfSampleWarnings: out?.warnings,
    objectiveValue: value,
    inSampleValue: value,
    outOfSampleValue: out && objective !== null ? scoreMetric(out.metrics, objective) : null,
    valid: !trial.diagnostics.length && !out?.diagnostics.length,
    excluded: false,
  };
}

interface HeldRun {
  /** One record per set, in the order its range-0 trial arrived. */
  readonly records: Map<string, TrialRecord>;
  /** OOS trials that arrived before their set's IS trial. */
  readonly waiting: Map<string, OptimizationTrial>;
}

/**
 * The runs one analysis Worker holds. The page sends each trial once, as it arrives; every view
 * of the run is then analysed from the trials kept here, and only its summary travels back.
 */
export class AnalysisRuns {
  readonly #runs = new Map<number, HeldRun>();

  open(run: number): void {
    this.#runs.set(run, { records: new Map(), waiting: new Map() });
  }

  /** Returns the sets the run holds. */
  append(run: number, range: 0 | 1, trials: readonly OptimizationTrial[]): number {
    const held = this.#held(run);
    for (const trial of trials) {
      if (range === 0) {
        held.records.set(trial.trialId, trialRecord(trial, held.waiting.get(trial.trialId), null));
        held.waiting.delete(trial.trialId);
        continue;
      }
      const record = held.records.get(trial.trialId);
      if (!record) {
        held.waiting.set(trial.trialId, trial);
        continue;
      }
      record.outOfSampleMetrics = trial.metrics;
      record.outOfSampleDiagnostics = trial.diagnostics;
      record.outOfSampleWarnings = trial.warnings;
      record.valid = !record.inSampleDiagnostics?.length && !trial.diagnostics.length;
    }
    return held.records.size;
  }

  view(run: number, view: AnalysisRunView, summary: OptimizerSummaryRequest): OptimizerSummary {
    const trials = [...this.#held(run).records.values()];
    return summarizeOptimizerAnalysis(analyzeOptimizer({ ...view, trials }), summary);
  }

  close(run: number): void {
    this.#runs.delete(run);
  }

  #held(run: number): HeldRun {
    const held = this.#runs.get(run);
    if (!held) throw workerError('analysisRunUnknown', { run });
    return held;
  }
}

/**
 * A Worker entry calls this through `serveAnalysisWorker`; tests call it directly. Run jobs need
 * the Worker's `runs`; without them every run is unknown.
 */
export function handleAnalysisRequest(
  request: AnalysisRequest,
  runs?: AnalysisRuns,
): AnalysisResponse {
  const { requestId, kind } = request;
  const held = (run: number): AnalysisRuns => {
    if (!runs) throw workerError('analysisRunUnknown', { run });
    return runs;
  };
  try {
    switch (request.kind) {
      case 'view':
        return { requestId, kind: 'view', output: analyzeOptimizer(request.input) };
      case 'plan':
        return {
          requestId,
          kind: 'plan',
          output: planWalkForwardBounds(request.input.times, request.input.config),
        };
      case 'records': {
        const { groups, objective } = request.input;
        const outById = new Map(groups[1]?.map((trial) => [trial.trialId, trial]));
        const output = groups[0].map((trial) =>
          trialRecord(trial, outById.get(trial.trialId), objective),
        );
        return { requestId, kind: 'records', output };
      }
      case 'parameters': {
        const { space, method, count, seed, limit } = request.input;
        return {
          requestId,
          kind: 'parameters',
          output:
            method === 'random' ? sampleRandom(space, count, seed) : enumerateGrid(space, limit),
        };
      }
      case 'choose': {
        const { groups, config, constraints } = request.input;
        return {
          requestId,
          kind: 'choose',
          output: groups.map((group) => {
            const trials = viewTrials(group, config.objective?.name ?? 'Net profit', constraints);
            return { trials, bestTrial: selectWalkForwardTrial(trials, config) };
          }),
        };
      }
      case 'finalize':
        return {
          requestId,
          kind: 'finalize',
          output: finalizeWalkForward(request.input.executions, request.input.config),
        };
      case 'stability': {
        const { executions, config } = request.input;
        const parameters = config.axes?.map((axis) => axis.title) ?? [
          ...new Set(
            executions.flatMap((window) =>
              window.trials.flatMap((trial) => Object.keys(trial.parameters)),
            ),
          ),
        ];
        return {
          requestId,
          kind: 'stability',
          output: stabilityBands(
            executions,
            parameters,
            config.tolerance ?? 0.1,
            config.objective?.direction ?? 'maximize',
            { axes: config.axes, neighborhood: config.neighborhood },
          ),
        };
      }
      case 'runOpen':
        held(request.input.run).open(request.input.run);
        return { requestId, kind: 'runOpen', output: null };
      case 'runAppend': {
        const { run, range, trials } = request.input;
        return { requestId, kind: 'runAppend', output: held(run).append(run, range, trials) };
      }
      case 'runView': {
        const { run, view, summary } = request.input;
        return { requestId, kind: 'runView', output: held(run).view(run, view, summary) };
      }
      case 'runClose':
        held(request.input.run).close(request.input.run);
        return { requestId, kind: 'runClose', output: null };
    }
  } catch (error) {
    return { requestId, kind: 'failed', error: serializeError(error) };
  }
}

/** Serve analysis jobs from a module Worker; its whole entry is `serveAnalysisWorker(self)`. */
export function serveAnalysisWorker(scope: WorkerScope<AnalysisResponse>): void {
  const runs = new AnalysisRuns();
  scope.onmessage = (event: MessageEvent<AnalysisRequest>) =>
    scope.postMessage(handleAnalysisRequest(event.data, runs));
}
