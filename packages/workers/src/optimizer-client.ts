import type { Diagnostic, ParameterSet, RunInput } from '@pine/engine';
import { restoreError, TextError, type Text } from '@pine/messages';
import type { TrialResult } from '@pine/optimizer';
import { workerError, workerMessage } from './messages.ts';
import {
  availableWorkerCount,
  type EngineWorkerFactory,
  type EngineWorkerRequest,
  type OptimizationTrial,
} from './protocol.ts';
import { EngineWorkerClient, WorkerCancelledError, WorkerCrashedError } from './client.ts';

export interface OptimizationProgress {
  completed: number;
  total: number;
  /** Number of workers actually created for this run. */
  workers: number;
  chunkIndex?: number;
  calibratedMs: number | null;
  elapsedMs: number;
  remainingMs: number | null;
  errorCount: number;
}
export interface OptimizationResult {
  trials: OptimizationTrial[];
  diagnostics: Diagnostic[];
  elapsedMs: number;
  workers: number;
  calibratedMs: number | null;
  remainingMs: number;
  errorCount: number;
  cancelled?: boolean;
}
export interface OptimizationOptions {
  sourceRevision?: number;
  workerCount?: number;
  /** Optional ceiling; actual chunks adapt to roughly one second of work. */
  chunkSize?: number;
  onTrial?: (trial: OptimizationTrial) => void;
  onProgress?: (progress: OptimizationProgress) => void;
}

export class OptimizationCompileError extends TextError {
  readonly diagnostics: Diagnostic[];
  constructor(diagnostics: Diagnostic[], message: Text = workerMessage('strategyCompileFailed')) {
    super(message);
    this.name = 'OptimizationCompileError';
    this.diagnostics = diagnostics;
  }
}

interface Slot {
  worker: ReturnType<EngineWorkerFactory>;
  generation: number;
  busy: boolean;
}
interface ActiveRun {
  generation: number;
  slots: Slot[];
  reject: (error: Error) => void;
  timer?: ReturnType<typeof setInterval>;
}
const positiveInteger = (value: number | undefined, fallback: number): number =>
  Number.isFinite(value) ? Math.max(1, Math.floor(value!)) : fallback;

/** Calibrates one real trial, then schedules independent sweeps across module workers. */
export class OptimizationWorkerPool {
  readonly #factory: EngineWorkerFactory;
  #nextRequestId = 1;
  #generation = 0;
  #active: ActiveRun | null = null;
  #lastResult: OptimizationResult | null = null;
  #disposed = false;
  readonly #reproductions = new Set<EngineWorkerClient>();

  /** `factory` creates the module Worker whose entry calls `serveEngineWorker`. */
  constructor(factory: EngineWorkerFactory) {
    this.#factory = factory;
  }
  get lastResult(): OptimizationResult | null {
    return this.#lastResult;
  }

