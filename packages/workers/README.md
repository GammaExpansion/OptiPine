# @pine/workers

Run `@pine/engine` and `@pine/optimizer` in Web Workers so the page only renders. A synchronous
engine run cannot be interrupted, so every client cancels by terminating its Worker and starting a
fresh one; late replies from an old Worker or an old source revision are discarded.

## Clients

| Export                   | Purpose                                                                                                                                                                                                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EngineWorkerClient`     | `describe` and `run` (`runWithEquity`) in one Worker, correlated by request id. `setSourceRevision` rejects pending work with `WorkerStaleError`; `cancel` rejects it with `WorkerCancelledError`.                                                                                |
| `OptimizationWorkerPool` | `optimize(source, common, parameterSets, options)` streams trials through `onTrial`; `reproduce(source, common, parameters)` reruns one set with `runWithEquity` in a Worker of its own.                                                                                          |
| `AnalysisWorkerClient`   | Typed jobs for the heavy `@pine/optimizer` computations: `view`, `plan` (window bounds and bar indices from bar times), `records`, `parameters`, `choose`, `finalize` and `stability`, and the run jobs behind `AnalysisRun`.                                                     |
| `AnalysisRun`            | One optimization run held in the analysis Worker: `append` keeps trials as they arrive, `view` sends only those not sent yet and answers with `summarizeOptimizerAnalysis`'s summary, whose positions index `trials`; a restarted Worker is sent the run again. `close` drops it. |

The pool calibrates on one trial, then grows to `availableWorkerCount()` Workers, one per thread
less one (`workerCount` overrides) and never more than the trials left, with chunks of about one
second each, at most `chunkSize` (256). `onProgress` reports progress with the time left.

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

`serveAnalysisWorker` does the same for the analysis client, with an `AnalysisRuns` store for the
runs its Worker holds. `handleEngineWorkerRequest`, `handleOptimizationWorkerRequest` and
`handleAnalysisRequest` are the dispatchers behind them, and the protocol types describe every
message. A factory may return any object with `postMessage`, `terminate` and the three handlers,
which is how the tests run without a browser.

Errors cross the Worker boundary with `serializeError` / `restoreError` from
[@pine/messages](../messages/README.md); the ids this package emits are in `workerMessageIds`.

### Live analysis and reproduction lifetime

`AnalysisRun.view` captures both range lengths at call time. It sends unsent trials in batches
of at most 100 trials per host task across both ranges, acknowledges each batch before advancing
its sent position, and yields between batches. Small range suffixes can share the same task.
`runView` is queued only after all captured trials have been posted.
Concurrent views are serialized; trials arriving during a flush belong to the next view.
A failed post leaves its suffix unsent, and an unknown run reopens and replays both ranges
once. Close prevents further posts. `AnalysisWorkerClient.epoch` changes on cancellation or
crash so a flush also stops while yielding with no request pending. Custom clients should
expose that optional epoch if they support cancellation between requests.

`OptimizationWorkerPool.reproduce` treats each `common` object as one immutable run snapshot:
it clones that object once, reuses idle reproduction Workers, and sends the full snapshot to
each Worker only on its first use (or when the snapshot/source/revision changes). Subsequent
requests send only parameter overrides. Initial transfers are staggered across host tasks,
so launching Top 20 does not clone every input in one task. Use a new `common` object for a new
snapshot; later mutations of an already captured object do not change its saved input.

Each active reproduction owns its Worker, so an AbortSignal terminates only that request.
Completed Workers remain reusable until pool cancellation, the next optimization, or disposal;
those operations terminate active and idle Workers and release saved inputs. Requests waiting
for a host turn also check cancellation before creating a Worker. The per-Worker snapshot lives
in `EngineWorkerState`, owned by `serveEngineWorker`; custom transports calling the dispatcher
must pass one state object per Worker to reproduce the same lifetime.

## Development

```sh
npm run build -w @pine/workers
npm run test -w @pine/workers
```
