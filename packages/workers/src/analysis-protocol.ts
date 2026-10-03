import type { LiteralValue, RunInput } from '@pine/engine';
import type { SerializedError } from '@pine/messages';
import type {
  MetricConstraint,
  OptimizerAnalysis,
  OptimizerAnalysisInput,
  SearchSpace,
  TrialRecord,
  WalkForwardConfig,
  WalkForwardExecution,
  WalkForwardPlan,
  WalkForwardResult,
} from '@pine/optimizer';
import type { OptimizationTrial } from './protocol.ts';

export interface AnalysisJobs {
  view: { input: OptimizerAnalysisInput; output: OptimizerAnalysis };
  plan: { input: { bars: RunInput['bars']; config: WalkForwardConfig }; output: WalkForwardPlan[] };
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
