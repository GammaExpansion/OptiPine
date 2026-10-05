# Header width audit

Measured on Windows with Playwright Chromium, device scale 1, bundled Barlow / Noto Sans SC
fonts loaded, October 5, 2026. Desktop begins at 1280 px and has no upper breakpoint; tablet is
768–1279 px and phone is below 768 px. The desktop audit covers 1280–1600 inclusive every
10 px, plus 1366. Tablet checks use 1024 and 1180; phone uses 390 × 844; other heights are 900.
Both languages cover 20 page/state pairs: 1,480 observations before and after.

`e2e/header-fixture.ts` loads Trend Breakout with the recorded BTC fixture and runs an actual
backtest and tiny IS/OOS optimization. It then freezes store bridges and publishes deterministic
status snapshots to the real header: 17,520 bars / 0.4 s, 2,214 combinations / 10:09, 24 completed
windows, 40 / 1,968 in progress, and window 12 / 24. This makes running, cancelled, failed and
preview states reproducible without timing a Worker. The screenshots' chart/table data come
from that small real run; the large status counts exercise layout, not optimizer throughput.
There are no market network requests. The normal e2e suite also covers actual live runs.

Overflow is `max(0, header.scrollWidth - header.clientWidth)`. The table gives the maximum
across desktop widths, in CSS pixels. The original shell hid page overflow, so a zero page
overflow alone did not prove the header fit. The new check also measures text rectangles for
clipping/overlap, requires visible progress/errors, and checks complete date/provider accessible
names and the Run button's facts description. The existing script-name ellipsis is intentional.

## Before and after

| Page / state           | Before EN, px | Before ZH, px | After EN / ZH, px |
| ---------------------- | ------------: | ------------: | ----------------: |
| backtest/empty         |             6 |             0 |             0 / 0 |
| optimize/empty         |             0 |             0 |             0 / 0 |
| backtest/loaded        |           149 |            73 |             0 / 0 |
| optimize/loaded        |            18 |             0 |             0 / 0 |
| backtest/done          |           149 |            73 |             0 / 0 |
| optimize/done          |            18 |             0 |             0 / 0 |
| optimize/random        |            18 |             0 |             0 / 0 |
| optimize/windows       |            18 |             0 |             0 / 0 |
| backtest/running       |           114 |            49 |             0 / 0 |
| optimize/running       |           114 |            49 |             0 / 0 |
| optimize/walk-forward  |           114 |            49 |             0 / 0 |
| backtest/preview       |           149 |            73 |             0 / 0 |
| optimize/preview       |            18 |             0 |             0 / 0 |
| backtest/compile-error |           149 |            73 |             0 / 0 |
| backtest/error         |           149 |            73 |             0 / 0 |
| optimize/error         |            18 |             0 |             0 / 0 |
| backtest/cancelled     |           149 |            73 |             0 / 0 |
| optimize/cancelled     |            18 |             0 |             0 / 0 |
| backtest/outdated      |           149 |            73 |             0 / 0 |
| optimize/outdated      |            18 |             0 |             0 / 0 |

Original overflowing desktop widths (10 px sampling):

| Page / state           | Original overflow widths EN | Original overflow widths ZH |
| ---------------------- | --------------------------- | --------------------------- |
| backtest/empty         | 1280, 1390                  | none                        |
| optimize/empty         | none                        | none                        |
| backtest/loaded        | 1280-1380                   | 1280-1350                   |
| optimize/loaded        | 1280-1290                   | none                        |
| backtest/done          | 1280-1410                   | 1280-1350, 1390             |
| optimize/done          | 1280-1290                   | none                        |
| optimize/random        | 1280-1290                   | none                        |
| optimize/windows       | 1280-1290                   | none                        |
| backtest/running       | 1280-1430                   | 1280-1320                   |
| optimize/running       | 1280-1420                   | 1280-1320                   |
| optimize/walk-forward  | 1280-1390                   | 1280-1320                   |
| backtest/preview       | 1280-1410                   | 1280-1350, 1390             |
| optimize/preview       | 1280-1290                   | none                        |
| backtest/compile-error | 1280-1400                   | 1280-1350                   |
| backtest/error         | 1280-1380                   | 1280-1350                   |
| optimize/error         | 1280-1290                   | none                        |
| backtest/cancelled     | 1280-1550                   | 1280-1350, 1390             |
| optimize/cancelled     | 1280-1290, 1390-1400        | none                        |
| backtest/outdated      | 1280-1430                   | 1280-1350                   |
| optimize/outdated      | 1280-1290                   | none                        |

