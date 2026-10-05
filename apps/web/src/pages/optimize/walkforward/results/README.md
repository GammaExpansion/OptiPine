# Walk-forward results

The four result slots read the real optimization store: WfSummary, WfTable, FixedParameters and
WfSelectionBar. SummaryChart and draw project the workflow's equity and actual bar timestamps onto
canvas. Components do not rank trials, choose sets, stitch equity or subscribe per trial.

The shared WfSummary opens on **Per window** on desktop and phone (G4). The switch still offers
**Stitched** and **Per window**, in that order. Changing tabs on a phone keeps the summary mounted
and preserves the chosen view. Tests and screenshot helpers select Stitched explicitly when
capturing its W1 reference.

Per window uses W2's **Windows and equity** title, total OOS profit and IS/OOS swatches with the
lane-reading hint. Phones omit the long hint so the swatches and switch fit. Stitched keeps its
title, WFE and profitable-window facts. Both views show only progress in place of final facts
until every window is done.

## Integration

The pending adapters are removed. The bound session actions are:

- selectWindow(window: number | null): void: zero-based; null restores the default finished window.
- previewWindow(): Promise<void>: previews the selected window. The selection bar explicitly selects
  its window first, calls this action, and switches the UI to Backtest.
- applyFixedParameters(): Promise<void>: applies the workflow's fixed set and provenance. The card
  calls this action and switches the UI to Backtest.
- setObjective, setDirection and removeFilter remain direct store calls. AddConditionTrigger owns
  the shared filter popover and its existing draft/add actions.

Pending recomputation disables preview/apply. Flat, failed and unfinished windows cannot preview.
Final totals and the fixed card wait for all windows (WEB.md 2.6). Errors retain the previous data
and appear above the chart. The IS legend names anchored results; outdated results use their run's
validation snapshot. A tiny partial final window does not overlap the preceding result label.

The fixtures and fixture-store are imported only by tests. Their actions match the real signatures;
selection uses the workflow's windowSelection helper, while preview/apply only record calls.
There is no fixture route, branch or import in production code.

## Copy and first-load budgets

WF results copy lives in `i18n/optimize-en.ts` and `optimize-zh.ts`, loaded with the Optimize page.
Shared window labels stay in core because Backtest also uses them. The English core catalog is
19,851 bytes with a 26,000-byte S1 budget. The independent code and entry budgets remain unchanged
in `e2e/results.spec.ts`.

## Verification

From the repository root:

    npm run build
    npm run typecheck --workspaces
    npm run test --workspace @pine/web
    npm run format:check
    $env:E2E_BASE_PORT='5474'
    npm run e2e --workspace @pine/web -- --workers=2

`e2e/wf-default.spec.ts` runs the example on recorded BTC bars through the dev server and real
Workers, with two Length values per window. Desktop and phone must open on Per window and switch
to Stitched and back. It saves `per-window-desktop.png`, `per-window-phone.png` and the corresponding
stitched captures in each test's output directory.

The real dev-server test is e2e/wf-integration.spec.ts. It calls loadExample('trend-breakout'),
intercepts every market request with the recorded two-year dataset and runs the real Worker pool.
Length 18-38 and Multiplier 1-3 by 0.25 give 189 sets per window, five rolling/anchored windows,
including a partial final window. It captures W1, W2, W4, W5, W6 and W3's selected/mean surfaces at
1440 x 900 in English and Chinese. A Profit filter makes the weakest window flat by requiring more
than its best marked-to-market IS profit.
Tolerance sends exactly one stability analysis job and leaves the run result, window values and
equity unchanged. Preview keeps current inputs; apply writes the fixed set with its fixed origin.

Screenshots are in apps/web/test-results/wf-integration-real-walk-f-398a0-stability-preview-and-apply-chromium/.
The ignored test-results/wf-integration-review/index.html groups copies with the visual references.
Fixture tests retain deterministic live/failed/flat/pending cases, keyboard selection and overflow checks.

Final gates pass: root build, all workspace typechecks, 147 Node tests, 322 Vitest tests, formatting,
and all 53 browser tests with E2E_BASE_PORT=5474 and two workers. S1 measures 781,858 code bytes,
51,889 catalog bytes and 478,164 entry bytes, within their respective 788,000, 58,000 and 484,500
budgets. Only the catalog budget changed, from 50,500 to 58,000, to track the shared copy growth.

## Remaining shared UI

The workflow runs correctly. The shared Backtest preview/after-apply banner and R10 ConditionPopover
still return null. Preview shows the chosen set's chart, and applying changes inputs and records
provenance, but the B16/B17 banner controls/provenance copy cannot be reviewed yet. W5 uses the real
addFilter action from the browser test because the shared popover cannot add a condition.

The map integration tests now spy on optimization!.session, await loadOptimization before reading
the store, and use origins.dev so E2E_BASE_PORT selects their dev server too.
