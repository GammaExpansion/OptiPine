# Walk-forward results

`../WfSummary.tsx`, `../WfTable.tsx`, `../FixedParameters.tsx` and `../WfSelectionBar.tsx`
fill the existing Optimize page slots. They read `WalkForwardView` from the optimization store.
`SummaryChart.tsx` and `draw.ts` draw the supplied stitched or per-window equity on canvas;
`geometry.ts` projects the actual bar times and breaks lines at unavailable samples. No component
stitches equity, ranks trials, chooses parameters or subscribes to individual trial events.

## Workflow integration

`actions.ts` expects these additions to `state/optimization.ts`'s bound session actions:

```ts
selectWindow(index: number): void;
applyFixedParameters(): void;
previewWindow(index: number): Promise<void>;
```

Indices are zero-based `WindowPlan.index`, not array positions. Selection should publish a new
`walkForward.selection` and synchronize the window map. Applying uses the current `fixed.parameters`
and `fixed.origin` through Backtest's apply workflow. Preview uses the selected window's set and
`selection.origin` through Backtest's preview workflow, including navigation to Backtest. The
workflow owns errors and preserves current inputs when previewing. Pending recomputation disables
preview and apply; missing methods disable their controls. Flat, failed and unfinished windows
cannot preview.

These existing store actions are called directly:

```ts
setObjective(objective: ObjectiveId): void;
setDirection(direction: Direction): void;
removeFilter(index: number): void;
```

The shared `AddConditionTrigger` also expects the existing
`setDraftFilter(draft: FilterCondition | null): void` and `addFilter(filter: FilterCondition): void`.
Its `ConditionPopover` body is still a stub in this checkout. The shared trigger is mounted unchanged;
completing R10 remains with its owner. **Adjust** selects the flat window and focuses this table's
objective/filter controls; it does not discard filters or start a run.

`fixture.ts` extends the existing stability fixture with dated IS/OOS series, a fixed set and W1,
W4 and W5 scenarios. `fixture-store.ts` installs it through the real store and records action calls.
It changes canned display data only: preview/apply are recorded, not simulated Backtest runs.
Neither fixture module is imported by the production app. The existing stability fixture's mean
surface now differs from W3 numerically, making the surface-change pixel check deterministic.

## Display decisions and visual review

- W1/W2/W4/W5 were reviewed at 1440 × 900 in English and Chinese, using local fonts. Headers,
  window lanes, selected-row wash, 30 px rows, fixed card and selection bar follow the boards.
- WEB.md 2.6 takes precedence over W4's partial totals: completed windows remain visible, while
  the summary and total row withhold final aggregates until every window is done.
- Window boundaries are half-open UTC seconds; displayed end dates are inside those boundaries.
  Per-window curves share one equity scale within each lane. Across lanes they autoscale separately.
  Null/nonfinite stitched samples break the curve; zero and a missing figure remain distinct.
- Parameter titles and options remain script data. Booleans, copy and accessible labels come from
  the catalogs. Numbers retain their supplied precision instead of assuming that an input named
  Multiplier always has two decimals. Long sets wrap; narrow/short panes scroll internally.
- The summary keeps the requested title and totals in both modes. Final partial windows are always
  marked, including W1. The selected window's IS range is available on its range tooltip, alongside
  the visible OOS range. Lane and row buttons support keyboard selection.
- The existing data-range bar places the summary 44 px lower than the boards. The test hook marks
  a running results area to mount the unfinished workflow, so the shared header/sidebar/run block
  show that harness state. These regions were not changed. Synthetic curve shapes and tick levels
  differ from the mock's hand-drawn data.

## Verification

From the repository root:

```sh
npm run build
npm run typecheck --workspaces
npm run test --workspace @pine/web
npm run format:check
npm run e2e --workspace @pine/web -- --workers=2
```

Focused checks from `apps/web`:

```sh
npx vitest run src/pages/optimize/walkforward
npx playwright test e2e/wf-results.spec.ts e2e/wf-stability.spec.ts --workers=2
```

The 14 new unit tests cover formatting, date boundaries, actual bar-time projection, null gaps,
flat scales, canvas strokes, fixture integrity, selection, ranking/filters, preview/apply calls,
pending/live/flat/failed states, both languages and missing actions. All 22 walk-forward unit tests
pass. The two new browser tests fix the clock, block external and `/api/market` requests, mount the
real slots through the fixture hook, compare canvas pixels, exercise keyboard/row selection,
preview/apply calls and Adjust, and check overflow and console errors. They save W1/W2/W4/W5 images
for each language in `apps/web/test-results/wf-results-*/`.

Build, workspace typechecks, formatting, 125 Node tests and 314 Vitest tests pass. The full browser
suite passes 50/51; only the acknowledged S1 byte budget fails (about 870 KB against 866 KB).
The focused results/stability browser suite passes 4/4. A real walk-forward run and actual
preview/apply integration still require the pending workflow.
