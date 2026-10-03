import { restoreError, type Text } from '@pine/messages';
import { workerError, workerMessage } from './messages.ts';
import { WorkerCancelledError, WorkerCrashedError } from './client.ts';
import type {
  AnalysisClient,
  AnalysisJobs,
  AnalysisRequest,
  AnalysisWorkerFactory,
  AnalysisWorkerTransport,
} from './analysis-protocol.ts';
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
