import { errorText, isMessage, restoreError, type Text } from '@pine/messages';
import type { OptimizerSummary, OptimizerSummaryRequest } from '@pine/optimizer';
import { workerError, workerMessage } from './messages.ts';
import { WorkerCancelledError, WorkerCrashedError } from './client.ts';
import type {
  AnalysisClient,
  AnalysisJobs,
  AnalysisRequest,
  AnalysisRunView,
  AnalysisWorkerFactory,
  AnalysisWorkerTransport,
} from './analysis-protocol.ts';
import type { OptimizationTrial } from './protocol.ts';
export type { AnalysisClient } from './analysis-protocol.ts';

/** The browser has no synchronous fallback. Termination interrupts analysis immediately. */
export class AnalysisWorkerClient implements AnalysisClient {
  readonly #factory: AnalysisWorkerFactory;
  #worker?: AnalysisWorkerTransport;
  #generation = 0;
  #nextId = 1;
  #disposed = false;
  #pending = new Map<
    number,
    { kind: keyof AnalysisJobs; resolve: (output: unknown) => void; reject: (error: Error) => void }
  >();
  /** `factory` creates the module Worker whose entry calls `serveAnalysisWorker`. */
  constructor(factory: AnalysisWorkerFactory) {
    this.#factory = factory;
  }

  request<K extends keyof AnalysisJobs>(
    kind: K,
    input: AnalysisJobs[K]['input'],
  ): Promise<AnalysisJobs[K]['output']> {
    return new Promise((resolve, reject) => {
      if (this.#disposed) {
        reject(new WorkerCancelledError(workerMessage('analysisWorkerClosed')));
        return;
      }
      const requestId = this.#nextId++;
      try {
        if (!this.#worker) this.#start();
        this.#pending.set(requestId, {
          kind,
          resolve: (output) => resolve(output as AnalysisJobs[K]['output']),
          reject,
        });
        this.#worker!.postMessage({ requestId, kind, input } as AnalysisRequest);
      } catch (error) {
        this.#pending.delete(requestId);
        reject(error);
      }
    });
  }
  cancel(): void {
    ++this.#generation;
    this.#stop(new WorkerCancelledError());
  }
  dispose(): void {
    this.#disposed = true;
    this.cancel();
  }
  #stop(error: Error): void {
    const worker = this.#worker;
    this.#worker = undefined;
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    }
    for (const pending of this.#pending.values()) pending.reject(error);
    this.#pending.clear();
  }
  #start(): void {
    const worker = this.#factory(),
      generation = ++this.#generation;
    this.#worker = worker;
    worker.onmessage = (event) => {
      if (generation !== this.#generation || this.#disposed) return;
      const response = event.data,
        pending = this.#pending.get(response.requestId);
      if (!pending) return;
      this.#pending.delete(response.requestId);
      if (response.kind === 'failed') {
        const error = restoreError(response.error);
        error.name = response.error.name;
        pending.reject(error);
      } else if (response.kind === pending.kind) pending.resolve(response.output);
      else pending.reject(workerError('analysisWorkerResponseMismatch'));
    };
    const failed = (message: Text) => {
      if (generation !== this.#generation || this.#disposed) return;
      ++this.#generation;
      this.#stop(new WorkerCrashedError(message));
    };
    worker.onerror = (event) => {
      event.preventDefault?.();
      failed(event.message || workerMessage('analysisWorkerCrashed'));
    };
    worker.onmessageerror = () => failed(workerMessage('analysisWorkerUnreadable'));
  }
}

/** True for the error a Worker answers when it does not hold the run, as after a restart. */
function runUnknown(error: unknown): boolean {
  const text = errorText(error);
  return isMessage(text) && 'id' in text && text.id === 'analysisRunUnknown';
}

let nextRun = 1;

/**
 * One optimization run's trials, kept in the analysis Worker. The page appends trials as they
 * arrive; each reaches the Worker once, with the next view, and every view is analysed there from
 * the trials it holds, so only the summary crosses back. The run keeps its own references to the
 * trials: summary positions index `trials`, and a Worker that lost the run to a cancel or crash is
 * sent all of them again, once.
 */
export class AnalysisRun {
  readonly id = nextRun++;
  readonly #client: AnalysisClient;
  #trials: [OptimizationTrial[], OptimizationTrial[]] = [[], []];
  #sent: [number, number] = [0, 0];
  #opened = false;
  #closed = false;

  constructor(client: AnalysisClient) {
    this.#client = client;
  }

  /** Range-0 trials (the full range, or IS) in the order summary positions refer to. */
  get trials(): readonly OptimizationTrial[] {
    return this.#trials[0];
  }

  /** Trials appended to a range so far. */
  count(range: 0 | 1): number {
    return this.#trials[range].length;
  }

  /** Keep trials of range 0 (the full range, or IS) or 1 (OOS); no message is sent yet. */
  append(range: 0 | 1, trials: readonly OptimizationTrial[]): void {
    if (!this.#closed) this.#trials[range].push(...trials);
  }

  /** Send the trials appended since the last view, then analyse everything the run holds. */
  async view(
    view: AnalysisRunView,
    summary: OptimizerSummaryRequest = {},
  ): Promise<OptimizerSummary> {
    for (let attempt = 0; ; attempt++) {
      if (this.#closed) throw new WorkerCancelledError();
      const requests: Promise<unknown>[] = [];
      if (!this.#opened) {
        this.#opened = true;
        this.#sent = [0, 0];
        requests.push(this.#client.request('runOpen', { run: this.id }));
      }
      for (const range of [0, 1] as const) {
        const fresh = this.#trials[range].slice(this.#sent[range]);
        if (!fresh.length) continue;
        this.#sent[range] = this.#trials[range].length;
        requests.push(this.#client.request('runAppend', { run: this.id, range, trials: fresh }));
      }
      const answer = this.#client.request('runView', { run: this.id, view, summary });
      const settled = await Promise.allSettled([...requests, answer]);
      const failure = settled.find((item) => item.status === 'rejected');
      if (!failure) return (settled.at(-1) as PromiseFulfilledResult<OptimizerSummary>).value;
      if (attempt || !runUnknown(failure.reason)) throw failure.reason;
      this.#opened = false;
    }
  }

  /** Let the Worker drop the run; later views reject. */
  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#trials = [[], []];
    if (this.#opened) this.#client.request('runClose', { run: this.id }).catch(() => {});
  }
}
