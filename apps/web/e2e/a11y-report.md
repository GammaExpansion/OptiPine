# Accessibility and smoke audit

Audited 2026-10-03 on `web/qa`, based on `62104dd`. Chromium, axe-core 4.13.0 via
`@axe-core/playwright`, English and Chinese, 1440 × 900 and 390 × 844.

Shell follow-up on `web/a11y-shell`, based on `6a5fb1c`: the right-panel separator landmark and
Last run naming findings are fixed. The phone Optimize Settings heading remains assigned to its
page owner.

`a11y.spec.ts` makes 40 full-document scans: S1; B1 Report, Trades, Pine code and Equity;
B13; S3; S5; O1; and Optimize setup, in each language and viewport. It loads Trend Breakout
through the production UI, runs the actual engine Worker against the recorded 17,520 BTCUSDT
hourly bars, and intercepts market requests with `market-fixtures.ts`. The fixed clock is
2026-10-03 14:37 UTC. No synthetic run output or test-store hooks are used. O1 is the loaded
workspace before optimization; desktop setup is already visible there, while phone setup is
opened through Settings. Optimization results and walk-forward on other branches are not audited.

Every scan saves a screenshot and JSON under `apps/web/test-results/a11y-accessibility-*`.
The JSON contains every violation, its nodes, axe's incomplete checks, and matched allow-list
entries. Unexpected serious/critical findings fail the axe gate, as do violations or incomplete
checks for `region`, `aria-prohibited-attr` and `landmark-main-is-top-level`. The remaining scoped exception
is moderate and identifies rule, impact, screen, viewport, selector and owning file; no
serious/critical finding is exempted. All lower-impact findings remain in the evidence.

## Automated findings

Counts below are failing nodes per scan, then total across the four language/viewport cases.
The same DOM element appearing in several screen scans is counted each time. Virtualized code
renders only visible lines, so line-number counts can change with scroll position. This baseline
had 92 node occurrences, including 54 serious, 34 moderate and 4 minor; no critical violations.
The original fixes removed 74 occurrences; the shell follow-up removes another 16. The remaining
two moderate occurrences belong to phone Optimize Settings, outside this task's allowed paths.
S3 and S5 had no violations in any of the four cases.

| Rule                          | Impact   | Screens and count before fix                                                          | Element / selector                                                                                         | Fix and owning file                                                                                                                                                                                                                                                                                                   | Status                                      |
| ----------------------------- | -------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `color-contrast`              | Serious  | B1 Code, both sizes and languages: 12 per scan, 48 total                              | Eleven visible `.cm-gutterElement` line numbers and the comment span containing `//@version=6`             | `src/pages/backtest/code/editor.ts`: use `--caption` for line numbers, placeholder and comments. Line numbers were 2.48:1 (`#4f565f` on `#111417`); the comment was 3.51:1 (`#6b727b` on the active line). Both now exceed 4.5:1. `code/StaticEditor.module.css` uses the same readable caption for the empty editor. | Fixed                                       |
| `scrollable-region-focusable` | Serious  | B1 Code, both sizes and languages: 1 per scan, 4 total                                | `.cm-scroller[tabindex="-1"]`                                                                              | `src/pages/backtest/code/PineEditor.tsx`: make the scroll container a named region with `tabIndex=0`; its large editable child can extend outside the scroll viewport. This also covers read-only source.                                                                                                             | Fixed                                       |
| `scrollable-region-focusable` | Serious  | B1 Report, phone, both languages: 1 per scan, 2 total                                 | Report's inner scrolling `div` (`Results.module.css` `.report`)                                            | `src/pages/backtest/dock/ReportTab.tsx`: give the region the catalog's Report name and `tabIndex=0`, allowing keyboard scrolling of the stacked report tables.                                                                                                                                                        | Fixed                                       |
| `empty-table-header`          | Minor    | B1 Trades, both sizes and languages: 1 per scan, 4 total                              | `[role="columnheader"][data-column="locate"]`                                                              | `src/pages/backtest/dock/results/TradeTable.tsx`: supply the existing localized Locate label for the icon-action column.                                                                                                                                                                                              | Fixed                                       |
| `page-has-heading-one`        | Moderate | B1 Report, Trades, Code and Equity, both sizes and languages: 1 per scan, 16 total    | `html`, no `h1` after first-launch instructions disappear                                                  | `src/pages/backtest/ChartArea.tsx` and `.module.css`: retain an accessible, visually hidden Backtest heading after S1. The existing first-launch heading stays the sole h1 on S1.                                                                                                                                     | Fixed                                       |
| `region`                      | Moderate | Desktop S1, all four B1 tabs, B13, O1 and setup, both languages: 1 per scan, 16 total | `[role="separator"][aria-controls$="-main"]`, the right-panel resize handle, including its size/reset text | `src/shell/Workbench.tsx`: make the workbench the named `main` landmark and its inner content a `div`, keeping `main` at the top level and enclosing the separator. Resize semantics and G1 behavior stay unchanged; remove the scoped allow-list entry.                                                              | Fixed in shell follow-up                    |
| `page-has-heading-one`        | Moderate | Phone Optimize Settings, both languages: 1 per scan, 2 total                          | `html` while Settings replaces the O1 empty state                                                          | `src/pages/optimize/PhoneOptimize.tsx`: provide an accessible page h1 when the selected tab does not contain one, avoiding a duplicate in Summary's empty state.                                                                                                                                                      | Reported; forbidden path; scoped allow-list |

