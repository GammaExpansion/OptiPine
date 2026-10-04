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
  #epoch = 0;
  #pending = new Map<
    number,
    { kind: keyof AnalysisJobs; resolve: (output: unknown) => void; reject: (error: Error) => void }
  >();
  /** `factory` creates the module Worker whose entry calls `serveAnalysisWorker`. */
  constructor(factory: AnalysisWorkerFactory) {
    this.#factory = factory;
  }

  get epoch(): number {
    return this.#epoch;
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
    ++this.#epoch;
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
  #viewTail: Promise<unknown> | null = null;

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
  view(view: AnalysisRunView, summary: OptimizerSummaryRequest = {}): Promise<OptimizerSummary> {
    const counts = [this.count(0), this.count(1)] as const;
    const epoch = this.#client.epoch;
    const perform = () => this.#view(view, summary, counts, epoch);
    // Serial views cannot resend an unacknowledged prefix. Capture the boundary at call time.
    const answer = this.#viewTail ? this.#viewTail.then(perform, perform) : perform();
    this.#viewTail = answer;
    const clear = () => {
      if (this.#viewTail === answer) this.#viewTail = null;
    };
    void answer.then(clear, clear);
    return answer;
  }

  async #view(
    view: AnalysisRunView,
    summary: OptimizerSummaryRequest,
    counts: readonly [number, number],
    epoch: number | undefined,
  ): Promise<OptimizerSummary> {
    const current = () => {
      if (this.#closed || this.#client.epoch !== epoch) throw new WorkerCancelledError();
    };
    for (let attempt = 0; ; attempt++) {
      current();
      const requests: Promise<unknown>[] = [];
      const flush = async () => {
        const settled = await Promise.allSettled(requests.splice(0));
        const failure = settled.find((item) => item.status === 'rejected');
        if (failure) throw failure.reason;
        current();
        return settled;
      };
      try {
        if (!this.#opened) {
          this.#opened = true;
          this.#sent = [0, 0];
          requests.push(
            this.#client.request('runOpen', { run: this.id }).catch((error) => {
              this.#opened = false;
              throw error;
            }),
          );
        }
        let taskTrials = 0;
        for (const range of [0, 1] as const) {
          let start = this.#sent[range];
          while (start < counts[range]) {
            if (taskTrials === 100) {
              await flush();
              // A microtask does not let input/rendering run. Bound each host task's cloning.
              await new Promise<void>((resolve) => setTimeout(resolve, 0));
              current();
              taskTrials = 0;
            }
            const end = Math.min(start + 100 - taskTrials, counts[range]);
            const trials = this.#trials[range].slice(start, end);
            requests.push(
              this.#client.request('runAppend', { run: this.id, range, trials }).then(() => {
                this.#sent[range] = end;
              }),
            );
            taskTrials += end - start;
            start = end;
          }
        }
        requests.push(this.#client.request('runView', { run: this.id, view, summary }));
        const settled = await flush();
        return (settled.at(-1) as PromiseFulfilledResult<OptimizerSummary>).value;
      } catch (error) {
        if (this.#closed) throw new WorkerCancelledError();
        if (attempt || !runUnknown(error)) throw error;
        current();
        this.#opened = false;
      }
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
