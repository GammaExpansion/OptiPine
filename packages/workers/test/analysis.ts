import { AnalysisWorkerClient } from '../src/analysis-client.ts';
import { handleAnalysisRequest } from '../src/analysis-dispatcher.ts';
import type {
  AnalysisRequest,
  AnalysisResponse,
  AnalysisWorkerTransport,
} from '../src/analysis-protocol.ts';

/** Test-only dispatcher transport with the browser worker's asynchronous clone boundaries. */
export class ControlledAnalysisWorker implements AnalysisWorkerTransport {
  onmessage: AnalysisWorkerTransport['onmessage'] = null;
  onerror: AnalysisWorkerTransport['onerror'] = null;
  onmessageerror: AnalysisWorkerTransport['onmessageerror'] = null;
  readonly requests: AnalysisRequest[] = [];
  terminated = false;

  postMessage(message: AnalysisRequest): void {
    if (this.terminated) throw new Error('Analysis worker has been terminated');
    this.requests.push(structuredClone(message));
  }

  respond(response: AnalysisResponse): void {
    this.onmessage?.(new MessageEvent('message', { data: structuredClone(response) }));
  }

  terminate(): void {
    this.terminated = true;
  }
}

export class LocalAnalysisWorker extends ControlledAnalysisWorker {
  override postMessage(message: AnalysisRequest): void {
    super.postMessage(message);
    const request = this.requests.at(-1)!;
    queueMicrotask(() => {
      if (this.terminated) return;
      this.respond(handleAnalysisRequest(request));
    });
  }
}

export function createTestAnalysisClient(): AnalysisWorkerClient {
  return new AnalysisWorkerClient(() => new LocalAnalysisWorker());
}
