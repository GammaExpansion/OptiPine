# Development component sheet

From the repository root, run `npm run dev --workspace @pine/web` and open `/sheet.html`.
The first section follows G5 at 1440 × 1120. Additional states below it exercise grouped selects,
source-value overflow, notes, B9/B16 banners, tables, empty states, page/dock/provider tabs, all
icons, and S3/B13/R10/R11 compositions. Switch language beneath the reference section.

The controls edit local demo state. Examples do not fetch market data, run strategies, or export
files. `sheet.html` is an extra entry in the isolated e2e build alongside `e2e/harness.html`,
and is absent from the production build. Its entry accepts development or e2e mode only.

```sh
npm run test --workspace @pine/web
npm run typecheck
npm run format:check
npm run e2e --workspace @pine/web
```

The main Playwright suite runs `e2e/sheet.spec.ts` against the e2e preview on port 5175, using
the same setup and teardown as the app smoke tests. CI checks English and Chinese at 1440 × 1120,
1024 × 768 and 390 × 844, and exercises keyboard selection, symbol suggestions, focus trapping,
Escape, popovers and toast actions. The G5 check renders the reference with the built app's
self-hosted fonts and compares section geometry within a 2px tolerance in the same browser run.
Both screenshots are attached for visual review, avoiding pixel baselines that depend on the OS.
Screenshots and measured heading positions go into the suite's ignored `apps/web/test-results/`
directory. The check also verifies that the production server returns 404 for `/sheet.html`.

Visual comparison against G5-en at 1440 × 1120: all four measured section heading positions and
widths match exactly. Control dimensions, surface colours, typography, menus and toast wrapping
match. Remaining deliberate differences are SVG plus/minus steppers instead of text glyphs,
disabled boundary steppers, larger focusable chip-removal targets, and animated spinners. Extra
components live below the reference section; narrow layouts wrap instead of cropping the board.
The date examples use native date inputs, whose display and picker follow the browser locale,
while their values remain ISO dates. The static G5 toast examples mirror the board; the live
queue adds a Close button. The mock's eight-step heatmap swatch is retained for visual reference;
the nine-step chart ramp in WEB.md is outside this component task.

Implementation choices where the design leaves details open: number-field pages are ten steps,
invalid drafts belong to the caller, toast delivery is FIFO with a five-second default, and dialogs
have 440/680/880px width presets constrained to the viewport. Examples are compositions of the
primitives, not completed product dialogs.
