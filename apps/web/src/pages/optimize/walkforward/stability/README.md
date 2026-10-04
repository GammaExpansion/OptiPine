# Walk-forward stability

WfStability reads the real walkForward view from the optimization store. StabilityRows draws the
workflow's per-window bands and common intervals as SVG; WindowMap supplies its panel to the existing
HeatmapCanvas. No ranking, tolerance calculation or map aggregation runs in these components.

## Real workflow actions

The pending adapter is removed. Controls directly call:

- setStabilityTolerance(fraction: number): void: 0-1; 10% is 0.1.
- setWindowMapSurface(surface: 'window' | 'mean'): void.
- selectWindow(window: number | null): void: zero-based window indices; null returns to the default.
- setAxis and setSlice for the map controls.

Bands are matched by StabilityBand.window, never by array position: a flat window has no band and
must not shift later windows' dots. The panel uses the merged error and mapPending fields. Tolerance
keeps existing bands visible while its analysis runs. The real browser test instruments the analysis
client and confirms that changing tolerance sends only a stability job, keeping the completed result
and its window/equity data unchanged.

The test-only fixture satisfies the merged contract (window indices, error and mapPending). The hook
records actions and uses windowSelection for nullable selection. Neither module has a production
import. Fixture tests cover both languages, missing bands, pending/empty/error states, map surfaces,
axes/slices, keyboard inspection and control availability.

## Visual review

W1 and W3 were compared with the English boards at 1440 x 900, and real rolling/anchored runs were
reviewed in both languages. Each input has one value scale across windows; disjoint near-optimal sets
stay disjoint. Null picks have no dot. Long labels wrap and short panels scroll internally.

The tolerance menu offers 5%, 10%, 15% and 20%, plus the workflow's custom value. An empty intersection
says "No common range". W3 keeps the explicit window selector and axis/slice controls; picks in one
cell share a circle and label, and the selected pick is amber. The window selector reaches each pick.

The existing data-range bar places the panels below the mock's top edge. Dates, equity, values,
number of rows/windows and colours inside the map reflect actual results. Those data differences
and the shared layout were not replaced with mock values.

See ../results/README.md for real-run commands, screenshot paths, S1 budgets and outstanding shared
UI. The focused walk-forward unit suite passes 24 tests; both stability browser
fixtures and the real selected-window versus mean surface checks pass.