Axe's `incomplete` results are retained for review, not treated as confirmed violations. This is
an automated DOM audit and keyboard pass, not a screen-reader or canvas-equivalence certification.
Charts keep their existing keyboard descriptions and navigation. No shared style tokens,
Optimize, workflows or package source files were changed. The shell follow-up changes only
landmark and group semantics in the production components.

Manual-review details from those incomplete checks:

- `aria-prohibited-attr`: **fixed in shell follow-up**. The Last run wrappers in
  `src/shell/RunControls.tsx` now have `role="group"` in both Backtest and Optimize, supporting
  their existing localized labels (`Last run` / `上次运行`) while retaining status text as child
  content. The original review finding occurred in 20 scans (one node each): desktop S1, all
  B1 tabs, B13, O1 and setup, plus phone O1/setup, in both languages. Browser accessibility-tree
  assertions check each language's group name and child status; no live-region behavior is added.
- `aria-hidden-focus`: S3/S5 each report three candidates (the hidden app root and two Radix
  focus guards), 24 occurrences across both languages/layouts. The keyboard pass verifies modal
  containment and Escape restoration; focus never visits the hidden app while the modal is open.
- Contrast checks that axe cannot resolve (pseudo-elements, overlapping content beneath the
  properties panel, and non-text symbols) remain in each scan's JSON. They are not silently
  classified as passes. The requested focus states were also reviewed in screenshots.

## Keyboard pass

`keyboard.spec.ts` drives the real production workflow in all four cases using only Tab,
Shift+Tab, arrows, Home, Enter and Escape. DOM reads identify focus; there are no clicks,
programmatic focus calls or store mutations. The focus order is saved to `keyboard-stops.json`;
Run and Code focus screenshots accompany it.

Desktop S1 order: Backtest, disabled Optimize's explanatory wrapper, script and market actions,
disabled Run's explanatory wrapper, language group, first-launch script/data actions, disabled
first-launch Run's explanation, Load example, chart separator, active dock tab and dock actions,
code panel, right separator and sidebar. A disabled native control is skipped while its reason
wrapper remains reachable, as intended. After the example removes S1, tabbing through the editor
and sidebar wraps through browser chrome to the header Run action. Phone orders the page switch
and Run before data/language; Inputs is a dock tab instead of a sidebar. Roving tab groups have
one Tab stop and use arrows/Home to select Report, Trades and Code.

Report now has a named scroll stop. Trades keeps one grid stop with arrows selecting a trade and
Enter locating it on the chart. Code has a scroll stop followed by the editable textbox. The
properties panel cycles through Back to inputs, the General/execution/broker fields and enabled
reset actions; Escape exits and returns to All settings. Market data cycles Close → provider
tabs → provider panel → Market → Symbol → Timeframe → range presets → date fields → Cancel →
Fetch. Shift+Tab from Close wraps to Fetch, and Tab from Fetch wraps to Close. After the fetch,
Use this data replaces Fetch. Escape closes the dialog and restores its market-data opener.

