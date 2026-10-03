# Walk-forward stability

`../WfStability.tsx` fills the existing W1/W3 slot. It reads `walkForward` from the optimization
store. `StabilityRows` draws the workflow's `StabilityRow` bands and common intervals as SVG;
`WindowMap` passes the workflow's `WindowMapView.panel` to the existing `HeatmapCanvas`. No
optimization, ranking, tolerance calculation or map aggregation runs in these components.

## Integration with the pending workflow

This checkout only has the view contract: its session publishes `walkForward: null`, and the
store has no walk-forward actions. `actions.ts` isolates the three expected additions:

- `setStabilityTolerance(fraction)`; 10% is `0.1`, and only stability should recompute.
- `setWindowMapSurface('window' | 'mean')`.
- `selectWindow(index)`; indices are the contract's zero-based `WindowPlan.index`.

The adapter reads these methods from the existing store actions without editing the store or
session. Missing actions disable the corresponding controls. If the workflow uses other names,
change the adapter when integrating; bind the methods in `state/optimization.ts` alongside the
other actions. X/Y/Z and slice controls already call `setAxis` and `setSlice`.

`fixture.ts` builds deterministic six-window views. `fixture-store.ts` installs them through the
real store and records actions, returning a restore function. Tests dynamically import this hook;
neither file is imported by the production app. The hook changes canned display data only and is
not a replacement for the pending Worker workflow. A real walk-forward run remains to be tested
when that workflow lands.

## Display choices and visual review

Compared W1 and W3 at 1440 × 900 in English and Chinese, with local fonts. The shared 160 px text
column, 64 px strips, window headers, common-range wash, selected column and chosen dots follow
W1. Each input uses one scale across all windows; disjoint near-optimal sets stay disjoint.
Numeric values use their numeric positions; options and booleans use declaration order. Null
picks have no dot. Long labels wrap, and short panels scroll internally.

The tolerance menu offers 5%, 10%, 15% and 20%, plus a custom value if supplied by the workflow.
An empty intersection says “No common range”. Pending tolerance updates retain the previous bands.

W3 adds the requested window selector, axis/slice controls and window labels to the mock's map.
Picks in the same cell share a circle and a combined label; the selected pick makes its circle
amber. Clicking a cell selects its first matching window; the window selector can reach all picks
sharing that cell. Keyboard inspection and selection use the same canvas path. Cells remain
16 px squares with 2 px gaps, using the existing nine-step ramp and internal scrolling.

Other walk-forward slots are stubs here, so screenshot summary/table/selection areas are empty.
The existing data-range bar also places the panel 44 px below the mock. Synthetic map values,
categorical bands and numeric precision follow the fixture/contract, rather than copying the
mock's handwritten numbers. No layout outside this slot was edited.

## Verification

From the repository root:

```sh
npm run build
npm run typecheck --workspaces
npm run test --workspace @pine/web
npm run format:check
npm run e2e --workspace @pine/web -- --workers=2
```

Focused tests from `apps/web`:

```sh
npx vitest run src/pages/optimize/walkforward/stability src/charts/optimize
npx playwright test e2e/wf-stability.spec.ts --workers=2
```

Playwright fixes the clock, denies external and `/api/market` requests, mounts the real Optimize
page slots through the fixture store, and checks tolerance actions, surface pixel changes, window
selection, keyboard inspection, both languages, console errors and overflow. It saves `W1-en.png`,
`W3-en.png`, `W1-zh.png` and `W3-zh.png` in its per-test directories under `test-results/`.

Build, workspace typechecks, Node tests, all 300 Vitest tests and formatting pass. The full browser
suite passes 48/49, including both new tests. The sole failure is the existing S1 first-load budget
in `e2e/results.spec.ts`: 867,855 bytes versus 866,000. An isolated build of the original HEAD
sources also fails that limit at 866,201 bytes. These changes add 1,654 bytes, all from the required
English catalog; the test confirms Optimize remains lazy. The budget test is outside this task's
owned paths and is unchanged.
