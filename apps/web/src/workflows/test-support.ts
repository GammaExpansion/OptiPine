import type { MarketBar } from '@pine/engine';
import { handleEngineWorkerRequest, EngineWorkerClient } from '@pine/workers';
import type {
  EngineWorkerRequest,
  EngineWorkerResponse,
  EngineWorkerTransport,
} from '@pine/workers';

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
