# Parameter map and sensitivity

`MapPanel.tsx` and `../sensitivity/SensitivityPanel.tsx` are the Optimize page's map and
sensitivity regions. They read optimization snapshots and call the stable store actions. The workflow supplies all
aggregation, rank bins, smoothing, surfaces, selection, cell values, bin detail, curve values and
sensitivity. View changes never start optimization.

- `src/charts/optimize/` owns the map and single-input canvas renderers, drawing at device pixel
  ratio. A viewport-sized canvas draws visible Z layers; React never reconciles heatmap cells.
  Geometry keeps 2 px gaps and 16 px squares, which a sparse single-layer map grows to fill its
  panel (up to a 40 px pitch); the full-resolution detail keeps 16 px.
- `CellValuesTable.tsx` shows IS/OOS and workflow means. Large bins mount only the visible rows.
  The hover remains open while the pointer enters its scrollable list. Live bins show the available
  aggregate and explain that individual values arrive after completion.
- `MapInspection.tsx` uses the lower map-column slot for R7 detail and R8 figures, as the boards do.
  `inspection.ts` holds only transient inspection; unmount clears it, and a new map invalidates it.
- `../sensitivity/` draws share bars and SVG means/interquartile spreads using the workflow's shared
  scale. Pointer capture and keyboard moves share one transaction: Space picks up, arrows move,
  Enter commits, Escape cancels. Focus follows the moved axis after analysis; a live region
  announces pickup, target, completion and cancellation.

## Visual decisions

Compared R1, R4, R6–R8 and R12 at 1440 × 900 in English and Chinese. Synthetic results differ from
the mock's fixed examples.

The workflow assigns nine rank steps while the mock/tokens supply eight heat colors. The existing
neutral divider color is inserted between the three loss colors and five profit colors, and marks
the objective's break-even: losing cells take the loss colors and winning cells the profit colors
(WEB.md 2.5). `LegendRamp` shows only the sides the cells fall on. Numeric detail cells use
compact amounts, with precise amounts in the value list. Input titles remain the script's own
titles, so long titles wrap the controls instead of being shortened to the mock's handwritten
aliases. Z layers scroll within the canvas viewport; pane sizes remain owned by Split.

The map fits its panel: `fitMap` in `src/charts/optimize/geometry.ts` bins each axis again with
`prepareHeatmap` to as many cells as fit the panel's width and height, at most 24, so a narrow
pane averages more values per cell instead of scrolling. The walk-forward window map and the bin
detail keep the analysis's 24-value bins and scroll.

## Verification

From the repository root:

```sh
npm run build
npm run typecheck --workspaces
npm run test --workspace @pine/web
npm run format:check
npm run e2e --workspace @pine/web
```

Focused checks, from `apps/web`:

```sh
npx vitest run src/charts/optimize src/pages/optimize/map src/pages/optimize/sensitivity
npx playwright test e2e/optimize-map.spec.ts --workers=2
```

The browser tests use the dev server owned by the existing Playwright setup and the real Worker
pool. They open a script and synthetic bars and start a nine-combination grid and a dense grid
through store actions. The clock and synthetic dataset are fixed; route
interception refuses external requests and `/api/market`. Screenshots under `test-results/` include
hover, detail, layers, pointer drag and the one-input curve in both languages. Assertions cover
canvas pixel changes, changed smoothed values, stable run identity after view changes, selection,
axis focus restoration and absence of page overflow and browser errors.
