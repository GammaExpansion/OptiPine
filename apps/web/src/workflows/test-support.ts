import type { MarketBar, ParameterSet, RunInput } from '@pine/engine';
import { restoreError } from '@pine/messages';
import type { TrialResult } from '@pine/optimizer';
import {
  AnalysisRuns,
  AnalysisWorkerClient,
  EngineWorkerClient,
  handleAnalysisRequest,
  handleEngineWorkerRequest,
  handleOptimizationWorkerRequest,
  OptimizationWorkerPool,
  WorkerCancelledError,
} from '@pine/workers';
import type {
  AnalysisClient,
  AnalysisJobs,
  AnalysisRequest,
  AnalysisResponse,
  AnalysisWorkerTransport,
  EngineWorkerRequest,
  EngineWorkerResponse,
  EngineWorkerTransport,
  OptimizationOptions,
  OptimizationResult,
  OptimizationTrial,
} from '@pine/workers';
import type { OptimizationPool, Timers } from './optimize-session.ts';

/** Hourly bars from `start` (Unix seconds): a slow trend with waves, so crossings happen. */
export function syntheticBars(count: number, start = Date.UTC(2024, 0, 1) / 1000): MarketBar[] {
  return Array.from({ length: count }, (_, index) => {
    const close = Math.round((100 + 8 * Math.sin(index / 6) + index * 0.03) * 100) / 100;
    const open = Math.round((close - Math.cos(index / 6)) * 100) / 100;
    return {
      time: start + index * 3600,
      open,
      high: Math.max(open, close) + 0.5,
      low: Math.min(open, close) - 0.5,
      close,
      volume: 1000,
    };
  });
}

/** A strategy that always holds a position, flipping on moving-average crossings. */
export const strategySource = `//@version=6
strategy("Test strategy", initial_capital=10000, default_qty_type=strategy.percent_of_equity, default_qty_value=50, commission_type=strategy.commission.percent, commission_value=0.1)
length = input.int(5, "Length", minval=2, maxval=50)
mult = input.float(1.0, "Multiplier", step=0.25)
src = input.source(close, "Source")
basis = ta.sma(src, length) * mult
if ta.crossover(src, basis)
    strategy.entry("L", strategy.long)
if ta.crossunder(src, basis)
    strategy.entry("S", strategy.short)
plot(basis, "Basis", force_overlay=true)
plot(ta.rsi(close, 14), "RSI")
`;

/** A Worker stand-in that holds requests until a test answers them with the real dispatcher. */
export class ManualWorker implements EngineWorkerTransport {
  onmessage: EngineWorkerTransport['onmessage'] = null;
  onerror: EngineWorkerTransport['onerror'] = null;
  onmessageerror: EngineWorkerTransport['onmessageerror'] = null;
  readonly requests: EngineWorkerRequest[] = [];
  terminated = false;

  postMessage(request: EngineWorkerRequest): void {
    this.requests.push(structuredClone(request));
  }

  terminate(): void {
    this.terminated = true;
  }

  /** Run the oldest held request through the engine and reply. */
  answer(): void {
    this.reply(handleEngineWorkerRequest(this.requests.shift()!));
  }

  reply(response: EngineWorkerResponse): void {
    this.onmessage?.(new MessageEvent('message', { data: structuredClone(response) }));
  }

  crash(): void {
    this.onerror?.({ message: '', preventDefault() {} } as CrashEvent);
  }
}

type CrashEvent = Parameters<NonNullable<EngineWorkerTransport['onerror']>>[0];

/** The real `EngineWorkerClient` over manual Workers; the client replaces a Worker it cancels. */
export function engineHarness(): {
  client: EngineWorkerClient;
  workers: ManualWorker[];
  worker: () => ManualWorker;
  answerAll: () => Promise<void>;
} {
  const workers: ManualWorker[] = [];
  const client = new EngineWorkerClient(() => {
    const worker = new ManualWorker();
    workers.push(worker);
    return worker;
  });
  const worker = () => workers.at(-1)!;
  return {
    client,
    workers,
    worker,
    /** Answer every held request of the live Worker, then let the replies settle. */
    async answerAll() {
      await settle();
      while (worker().requests.length) {
        worker().answer();
        await settle();
      }
    },
  };
}