  /** The caller supplies the saved source/input snapshot of this leaderboard run. */
  async reproduce(
    source: string,
    common: RunInput,
    parameters: ParameterSet,
    sourceRevision = 0,
    signal?: AbortSignal,
  ): Promise<TrialResult> {
    if (this.#disposed) throw new WorkerCancelledError(workerMessage('optimizerWorkersClosed'));
    if (signal?.aborted) throw new WorkerCancelledError();
    const client = new EngineWorkerClient(this.#factory);
    const abort = () => client.dispose();
    this.#reproductions.add(client);
    signal?.addEventListener('abort', abort, { once: true });
    try {
      if (signal?.aborted) throw new WorkerCancelledError();
      const input = structuredClone({
        ...common,
        inputs: { ...common.inputs, ...parameters.inputs },
        settings: { ...common.settings, ...parameters.settings },
      });
      return await client.run(source, input, sourceRevision);
    } finally {
      signal?.removeEventListener('abort', abort);
      this.#reproductions.delete(client);
      client.dispose();
    }
  }

  optimize(
    source: string,
    common: RunInput,
    parameters: readonly ParameterSet[],
    options: OptimizationOptions = {},
  ): Promise<OptimizationResult> {
    if (this.#disposed)
      return Promise.reject(new WorkerCancelledError(workerMessage('optimizerWorkersClosed')));
    this.cancel();
    const generation = ++this.#generation;
    const concurrency = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 2;
    const capacity = positiveInteger(options.workerCount, availableWorkerCount(concurrency));
    const maxChunk = positiveInteger(options.chunkSize, 256);
    const sourceRevision = options.sourceRevision ?? 0;
    return new Promise((resolve, reject) => {
      let input: RunInput;
      let parameterSets: ParameterSet[];
      try {
        input = structuredClone(common);
        parameterSets = structuredClone(parameters) as ParameterSet[];
      } catch (error) {
        reject(error);
        return;
      }
      const run: ActiveRun = { generation, slots: [], reject };
      this.#active = run;
      const started = Date.now();
      const trials: OptimizationTrial[] = new Array(parameterSets.length);
      const diagnostics: Diagnostic[] = [];
      let nextParameter = 0;
      let nextChunk = 0;
      let completed = 0;
      let workersCreated = 0;
      let errorCount = 0;
      let calibratedMs: number | null = null;
      let meanMs: number | null = null;
      const active = (): boolean =>
        this.#active === run && this.#generation === generation && !this.#disposed;
      const progress = (chunkIndex?: number) => {
        if (!active()) return;
        options.onProgress?.({
          completed,
          total: parameterSets.length,
          workers: workersCreated,
          chunkIndex,
          calibratedMs,
          elapsedMs: Date.now() - started,
          remainingMs:
            meanMs === null
              ? null
              : Math.max(
                  0,
                  Math.ceil(
                    ((parameterSets.length - completed) * meanMs) / Math.max(1, workersCreated),
                  ),
                ),
          errorCount,
        });
      };
      const fail = (error: Error) => {
        if (!active()) return;
        this.#active = null;
        this.#stopRun(run);
        reject(error);
      };
      const finish = () => {
        if (!active()) return;
        const result: OptimizationResult = {
          trials,
          diagnostics,
          elapsedMs: Date.now() - started,
          workers: workersCreated,
          calibratedMs,
          remainingMs: 0,
          errorCount,
        };
        progress();
        if (!active()) return;
        this.#active = null;
        this.#stopRun(run);
        this.#lastResult = result;
        resolve(result);
      };
      const dispatch = (slot: Slot) => {
        if (!active() || slot.busy || nextParameter >= parameterSets.length) return;
        const start = nextParameter;
        const idleWorkers = Math.max(1, run.slots.filter((candidate) => !candidate.busy).length);
        const fairShare = Math.ceil((parameterSets.length - nextParameter) / idleWorkers);
        const size =
          calibratedMs === null
            ? 1
            : Math.min(maxChunk, fairShare, Math.max(1, Math.floor(1000 / Math.max(1, meanMs!))));
        const chunk = parameterSets.slice(start, start + size);
        nextParameter += chunk.length;
        const chunkIndex = nextChunk++;
        const request: Extract<EngineWorkerRequest, { kind: 'optimize' }> = {
          kind: 'optimize',
          source,
          common: input,
          parameters: chunk,
          chunkIndex,
          totalChunks: nextChunk + Math.ceil((parameterSets.length - nextParameter) / size),
          requestId: this.#nextRequestId++,
          sourceRevision,
        };
        const slotGeneration = ++slot.generation;
        const received = new Set<number>();
        slot.busy = true;
        slot.worker.onmessage = (event) => {
          if (!active() || slotGeneration !== slot.generation) return;
          const response = event.data;
          if (
            response.requestId !== request.requestId ||
            response.sourceRevision !== sourceRevision
          )
            return;
          try {
            if (response.kind === 'trial') {
              const index = response.trialIndex ?? received.size;
              if (received.has(index)) return;
              if (!Number.isInteger(index) || index < 0 || index >= chunk.length)
                throw workerError('optimizerTrialIndexInvalid');
              received.add(index);
              trials[start + index] = response.trial;
              completed++;
              if (response.trial.diagnostics.length) errorCount++;
              options.onTrial?.(response.trial);
              progress(chunkIndex);
            } else if (response.kind === 'optimized') {
              if (response.diagnostics?.length)
                throw new OptimizationCompileError(response.diagnostics);
              if (received.size !== chunk.length || response.trialCount !== chunk.length)
                throw workerError('optimizerTrialsIncomplete');
              slot.busy = false;
              ++slot.generation;
              const sampleMs = Math.max(1, response.elapsedMs / chunk.length);
              if (calibratedMs === null) {
                calibratedMs = sampleMs;
                meanMs = sampleMs;
              } else meanMs = meanMs! * 0.7 + sampleMs * 0.3;
              progress(chunkIndex);
              if (!active()) return;
              if (completed === parameterSets.length) {
                finish();
                return;
              }
              fillPool();
              for (const available of run.slots) dispatch(available);
            } else if (response.kind === 'failed') {
              const error =
                response.error.name === 'OptimizationCompileError'
                  ? new OptimizationCompileError(
                      response.error.diagnostics ?? [],
                      response.error.uiText ?? response.error.message,
                    )
                  : Object.assign(restoreError(response.error), {
                      name: response.error.name,
                      diagnostics: response.error.diagnostics,
                    });
              fail(error);
            } else throw workerError('optimizerWorkerResponseMismatch');
          } catch (error) {
            fail(error instanceof Error ? error : new Error(String(error)));
          }
        };
        try {
          slot.worker.postMessage(request);
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
      };
      const addWorker = () => {
        const slot: Slot = { worker: this.#factory(), generation: 0, busy: false };
        run.slots.push(slot);
        workersCreated++;
        slot.worker.onerror = (event) => {
          event.preventDefault?.();
          fail(new WorkerCrashedError(event.message));
        };
        slot.worker.onmessageerror = () =>
          fail(new WorkerCrashedError(workerMessage('optimizerWorkerUnreadable')));
      };
      const fillPool = () => {
        const needed = Math.min(capacity, parameterSets.length - completed);
        while (active() && run.slots.length < needed) addWorker();
      };
      try {
        if (!parameterSets.length) {
          finish();
          return;
        }
        addWorker();
        progress();
        if (!active()) return;
        run.timer = setInterval(() => {
          try {
            progress();
          } catch (error) {
            fail(error instanceof Error ? error : new Error(String(error)));
          }
        }, 250);
        dispatch(run.slots[0]!);
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  cancel(): void {
    for (const client of this.#reproductions) client.dispose();
    this.#reproductions.clear();
    const run = this.#active;
    if (!run) return;
    this.#active = null;
    ++this.#generation;
    this.#stopRun(run);
    run.reject(new WorkerCancelledError());
  }

  dispose(): void {
    this.cancel();
    this.#disposed = true;
  }

  #stopRun(run: ActiveRun): void {
    if (run.timer) clearInterval(run.timer);
    for (const slot of run.slots) {
      ++slot.generation;
      slot.worker.onmessage = null;
      slot.worker.onerror = null;
      slot.worker.onmessageerror = null;
      slot.worker.terminate();
    }
    run.slots = [];
  }
}
