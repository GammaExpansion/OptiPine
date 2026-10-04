import type { SerializedError } from '@pine/messages';
import type { ParameterSet, RunInput, RunResult, ScriptDescription } from '@pine/engine';
import type { TradeStatistics, TrialResult } from '@pine/optimizer';
import type { PackedRunInput } from './run-input.ts';

/** Shared by single runs and the future pool's independently scheduled chunks. */
export interface WorkerTaskMetadata {
  requestId: number;
  sourceRevision: number;
}

export type EngineWorkerRequest = WorkerTaskMetadata &
  (
    | { kind: 'describe'; source: string }
    | { kind: 'run'; source: string; input: RunInput }
    | {
        kind: 'reproduce';
        source: string;
        common?: RunInput | PackedRunInput;
        parameters: ParameterSet;
      }
    | {
        kind: 'optimize';
        source: string;
        common?: RunInput | PackedRunInput;
        parameters: readonly ParameterSet[];
        chunkIndex: number;
        totalChunks: number;
      }
  );

/** Metrics-only record emitted for each optimization trial. */
export interface OptimizationTrial {
  trialId: string;
  parameters: ParameterSet;
  metrics: RunResult['metrics'];
  tradeCount: number;
  statistics?: TradeStatistics;
  diagnostics: RunResult['diagnostics'];
  warnings?: RunResult['warnings'];
}

export interface SerializedWorkerError extends SerializedError {
  diagnostics?: RunResult['diagnostics'];
}

export type EngineWorkerResponse = WorkerTaskMetadata &
  (
    | { kind: 'described'; description: ScriptDescription }
    | { kind: 'ran'; result: TrialResult }
    | { kind: 'trial'; trial: OptimizationTrial; chunkIndex: number; trialIndex?: number }
    | {
        kind: 'optimized';
        chunkIndex: number;
        totalChunks: number;
        trialCount: number;
        elapsedMs: number;
        diagnostics?: RunResult['diagnostics'];
      }
    | { kind: 'failed'; error: SerializedWorkerError }
  );

/** The small injectable transport also lets worker tests run in Node without a browser. */
export interface EngineWorkerTransport {
  onmessage: ((event: MessageEvent<EngineWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: EngineWorkerRequest, transfer?: Transferable[]): void;
  terminate(): void;
}

export type EngineWorkerFactory = () => EngineWorkerTransport;

/** The parts of a dedicated Worker's global scope (`self`) that the serve functions use. */
export interface WorkerScope<Response> {
  onmessage: unknown;
  postMessage(message: Response): void;
}

export function availableWorkerCount(hardwareConcurrency: number = 2): number {
  return Number.isFinite(hardwareConcurrency)
    ? Math.max(1, Math.floor(hardwareConcurrency) - 1)
    : 1;
}
