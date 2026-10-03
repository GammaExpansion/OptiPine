# App state

Use `useBacktestStore`, `useMarketDataStore` and `useOptimizationStore` with a selector for the
value a component displays. Actions are stable under `state.actions`; select them the same way.
Select individual fields (or use Zustand's `useShallow` for a group), not a newly allocated object
or the whole store. The workflow owns each snapshot and every calculation; these stores only
bridge subscriptions and record provenance. Optimization snapshots never publish to Backtest.

- `openScript({ source, fileName, origin })` and `loadExample(id)` are shared exports from
  `backtest.ts`. A pasted script can use `fileName: null`. Origins are `{ kind: 'pasted' }`,
  `{ kind: 'file' }` or `{ kind: 'example', id }`. `actions.setSource` edits the current script
  without changing its identity.
- Market `actions.fetch` and `retry` prepare a preview. `actions.accept()` installs the validated
  preview in Backtest and records `{ kind: 'provider', request }`. `actions.useCsv(input, fileName)`
  installs an input already validated by the CSV workflow, cancels pending provider work and records
  `{ kind: 'csv', fileName }`. Consumers should use these actions rather than calling the session's
  `setDataset` directly, so provenance follows the accepted dataset.
- Loading an example opens its source immediately and accepts its successful data request. Missing
  service and provider refusals open the market data dialog for recovery. A subsequent script or
  market selection supersedes that acceptance. This does not start a backtest.
- `getServices()` lazily owns the three sessions, the three Worker clients/pool and the feed client.
  `main.tsx` disposes them on page exit and hot replacement. Pages held in the back/forward cache
  retain their services. Store subscriptions share this lifetime, not a component's mount lifetime.
- Tests call `replaceServices(() => createServices(options))` before mounting, inject Worker
  factories, fetch, cache and clock, then unmount subscribers and call the returned cleanup.
  Store tests run in Vitest: this layer imports React and Vite's raw example sources. Node tests
  keep importing the framework-free workflows and catalogs directly.

Page slots intentionally retain the scaffold's empty states. `shell/DialogsRoot.tsx` is the single
mount point driven by `ui.openDialogs`; phase 2 adds the `dialogs/` components to its slot map.
`registerFilePicker(handler)` in `shell/shortcuts.ts` connects Ctrl+O to the file UI and returns
its unregister callback. Ctrl+Enter runs a ready Backtest page; editors and dialogs own their keys.