At 1024, 1180 and 390, header/page overflow was and remains zero. Before, the English phone's
`40 / 1,968` and `W12 / 24` were clipped; afterwards neither language clips during or after a
run. The final sweep has zero clipped or overlapping labels and zero header/page overflow in
all 1,480 observations. Tablet progress/errors, previously hidden with the facts, remain visible
on their own line; ordinary facts remain omitted there. Optimize phone progress uses its own
line between the actions and data rows. After the run, facts wrap beside the page tabs, restoring
the original 101 px header height and the space for five leaderboard cards. Keeping the extra
26 px line after completion had made those cards scroll; the final layout avoids that regression.
GitHub remains beside the language switch.

## What compacts and when

The implementation follows the leaderboard's ResizeObserver measurement pattern rather than
viewport breakpoints. On width, text or font changes it measures stages in order, choosing the
first that fits. Stages are cumulative, but stages with no effect on a particular state are
skipped in the table:

0. Full header.
1. Hide the shortcut hint visually (retain the keyboard shortcut and accessible text).
2. Move completed Backtest facts to Run's tooltip/description; shorten Optimize facts to
   `2,214 · 10:09`. Shorten running, cancelled and outdated sentences, retaining full wording
   in tooltips and for assistive technology. Missing-input guidance remains on disabled Run.
   Errors and numeric progress remain visible.
3. Hide the provider visually; the symbol button's accessible name retains it.
4. Hide the brand text; retain the logo.
5. Shorten dates to `24-10-03 – 26-10-03`; retain full dates in the tooltip/accessibility name.

Controls keep their original sizes and focus order. Removing the old 100 px facts minimum and
empty facts slot recovers unused space. Facts/brand no longer shrink into neighbouring controls.
No extra controls give way. Thresholds below are observed at 10 px resolution, not hard-coded
breakpoints; another script name, status count, provider or font can shift them. The 1366 check
agrees with its surrounding interval.

| Page / state           | EN: width ranges by stage                                                     | ZH: width ranges by stage                              |
| ---------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------ |
| backtest/empty         | 1280-1390: 2; 1400-1430: 1; 1440-1600: 0                                      | 1280-1600: 0                                           |
| optimize/empty         | 1280-1600: 0                                                                  | 1280-1600: 0                                           |
| backtest/loaded        | 1280-1310: 3; 1320-1360: 1; 1370-1600: 0                                      | 1280: 1; 1290-1600: 0                                  |
| optimize/loaded        | 1280: 4; 1290-1330: 3; 1340-1600: 0                                           | 1280-1600: 0                                           |
| backtest/done          | 1280-1310: 3; 1320-1410: 2; 1420-1460: 1; 1470-1600: 0                        | 1280-1390: 2; 1400-1430: 1; 1440-1600: 0               |
| optimize/done          | 1280-1300: 2; 1310-1600: 0                                                    | 1280: 2; 1290-1600: 0                                  |
| optimize/random        | 1280-1310: 2; 1320-1600: 0                                                    | 1280: 2; 1290-1600: 0                                  |
| optimize/windows       | 1280-1300: 2; 1310-1600: 0                                                    | 1280-1290: 2; 1300-1600: 0                             |
| backtest/running       | 1280-1330: 4; 1340-1390: 3; 1400-1430: 2; 1440-1600: 0                        | 1280-1320: 3; 1330-1370: 2; 1380-1600: 0               |
| optimize/running       | 1280-1300: 5; 1310-1370: 4; 1380-1420: 3; 1430-1600: 0                        | 1280: 4; 1290-1340: 3; 1350-1600: 0                    |
| optimize/walk-forward  | 1280-1340: 4; 1350-1390: 3; 1400-1600: 0                                      | 1280-1310: 3; 1320-1600: 0                             |
| backtest/preview       | 1280-1310: 3; 1320-1410: 2; 1420-1460: 1; 1470-1600: 0                        | 1280-1390: 2; 1400-1430: 1; 1440-1600: 0               |
| optimize/preview       | 1280-1300: 2; 1310-1600: 0                                                    | 1280: 2; 1290-1600: 0                                  |
| backtest/compile-error | 1280: 5; 1290-1350: 4; 1360-1400: 3; 1410-1450: 1; 1460-1600: 0               | 1280-1300: 4; 1310-1350: 3; 1360-1400: 1; 1410-1600: 0 |
| backtest/error         | 1280-1320: 4; 1330-1380: 3; 1390-1420: 1; 1430-1600: 0                        | 1280-1300: 3; 1310-1340: 1; 1350-1600: 0               |
| optimize/error         | 1280-1330: 4; 1340-1380: 3; 1390-1600: 0                                      | 1280-1600: 0                                           |
| backtest/cancelled     | 1280: 5; 1290-1340: 4; 1350-1400: 3; 1410-1510: 2; 1520-1550: 1; 1560-1600: 0 | 1280-1310: 3; 1320-1390: 2; 1400-1430: 1; 1440-1600: 0 |
| optimize/cancelled     | 1280: 5; 1290-1350: 4; 1360-1400: 3; 1410-1600: 0                             | 1280: 3; 1290-1600: 0                                  |
| backtest/outdated      | 1280-1330: 4; 1340-1390: 3; 1400-1430: 2; 1440-1470: 1; 1480-1600: 0          | 1280-1300: 3; 1310-1320: 2; 1330-1370: 1; 1380-1600: 0 |
| optimize/outdated      | 1280-1300: 3; 1310-1600: 0                                                    | 1280-1600: 0                                           |

