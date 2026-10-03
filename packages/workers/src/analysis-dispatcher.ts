import { serializeError } from '@pine/messages';
import {
  analyzeOptimizer,
  enumerateGrid,
  sampleRandom,
  scoreMetric,
  stabilityBands,
  viewTrials,
  finalizeWalkForward,
  planWalkForwardWindows,
  selectWalkForwardTrial,
} from '@pine/optimizer';
import type { AnalysisRequest, AnalysisResponse } from './analysis-protocol.ts';
import type { WorkerScope } from './protocol.ts';

/** A Worker entry calls this through `serveAnalysisWorker`; tests call it directly. */
export function handleAnalysisRequest(request: AnalysisRequest): AnalysisResponse {
  const { requestId, kind } = request;
  try {
    switch (request.kind) {
      case 'view':
        return { requestId, kind: 'view', output: analyzeOptimizer(request.input) };
      case 'plan':
        return {
          requestId,
          kind: 'plan',
          output: planWalkForwardWindows(request.input.bars, request.input.config),
        };
      case 'records': {
        const { groups, objective } = request.input;
        const outById = new Map(groups[1]?.map((trial) => [trial.trialId, trial]));
        const output = groups[0].map((trial) => {
          const out = outById.get(trial.trialId),
            value = scoreMetric(trial.metrics, objective);
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
            outOfSampleValue: out ? scoreMetric(out.metrics, objective) : null,
            valid: !trial.diagnostics.length && !out?.diagnostics.length,
            excluded: false,
          };
        });
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
    }
  } catch (error) {
    return { requestId, kind: 'failed', error: serializeError(error) };
  }
}

/** Serve analysis jobs from a module Worker; its whole entry is `serveAnalysisWorker(self)`. */
export function serveAnalysisWorker(scope: WorkerScope<AnalysisResponse>): void {
  scope.onmessage = (event: MessageEvent<AnalysisRequest>) =>
    scope.postMessage(handleAnalysisRequest(event.data));
}