/** Let pending promise callbacks run. */
export function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** An engine Worker stand-in that answers with the real dispatchers after a macrotask. */
export class LocalEngineWorker implements EngineWorkerTransport {
  onmessage: EngineWorkerTransport['onmessage'] = null;
  onerror: EngineWorkerTransport['onerror'] = null;
  onmessageerror: EngineWorkerTransport['onmessageerror'] = null;
  terminated = false;

  postMessage(request: EngineWorkerRequest): void {
    if (this.terminated) throw new Error('terminated');
    const copy = structuredClone(request);
    setTimeout(() => {
      const deliver = (response: EngineWorkerResponse) => {
        if (!this.terminated)
          this.onmessage?.(new MessageEvent('message', { data: structuredClone(response) }));
      };
      if (this.terminated) return;
      if (copy.kind === 'optimize') handleOptimizationWorkerRequest(copy, undefined, deliver);
      else deliver(handleEngineWorkerRequest(copy));
    }, 0);
  }

  terminate(): void {
    this.terminated = true;
  }
}

/** An analysis Worker stand-in that answers with the real dispatcher after a macrotask. */
export class LocalAnalysisWorker implements AnalysisWorkerTransport {
  readonly runs = new AnalysisRuns();
  onmessage: AnalysisWorkerTransport['onmessage'] = null;
  onerror: AnalysisWorkerTransport['onerror'] = null;
  onmessageerror: AnalysisWorkerTransport['onmessageerror'] = null;
  terminated = false;

  postMessage(request: AnalysisRequest): void {
    const copy = structuredClone(request);
    setTimeout(() => {
      if (this.terminated) return;
      const response = structuredClone(handleAnalysisRequest(copy, this.runs));
      this.onmessage?.(new MessageEvent('message', { data: response }));
    }, 0);
  }

  terminate(): void {
    this.terminated = true;
  }
}

/** The real pool and analysis client over local Workers, and the engine Workers created. */
export function localWorkers(): {
  pool: OptimizationWorkerPool;
  analysis: AnalysisWorkerClient;
  engineWorkers: LocalEngineWorker[];
} {
  const engineWorkers: LocalEngineWorker[] = [];
  return {
    pool: new OptimizationWorkerPool(() => {
      const worker = new LocalEngineWorker();
      engineWorkers.push(worker);
      return worker;
    }),
    analysis: new AnalysisWorkerClient(() => new LocalAnalysisWorker()),
    engineWorkers,
  };
}

/** The trials the pool would stream for these sets, computed by the engine at once. */
export function engineTrials(
  source: string,
  common: RunInput,
  parameters: readonly ParameterSet[],
): OptimizationTrial[] {
  const trials: OptimizationTrial[] = [];
  handleOptimizationWorkerRequest(
    {
      kind: 'optimize',
      source,
      common,
      parameters,
      chunkIndex: 0,
      totalChunks: 1,
      requestId: 1,
      sourceRevision: 0,
    },
    undefined,
    (response) => {
      if (response.kind === 'trial') trials.push(response.trial);
    },
  );
  return trials;
}

export interface HeldRun {
  readonly source: string;
  readonly common: RunInput;
  readonly parameters: readonly ParameterSet[];
  readonly options: OptimizationOptions;
  settled: boolean;
  resolve(result?: Partial<OptimizationResult>): void;
  reject(error: Error): void;
}

export interface HeldReproduction {
  readonly common: RunInput;
  readonly parameters: ParameterSet;
  readonly signal: AbortSignal | undefined;
  settled: boolean;
  resolve(result: TrialResult): void;
  reject(error: Error): void;
}

/** A pool whose runs and reproductions wait until a test settles them. */
export class FakePool implements OptimizationPool {
  readonly runs: HeldRun[] = [];
  readonly reproductions: HeldReproduction[] = [];
  cancels = 0;