## Validation and artifacts

Final gates passed: root build, all workspace typechecks, web tests (218 Node tests and 479
component tests passed; four existing Node tests skipped), repository format check, and all
136 e2e tests with `E2E_BASE_PORT=6874` and `--workers=2` (3.2 minutes). The full-suite log and
artifacts are in `apps/web/test-results/header-gates.log` and `header-gates/`; the exhaustive
width sweep remains in `header-final/`. All changes are uncommitted; packages are unchanged.

The shell measurement has a unit test for choosing the least compact stage, restoring full
width, observing status/font changes and disconnecting. Run-control tests cover the shortened
variants, full accessible facts, lazy Optimize status and Cancel. Browser checks exercise the
requested 1024, 1180, 1280, 1366, 1440 and 390 widths in both languages on every normal e2e run.

Existing Backtest/result assertions now target the full status copy, and Optimize assertions
read visible text instead of concatenating hidden compact variants. The full suite also exposed
R8's keyboard test acting before final analysis replaced the live curve: it now waits for the
view to settle before End/Enter, and passes three repeated runs. No map implementation changed.

The added measurement/status logic initially exceeded the existing first-load budget. Moving
Optimize-only run controls into a lazy module keeps the budgets unchanged: final measured code
is **495,836 bytes** (limit 497,200), entry **491,784** (limit 493,150), and core English catalog
**20,015** (limit 26,000). The sidebar imports the same extracted failed-combinations link.

Reproduce from the root, with an unused four-port base:

```powershell
npm run build
npm run typecheck --workspaces
npm run test -w @pine/web
npm run format:check
$env:E2E_BASE_PORT = '6874'
$env:HEADER_SWEEP = '1'
npm run e2e -w @pine/web -- --workers=2 --output=test-results/header-final
Remove-Item Env:HEADER_SWEEP
```

For an observational baseline on the original code, use `HEADER_MEASURE=before` instead of
`HEADER_SWEEP=1`. Raw local JSON is in `apps/web/test-results/header-baseline/` and
`apps/web/test-results/header-final/`, under each language's test directory. Omit `HEADER_SWEEP`
for the routine six-width checks. Screenshots inspected:

- [1280 English after Backtest](../../apps/web/test-results/header-review/backtest-after-1280-en.png)
- [1366 English after Backtest](../../apps/web/test-results/header-review/backtest-after-1366-en.png)
- [390 English during Optimize](../../apps/web/test-results/header-review/optimize-running-390-en.png)

The full sweep also saves both languages during/after a phone run, and completed Backtest and
Optimize at 1280/1366. Artifacts are ignored local review files, not committed source.
