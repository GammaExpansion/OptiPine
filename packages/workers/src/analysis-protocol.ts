import type { LiteralValue } from '@pine/engine';
import type { SerializedError } from '@pine/messages';
import type {
  MetricConstraint,
  OptimizerAnalysis,
  OptimizerAnalysisInput,
  OptimizerSummary,
  OptimizerSummaryRequest,
  SearchSpace,
  TrialRecord,
  WalkForwardBounds,
  WalkForwardConfig,
  WalkForwardExecution,
  WalkForwardResult,
} from '@pine/optimizer';
import type { OptimizationTrial } from './protocol.ts';

/** A run's view: the analysis settings without its trials, which the Worker holds. */
export type AnalysisRunView = Omit<OptimizerAnalysisInput, 'trials'>;

export interface AnalysisJobs {
  view: { input: OptimizerAnalysisInput; output: OptimizerAnalysis };
  /** Window bounds and bar indices from the bars' open times; the bars stay with the caller. */
  plan: {
    input: { times: readonly number[]; config: WalkForwardConfig };
    output: WalkForwardBounds[];
  };
  records: { input: { groups: OptimizationTrial[][]; objective: string }; output: TrialRecord[] };
  parameters: {
    input: {
      space: SearchSpace;
      method: 'grid' | 'random';
      count: number;
      seed: number;
      limit: number;
    };
    output: Record<string, LiteralValue>[];
  };
  choose: {
    input: { groups: TrialRecord[][]; config: WalkForwardConfig; constraints: MetricConstraint[] };
    output: { trials: TrialRecord[]; bestTrial?: TrialRecord }[];
  };
  finalize: {
    input: { executions: WalkForwardExecution[]; config: WalkForwardConfig };
    output: WalkForwardResult;
  };
  stability: {
    input: {
      executions: Pick<WalkForwardExecution, 'trials' | 'chosenParameters'>[];
      config: WalkForwardConfig;
    };
    output: WalkForwardResult['stability'];
  };
  /** Start holding a run's trials, replacing a run with the same id. */
  runOpen: { input: { run: number }; output: null };
  /** Add trials of range 0 (the full range, or IS) or 1 (OOS); answers the sets now held. */
  runAppend: {
    input: { run: number; range: 0 | 1; trials: OptimizationTrial[] };
    output: number;
  };
  /** Analyse every trial the run holds and answer with the summary screens read. */
  runView: {
    input: { run: number; view: AnalysisRunView; summary: OptimizerSummaryRequest };
    output: OptimizerSummary;
  };
  runClose: { input: { run: number }; output: null };
}
export type AnalysisRequest = {
  [K in keyof AnalysisJobs]: { requestId: number; kind: K; input: AnalysisJobs[K]['input'] };
}[keyof AnalysisJobs];
export type AnalysisResponse =
  | {
      [K in keyof AnalysisJobs]: { requestId: number; kind: K; output: AnalysisJobs[K]['output'] };
    }[keyof AnalysisJobs]
  | { requestId: number; kind: 'failed'; error: SerializedError };
export interface AnalysisWorkerTransport {
  onmessage: ((event: MessageEvent<AnalysisResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: AnalysisRequest): void;
  terminate(): void;
}
export type AnalysisWorkerFactory = () => AnalysisWorkerTransport;
export interface AnalysisClient {
  request<K extends keyof AnalysisJobs>(
    kind: K,
    input: AnalysisJobs[K]['input'],
  ): Promise<AnalysisJobs[K]['output']>;
  cancel(): void;
  dispose(): void;
}
