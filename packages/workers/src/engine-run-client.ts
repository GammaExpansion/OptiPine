import type { ParameterSet, RunInput, ScriptDescription } from '@pine/engine';
import { restoreError, TextError, type Text } from '@pine/messages';
import type { TrialResult } from '@pine/optimizer';
import { workerError, workerMessage } from './messages.ts';
import type { PackedRunInput } from './run-input.ts';
import type {
  EngineWorkerFactory,
  EngineWorkerRequest,
  EngineWorkerResponse,
  EngineWorkerTransport,
} from './protocol.ts';

export class WorkerCancelledError extends TextError {
  constructor(message: Text = workerMessage('runCancelled')) {
    super(message);
    this.name = 'WorkerCancelledError';
  }
}

export class WorkerStaleError extends TextError {
  constructor() {
    super(workerMessage('sourceChangedIgnored'));
    this.name = 'WorkerStaleError';
  }
}

export class WorkerCrashedError extends TextError {
  constructor(message: Text = workerMessage('engineWorkerCrashed')) {
    super(message);
    this.name = 'WorkerCrashedError';
  }
}

interface PendingRequest {
  kind: EngineWorkerRequest['kind'];
  sourceRevision: number;
  resolve: (value: ScriptDescription | TrialResult) => void;
  reject: (reason: Error) => void;
}

/** Correlates responses without importing or executing the engine on the main thread. */
export class EngineRunClient {
  readonly #factory: EngineWorkerFactory;
  readonly #pending = new Map<number, PendingRequest>();
  #worker: EngineWorkerTransport | null = null;
  #generation = 0;
  #nextRequestId = 1;
  #sourceRevision = 0;
  #disposed = false;

  /** `factory` creates the module Worker whose entry calls `serveEngineWorker`. */
  constructor(factory: EngineWorkerFactory) {
    this.#factory = factory;
    this.#startWorker();
  }

  get sourceRevision(): number {
    return this.#sourceRevision;
  }

  get pendingCount(): number {
    return this.#pending.size;
  }

  /** Revisions are monotonic; editing invalidates responses before another request is made. */
  setSourceRevision(sourceRevision: number): void {
    if (!Number.isSafeInteger(sourceRevision) || sourceRevision < 0) {
      throw workerError('invalidSourceRevision', {}, RangeError);
    }
    if (sourceRevision < this.#sourceRevision) throw new WorkerStaleError();
    if (sourceRevision === this.#sourceRevision) return;
    this.#sourceRevision = sourceRevision;
    const wasBusy = this.#pending.size > 0;
    this.#rejectPending(new WorkerStaleError());
    if (wasBusy) this.#restartWorker();
  }

  describe(source: string, sourceRevision = this.#sourceRevision): Promise<ScriptDescription> {
    return this.request<ScriptDescription>({ kind: 'describe', source }, sourceRevision);
  }

  run(
    source: string,
    input: RunInput,
    sourceRevision = this.#sourceRevision,
  ): Promise<TrialResult> {
    return this.request<TrialResult>({ kind: 'run', source, input }, sourceRevision);
  }

  /** Synchronous engine execution is interrupted by terminating its worker, never by a flag. */
  cancel(): void {
    if (this.#disposed) return;
    this.#rejectPending(new WorkerCancelledError());
    this.#restartWorker();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#rejectPending(new WorkerCancelledError(workerMessage('engineWorkerClosed')));
    this.#stopWorker();
  }

  protected request<T extends ScriptDescription | TrialResult>(
    payload:
      | { kind: 'describe'; source: string }
      | { kind: 'run'; source: string; input: RunInput }
      | {
          kind: 'reproduce';
          source: string;
          common?: RunInput | PackedRunInput;
          parameters: ParameterSet;
        },
    sourceRevision: number,
    transfer: Transferable[] = [],
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (this.#disposed) {
        reject(new WorkerCancelledError(workerMessage('engineWorkerClosed')));
        return;
      }
      try {
        this.setSourceRevision(sourceRevision);
        if (!this.#worker) this.#startWorker();
        const requestId = this.#nextRequestId++;
        this.#pending.set(requestId, {
          kind: payload.kind,
          sourceRevision,
          resolve: (value) => resolve(value as T),
          reject,
        });
        try {
          this.#worker!.postMessage({ ...payload, requestId, sourceRevision }, transfer);
        } catch (error) {
          this.#pending.delete(requestId);
          reject(error);
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  /** Subclasses release Worker-owned caches on cancel, crash and disposal. */
  protected onWorkerStopped(): void {}

  #startWorker(): void {
    const worker = this.#factory();
    const generation = ++this.#generation;
    this.#worker = worker;
    worker.onmessage = (event) => {
      if (this.#disposed || generation !== this.#generation) return;
      this.#receive(event.data);
    };
    worker.onerror = (event) => {
      event.preventDefault?.();
      this.#crashed(generation, event.message || workerMessage('engineWorkerCrashed'));
    };
    worker.onmessageerror = () => {
      this.#crashed(generation, workerMessage('engineWorkerUnreadable'));
    };
  }

  #receive(response: EngineWorkerResponse): void {
    const pending = this.#pending.get(response.requestId);
    if (
      !pending ||
      pending.sourceRevision !== response.sourceRevision ||
      response.sourceRevision !== this.#sourceRevision
    )
      return;
    this.#pending.delete(response.requestId);
    if (response.kind === 'failed') {
      const error = restoreError(response.error);
      error.name = response.error.name;
      pending.reject(error);
    } else if (response.kind === 'described' && pending.kind === 'describe') {
      pending.resolve(response.description);
    } else if (
      response.kind === 'ran' &&
      (pending.kind === 'run' || pending.kind === 'reproduce')
    ) {
      pending.resolve(response.result);
    } else {
      pending.reject(workerError('engineWorkerResponseMismatch'));
    }
  }

  #crashed(generation: number, message: Text): void {
    if (this.#disposed || generation !== this.#generation) return;
    this.#rejectPending(new WorkerCrashedError(message));
    this.#restartWorker();
  }

  #rejectPending(error: Error): void {
    for (const pending of this.#pending.values()) pending.reject(error);
    this.#pending.clear();
  }

  #stopWorker(): void {
    this.onWorkerStopped();
    ++this.#generation;
    if (!this.#worker) return;
    this.#worker.onmessage = null;
    this.#worker.onerror = null;
    this.#worker.onmessageerror = null;
    this.#worker.terminate();
    this.#worker = null;
  }

  #restartWorker(): void {
    this.#stopWorker();
    try {
      this.#startWorker();
    } catch {
      // A later request retries creation and reports the browser's actual startup error.
    }
  }
}
