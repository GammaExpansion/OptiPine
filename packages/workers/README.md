# @pine/workers

Run `@pine/engine` and `@pine/optimizer` in Web Workers so the page only renders. A synchronous
engine run cannot be interrupted, so every client cancels by terminating its Worker and starting a
fresh one; late replies from an old Worker or an old source revision are discarded.

## Clients

| Export                   | Purpose                                                                                                                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EngineWorkerClient`     | `describe` and `run` in one Worker, correlated by request id. `setSourceRevision` rejects pending work with `WorkerStaleError`; `cancel` rejects it with `WorkerCancelledError`.                   |
| `OptimizationWorkerPool` | `optimize(source, common, parameterSets, options)` calibrates on one trial, then grows to `hardwareConcurrency - 1` Workers with chunks of about one second each. Trials stream through `onTrial`. |
| `AnalysisWorkerClient`   | Typed jobs for the heavy `@pine/optimizer` computations: `view`, `plan`, `records`, `parameters`, `choose`, `finalize` and `stability`.                                                            |

Each client takes a factory that creates the Worker. The Worker entry module is one call:

```ts
// engine.worker.ts
import { serveEngineWorker } from '@pine/workers';
serveEngineWorker(self);
```

```ts
// main thread, with Vite or another bundler that understands new URL(…, import.meta.url)
import { EngineWorkerClient } from '@pine/workers';

const client = new EngineWorkerClient(
  () => new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' }),
);
const description = await client.describe(source);
```

`serveAnalysisWorker` does the same for the analysis client. `handleEngineWorkerRequest`,
`handleOptimizationWorkerRequest` and `handleAnalysisRequest` are the dispatchers behind them,
and the protocol types describe every message. A factory may return any object with
`postMessage`, `terminate` and the three handlers, which is how the tests run without a browser.

Errors cross the Worker boundary with `serializeError` / `restoreError` from
[@pine/messages](../messages/README.md); the ids this package emits are in `workerMessageIds`.

## Development

```sh
npm run build -w @pine/workers
npm run test -w @pine/workers
```
