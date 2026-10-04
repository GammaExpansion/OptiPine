import {
  describe,
  runWithEquity as runStrategy,
  sweep as sweepStrategy,
  type RunInput,
} from '@pine/engine';
import { serializeError } from '@pine/messages';
import { tradeStatistics, trialIdForParameters } from '@pine/optimizer';
import { workerError } from './messages.ts';
import type {
  EngineWorkerRequest,
  EngineWorkerResponse,
  OptimizationTrial,
  WorkerScope,
} from './protocol.ts';

export interface EngineWorkerOperations {
  describe: typeof describe;
  runStrategy: typeof runStrategy;
  sweepStrategy?: typeof sweepStrategy;
}

/** A single immutable reproduction snapshot, owned by one Worker and released on termination. */
export interface EngineWorkerState {
  reproduction?: { source: string; revision: number; common: RunInput };
}

/** Only the module worker invokes this dispatcher in the browser. */
export function handleEngineWorkerRequest(
  request: EngineWorkerRequest,
  operations: EngineWorkerOperations = { describe, runStrategy, sweepStrategy },
  state: EngineWorkerState = {},
): EngineWorkerResponse {
  const metadata = { requestId: request.requestId, sourceRevision: request.sourceRevision };
  try {
    if (request.kind === 'describe') {
      return { ...metadata, kind: 'described', description: operations.describe(request.source) };
    }
    if (request.kind === 'run')
      return {
        ...metadata,
        kind: 'ran',
        result: operations.runStrategy(request.source, request.input),
      };
    if (request.kind === 'reproduce') {
      if (request.common)
        state.reproduction = {
          source: request.source,
          revision: request.sourceRevision,
          common: request.common,
        };
      const snapshot = state.reproduction;
      if (
        !snapshot ||
        snapshot.source !== request.source ||
        snapshot.revision !== request.sourceRevision
      )
        throw workerError('invalidOptimizationDispatch');
      const { common } = snapshot;
      return {
        ...metadata,
        kind: 'ran',
        result: operations.runStrategy(request.source, {
          ...common,
          inputs: { ...common.inputs, ...request.parameters.inputs },
          settings: { ...common.settings, ...request.parameters.settings },
        }),
      };
    }
    throw workerError('invalidOptimizationDispatch');
  } catch (error) {
    return {
      ...metadata,
      kind: 'failed',
      error: serializeError(error),
    };
  }
}

/** Runs one chunk (one engine sweep/compile) and emits metrics-only trial messages. */
export function handleOptimizationWorkerRequest(
  request: Extract<EngineWorkerRequest, { kind: 'optimize' }>,
  operations: Pick<EngineWorkerOperations, 'sweepStrategy'> = { sweepStrategy },
  emit: (response: EngineWorkerResponse) => void = () => {},
): EngineWorkerResponse[] {
  const metadata = { requestId: request.requestId, sourceRevision: request.sourceRevision };
  const responses: EngineWorkerResponse[] = [];
  const send = (response: EngineWorkerResponse) => {
    responses.push(response);
    emit(response);
  };
  const started = Date.now();
  try {
    for (const parameter of request.parameters) {
      if (
        !parameter ||
        typeof parameter !== 'object' ||
        Array.isArray(parameter) ||
        Object.keys(parameter).some((key) => key !== 'inputs' && key !== 'settings')
      ) {
        throw workerError('parameterNamespacesRequired', {}, TypeError);
      }
      for (const value of [parameter.inputs, parameter.settings]) {
        if (
          value !== undefined &&
          (value === null || typeof value !== 'object' || Array.isArray(value))
        )
          throw workerError('parameterObjectsRequired', {}, TypeError);
      }
    }
    const sweep = (operations.sweepStrategy ?? sweepStrategy)(
      request.source,
      request.common,
      request.parameters,
    );
    if (!sweep.compilation.success) {
      send({
        ...metadata,
        kind: 'failed',
        error: {
          ...serializeError(workerError('strategyCompileFailed')),
          name: 'OptimizationCompileError',
          diagnostics: sweep.compilation.diagnostics,
        },
      });
      return responses;
    }
    sweep.runs.forEach((run, index) => {
      const trial: OptimizationTrial = {
        trialId: trialIdForParameters(run.parameters),
        parameters: run.parameters,
        metrics: run.result.metrics,
        tradeCount: run.result.trades.length,
        statistics: tradeStatistics(run.result),
        diagnostics: run.result.diagnostics,
        warnings: run.result.warnings,
      };
      send({
        ...metadata,
        kind: 'trial',
        trial,
        chunkIndex: request.chunkIndex,
        trialIndex: index,
      });
    });
    send({
      ...metadata,
      kind: 'optimized',
      chunkIndex: request.chunkIndex,
      totalChunks: request.totalChunks,
      trialCount: sweep.runs.length,
      elapsedMs: Date.now() - started,
      diagnostics: sweep.compilation.diagnostics,
    });
  } catch (error) {
    send({
      ...metadata,
      kind: 'failed',
      error: serializeError(error),
    });
  }
  return responses;
}

/** Serve engine requests from a module Worker; its whole entry is `serveEngineWorker(self)`. */
export function serveEngineWorker(scope: WorkerScope<EngineWorkerResponse>): void {
  const state: EngineWorkerState = {};
  scope.onmessage = (event: MessageEvent<EngineWorkerRequest>) => {
    if (event.data.kind === 'optimize') {
      handleOptimizationWorkerRequest(event.data, undefined, (response) =>
        scope.postMessage(response),
      );
    } else {
      scope.postMessage(handleEngineWorkerRequest(event.data, undefined, state));
    }
  };
}