| Finding                               | Before                                                                                                                                                                                                                                                             | Resolution / file                                                                                                                                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editor consumes Tab                   | Loading the example then tabbing toward Run entered the editor and repeatedly inserted indentation; Shift+Tab also belonged to editing. CodeMirror's Escape-then-Tab exit was undiscoverable in the UI.                                                            | Removed `indentWithTab` from `src/pages/backtest/code/editor.ts`. Tab/Shift+Tab navigate normally; the existing Ctrl+[ / Ctrl+] bindings still indent. The regression verifies leaving the editor does not change the source.       |
| Editor focus ring missing             | Static editor removed its outline; CodeMirror's focused theme also removed its outline. Only the caret showed focus.                                                                                                                                               | Added a 2 px amber focus-within outline in `code/editor.ts` and `code/StaticEditor.module.css`; visually checked the Code screenshot and asserted its computed outline.                                                             |
| Primary-action focus ring invisible   | Global amber outline matched the amber Run/Fetch background.                                                                                                                                                                                                       | `src/components/Button.module.css` gives primary actions an inset dark 2 px outline. The keyboard spec asserts the ring differs from the background.                                                                                |
| Number steppers indistinguishable     | Minus, value and plus shared a field border, but the steppers suppressed their own outlines, hiding which button was active.                                                                                                                                       | `src/components/NumberField.module.css` adds an inset amber outline to a keyboard-focused stepper; the input keeps the enclosing field border.                                                                                      |
| Properties loses focus on Escape      | Store-mounted B13 has no Radix Trigger, so dismissing it left focus on the document instead of All settings.                                                                                                                                                       | `src/dialogs/properties/PropertiesDialog.tsx` remembers the opener before autofocus and restores it on dismissal if still connected. Browser regression covers both sizes/languages and the full field loop.                        |
| Store-mounted modal focus restoration | Shared Dialog also relied on a Radix Trigger that market/date/script callers do not supply.                                                                                                                                                                        | `src/components/Dialog.tsx` restores the opener for a triggerless dialog. Component regression covers mount/dismiss; browser regression covers the actual market action. Explicit Radix triggers retain their existing restoration. |
| Symbol-search Tab loop                | Tabbing out of the open Symbol suggestions removed their DOM during blur; the modal focus scope recovered to the dialog. Tab then cycled through Close/provider/Market/Symbol again, making later fields unreachable by forward Tab. Reproduced in all four cases. | `src/dialogs/marketData/SymbolSearch.tsx` closes suggestions on keydown before native Tab changes focus. The browser regression now reaches every following field and Fetch by forward Tab.                                         |

The modal's focus containment and the properties panel's existing field loop remain intentional:
Escape and the visible close/back buttons exit them, with focus restored. No remaining keyboard
trap was observed on the requested route. Other pages and screen readers were not part of this pass.

## Flaky smoke test

The affected case is `panes resize, reset, collapse, maximize and remember sizes independently
per page` in `e2e/smoke.spec.ts`. Two unmodified stress runs each passed 40/40 tests
(`--repeat-each=10 --workers=4`), so parallel execution alone did not reproduce the intermittent
failure on this machine.

A controlled 1.5 s delay of `/assets/zh-*.js` reproduced it. The test selected Chinese, awaited
`document.fonts.ready`, took the supposed Chinese screenshot, then selected EN. Fonts were
already ready for English; `I18nProvider` intentionally keeps English on screen until the Chinese
catalog arrives. EN was therefore still the selected radio. `SegmentedControl` ignores the empty
selection emitted by clicking its current value, leaving the requested language Chinese. Once
the catalog arrived, the UI/storage became Chinese and a later English locator (`Expand panel`
in this reproduction) timed out. The screenshot could also silently contain English.

This is a test synchronization error, not a pane-size or shared-worker race. The test now holds
the Chinese catalog behind an explicit request/release barrier, verifies the pending English
state, releases it, waits for `html[lang="zh-CN"]` and the translated Backtest button, then waits
for English after switching back. Fonts/screenshots follow those assertions. No sleeps, retries,
serialization or production language changes were added. The corrected stress run passed 40/40.

The first complete 660-test stress run also caught one race in the new phone keyboard spec
(659 passed): two ArrowRight presses could reach Radix before its scheduled focus move from
Trades to Inputs completed. The test now awaits the intermediate Equity/Inputs tab focus before
sending the next arrow. This changes test synchronization, not application tab behavior.

## Decisions and design differences

- The mock's dim code comments/line numbers were raised to the existing caption token to satisfy
  WCAG AA. Focus indicators were strengthened; component sizes and ordinary colors stay as drawn.
