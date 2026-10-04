# App state

Use `useBacktestStore`, `useMarketDataStore` and `useOptimizationStore` with a selector for the
value a component displays. Actions are stable under `state.actions`; select them the same way.
Select individual fields (or use Zustand's `useShallow` for a group), not a newly allocated object
or the whole store. The workflow owns each snapshot and every calculation; these stores only
bridge subscriptions and record provenance. Optimization snapshots never publish to Backtest.

- `openScript({ source, fileName, origin })` and `loadExample(id)` are shared exports from
  `backtest.ts`. A pasted script can use `fileName: null`. Origins are `{ kind: 'pasted' }`,
  `{ kind: 'file' }` or `{ kind: 'example', id }`. `actions.setSource` edits the current script
  without changing its identity. The stored origin adds `edited`, true while the source differs
  from the text that was opened; `confirmReplace` in `dialogs/script/actions.ts` asks before
  replacing such a script.
- Market `actions.fetch` and `retry` prepare a preview. `actions.accept()` installs the validated
  preview in Backtest and records `{ kind: 'provider', request }`. `actions.useCsv(input, fileName)`
  installs an input already validated by the CSV workflow, cancels pending provider work and records
  `{ kind: 'csv', fileName }`. Consumers should use these actions rather than calling the session's
  `setDataset` directly, so provenance follows the accepted dataset.
- Loading an example opens its source immediately and accepts its successful data request. Missing
  service and provider refusals open the market data dialog for recovery. A subsequent script or
  market selection supersedes that acceptance. This does not start a backtest.
- `getServices()` lazily owns the sessions, the Worker clients and pool and the feed client.
  `main.tsx` disposes them on page exit and hot replacement. Pages held in the back/forward cache
  retain their services. Store subscriptions share this lifetime, not a component's mount lifetime.
- The optimization side (its session, the pool, the analysis client and the optimization
  workflows) loads on first need: `services.loadOptimization()` imports `optimization-services.ts`
  and creates it once, and `services.optimization` is null until then. The Optimize page renders
  inside `useOptimizationLoaded()`, which starts the load, so `useOptimizationStore` always has a
  session there. The shell reads `useOptimizationPresence` (loaded, has results), which stays false
  until the side exists and never loads it, so the Backtest page's first screen carries none of it.
- Tests call `replaceServices(() => createServices(options))` before mounting, inject Worker
  factories, fetch, cache and clock, then unmount subscribers and call the returned cleanup. A test
  that reads the optimization store awaits `getServices().loadOptimization()` first, as
  `useOptimizeTestServices` and `loadOptimization` in `pages/optimize/test-support.tsx` do.
  Store tests run in Vitest: this layer imports React and Vite's raw example sources. Node tests
  keep importing the framework-free workflows and catalogs directly.

`shell/DialogsRoot.tsx` is the single mount point driven by `ui.openDialogs`. It loads the script,
replace-script, market data and date range dialogs, each in a chunk of its own on first use, and
`Shell` adds the strategy properties and failed-combinations dialogs through its `slots`.
`registerFilePicker(handler)` in `shell/shortcuts.ts` connects Ctrl+O to the script file picker
(`dialogs/script/ScriptFilePicker.tsx`) and returns its unregister callback. Ctrl+Enter runs a
ready Backtest page, or its preview; editors and dialogs own their keys.