  optimize(
    source: string,
    common: RunInput,
    parameters: readonly ParameterSet[],
    options: OptimizationOptions = {},
  ): Promise<OptimizationResult> {
    return new Promise((resolve, reject) => {
      const run: HeldRun = {
        source,
        common,
        parameters,
        options,
        settled: false,
        resolve: (result = {}) => {
          run.settled = true;
          resolve({
            trials: [],
            diagnostics: [],
            elapsedMs: 100,
            workers: 2,
            calibratedMs: 10,
            remainingMs: 0,
            errorCount: 0,
            ...result,
          });
        },
        reject: (error) => {
          run.settled = true;
          reject(error);
        },
      };
      this.runs.push(run);
    });
  }

  reproduce(
    _source: string,
    common: RunInput,
    parameters: ParameterSet,
    _sourceRevision?: number,
    signal?: AbortSignal,
  ): Promise<TrialResult> {
    return new Promise((resolve, reject) => {
      const held: HeldReproduction = {
        common,
        parameters,
        signal,
        settled: false,
        resolve: (result) => {
          held.settled = true;
          resolve(result);
        },
        reject: (error) => {
          held.settled = true;
          reject(error);
        },
      };
      signal?.addEventListener('abort', () => held.reject(new WorkerCancelledError()));
      this.reproductions.push(held);
    });
  }

  cancel(): void {
    this.cancels++;
    for (const held of [...this.runs, ...this.reproductions])
      if (!held.settled) held.reject(new WorkerCancelledError());
  }

  /** The run still waiting, if any. */
  get active(): HeldRun | undefined {
    return this.runs.find((run) => !run.settled);
  }
}

interface HeldRequest {
  readonly kind: keyof AnalysisJobs;
  readonly input: unknown;
  resolve(output: unknown): void;
  reject(error: Error): void;
}

/** An analysis client whose requests wait until a test answers them. */
export class FakeAnalysis implements AnalysisClient {
  readonly requests: HeldRequest[] = [];
  /** The runs a real analysis Worker would hold. */
  readonly runs = new AnalysisRuns();

  request<K extends keyof AnalysisJobs>(
    kind: K,
    input: AnalysisJobs[K]['input'],
  ): Promise<AnalysisJobs[K]['output']> {
    return new Promise((resolve, reject) => {
      this.requests.push({
        kind,
        input: structuredClone(input),
        resolve: (output) => resolve(output as AnalysisJobs[K]['output']),
        reject,
      });
    });
  }

  get kinds(): (keyof AnalysisJobs)[] {
    return this.requests.map((request) => request.kind);
  }

  /** Answer the oldest waiting request with the real dispatcher. */
  answer(): void {
    const held = this.requests.shift()!;
    const response: AnalysisResponse = handleAnalysisRequest(
      {
        requestId: 0,
        kind: held.kind,
        input: held.input,
      } as AnalysisRequest,
      this.runs,
    );
    if (response.kind === 'failed') held.reject(restoreError(response.error));
    else held.resolve(structuredClone(response.output));
  }

  /** Answer requests, letting each reply settle, until none waits. */
  async answerAll(): Promise<void> {
    await settle();
    while (this.requests.length) {
      this.answer();
      await settle();
    }
  }

  cancel(): void {
    for (const held of this.requests.splice(0)) held.reject(new WorkerCancelledError());
  }

  dispose(): void {
    this.cancel();
  }
}

/** Timers that fire only when a test advances the clock. */
export class ManualTimers implements Timers {
  now = 0;
  #next = 1;
  readonly #pending = new Map<number, { at: number; callback: () => void }>();

  setTimeout(callback: () => void, ms: number): number {
    const id = this.#next++;
    this.#pending.set(id, { at: this.now + ms, callback });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.#pending.delete(handle as number);
  }

  get scheduled(): number {
    return this.#pending.size;
  }

  advance(ms: number): void {
    this.now += ms;
    for (;;) {
      const due = [...this.#pending].filter(([, timer]) => timer.at <= this.now);
      if (!due.length) return;
      due.sort((a, b) => a[1].at - b[1].at);
      const [id, timer] = due[0];
      this.#pending.delete(id);
      timer.callback();
    }
  }
}