- Normal Tab navigation takes precedence over the optional editor indentation shortcut. This
  implements WEB.md's keyboard requirement; the design did not prescribe editor Tab behavior.
- Accessible page/region/column labels reuse catalog strings. The Backtest h1 is visually hidden
  so it does not add a heading to the mock's layout. No user-facing copy was added to components.
- The desktop workbench becomes the page's named `main` landmark, with its inner content in a
  plain `div`. This includes the separator without nesting `main` inside a region, which axe
  flags as `landmark-main-is-top-level`. Last run retains its translated name on a group.
  These semantic changes add no visible copy, wrappers or styling and do not deviate from
  WEB.md or G1. The one remaining moderate issue belongs to phone Optimize Settings.

## Verification

From the repository root, with three consecutive unused ports:

```powershell
npm run build
npm run typecheck --workspaces
npm run test -w @pine/web
npm run format:check
$env:E2E_BASE_PORT = '7514'
npm run e2e -w @pine/web -- e2e/smoke.spec.ts --repeat-each=10 --workers=4
npm run e2e -w @pine/web -- --workers=4
npm run e2e -w @pine/web -- --repeat-each=10 --workers=4
```

All gates passed on the original `web/qa` changes, before the shell follow-up:

| Gate                                                                                    | Result                                          |
| --------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Root build                                                                              | Passed                                          |
| All-workspace typecheck, plus web typecheck after the final test synchronization change | Passed                                          |
| Web tests                                                                               | 126 Node + 309 Vitest tests passed              |
| Repository formatting and `git diff --check`                                            | Passed                                          |
| Corrected smoke, ten repetitions / four workers                                         | 40 passed                                       |
| Full e2e, four workers                                                                  | 66 passed                                       |
| Final full e2e, ten repetitions / four workers, base port 7514                          | 660 passed, zero failures/retries (8.8 minutes) |

That original stress run includes 400 axe scans and 40 keyboard journeys. Each repetition has only
the 18 reported moderate node occurrences and zero serious, critical or minor violations.
Vitest emits the existing jsdom canvas-not-implemented diagnostics; browser checks exercise the
actual canvas implementation. A unit run overlapped with the invalidated build attempt also hit
the existing one-second lazy-dialog lookup timeout; the clean web test run passed all 435 tests.

Run builds before starting e2e. An overlapping package rebuild invalidated an earlier attempt:
traces showed Vite's timestamped `ui.ts`/`backtest.ts` modules alongside the tests' unversioned
dynamic imports, creating separate store instances. That attempt was stopped and discarded.
The clean stress runs use fresh servers and no concurrent builds or application edits.

## Shell follow-up verification

Commands from the repository root; ports 7814–7816 were checked unused before starting e2e:

```powershell
npm run build
npm run typecheck --workspaces
npm run test -w @pine/web -- --maxWorkers=1
npm run format:check
$env:E2E_BASE_PORT = '7814'
npm run e2e -w @pine/web -- --workers=2 --timeout=120000 --retries=1
git diff --check
```

Root build and all-workspace typecheck passed. The final full web suite passed all 136 Node and
332 Vitest tests. Earlier concurrent web runs timed out in existing lazy-page/dialog queries and
a leaderboard test; the isolated shell test and the full single-worker suite passed without
changing test timeouts. The existing jsdom canvas diagnostics remain.

The four-worker e2e run timed out waiting for the Chinese phone backtest to finish. Its keyboard
journey passed in the subsequent single-worker run, which instead exceeded the 30-second test
budget while capturing 16 reference boards. A run with a larger test budget passed that capture
but exceeded the English example's five-second run-completion assertion. The final command uses
two workers, a 120-second per-test budget and one permitted retry for this shared machine;
assertion timeouts and repository configuration are unchanged.

The final full e2e run passed **74/74 in 7.7 minutes, with zero retries used**. Its 40 axe scans
contain only the two allow-listed phone Settings `page-has-heading-one` occurrences: no `region`,
`aria-prohibited-attr` or `landmark-main-is-top-level` violations or incomplete findings. English
and Chinese accessibility-tree assertions preserve the Last run group name and child status.
All four keyboard journeys and the G1 resize/reset/persistence smoke test passed. Repository
formatting and `git diff --check` also passed. No package or Optimize page files were changed.
