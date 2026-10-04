# Live optimization performance

The app is substantially more responsive, but WEB.md 4.9's strict 50 ms budget still fails,
especially at 4× CPU. Snapshot pacing and stale walk-forward retention are fixed within the
owned app paths. No package files, dependencies, layouts or user-facing copy were changed.

## Reproduction

From the repository root, with dependencies installed and packages built:

```powershell
$env:PERF_LABEL = 'before'
npm run perf:live -w @pine/web
```

This opt-in executable is outside the normal Playwright spec glob. It builds the actual app in
production mode under `.e2e-dist/perf`, injects a measurement-only module, starts its own local
server on `PERF_PORT` (6274 by default), and closes the browser and server when finished.
Reports, raw observations, screenshots and optional CPU profiles go to
`apps/web/test-results/perf/<PERF_LABEL>/` (ignored local artifacts).

`PERF_SCENARIOS` selects comma-separated names, for example `is-oos-desktop-1x` or
`walk-phone-4x`. `PERF_COMBINATIONS` and `PERF_WINDOW_COMBINATIONS` default to 20,000 and 3,000.
`PERF_PROFILE=1` adds a Chrome CPU profile; leave it unset for timing comparisons.
`PERF_HEADED=1` shows Chromium. `PERF_TIMEOUT_MS` defaults to two hours per scenario.
`PERF_TIMEFRAME=60` uses the original hourly bars; the default `240` measures the app's 4h view.

## Method

- Chromium drives the real UI to load Trend Breakout and start the run. A measurement-only
  bridge configures the normal session actions before starting, with no synthetic trials or
  replacement Workers. The search is Length 5–54 by 1, Multiplier 0.25–5 by 0.25 and Trail %
  0.25–5 by 0.25; trailing stops are on, Source is close. Random sampling uses seed 7301.
- All 17,520 recorded BTCUSDT hourly bars are loaded from the checked-in two-year market fixture,
  then the real timeframe control selects 4h and accepts the aggregated dataset (4,379 complete
  UTC buckets). The entire two-year span is retained except incomplete boundary buckets.
  Playwright intercepts the market request; other market requests and external requests are
  rejected. The server also refuses market traffic. Only Date is shifted to the recording's
  date; native performance, event and animation clocks are preserved.
- IS/OOS uses the default 70/30 split (40,000 backtests). Walk-forward uses two IS months, one
  OOS month and a six-month step, producing four windows of 3,000 candidate backtests each.
- Each workload runs at 1440 × 900 and 390 × 844, at native speed and Chrome CDP 4× CPU
  throttling. Desktop shows summary, leaderboard, map and sensitivity together. Phone uses the
  real tabs. Walk-forward shows its own summary and windows; its map and stability become
  available after completion, as implemented by W4.
- Native `PerformanceObserver` records `longtask`, `event` (16 ms threshold), and
  `long-animation-frame` including script attribution. Native rAF records frame intervals.
  Long-task percentiles describe only tasks at least 50 ms; no samples means no observed long
  task, not a zero-cost frame. rAF gaps include scheduling/GPU/OS delays and do not by themselves
  establish main-thread CPU work. Streaming and post-completion long tasks are separated.
  A task beginning before the done publication stays in the streaming group, even if it also
  starts final equity reproduction. This avoids hiding work at the completion boundary.
- The session subscription records progress publications and new analysis-summary identities.
  Phase/window transitions are excluded from same-phase cadence statistics. Raw records retain
  boundaries so exceptions can be audited. Worker `postMessage` measures synchronous cloning,
  retaining only timings and job names rather than trial objects.
- At approximately 15% and 80% of IS/OOS work (60% for the second walk-forward interaction),
  Playwright switches summary and filters,
  hovers the map, pages and scrolls the leaderboard, and visits sensitivity on phone. Native
  trusted input timestamps through the next two animation callbacks measure time through a
  paint opportunity; this includes scheduling and is not handler-only CPU time. Event Timing
  is reported separately. The baseline probe includes pointer movements before clicks; use each
  action's maximum when comparing it with the corrected probe's click-only samples.
  Walk-forward substitutes scrolling its window table for leaderboard
  and map interactions unavailable during that run.
- Page heap is sampled once a second without GC. At boundaries, CDP reads page and Worker
  isolate heaps separately, both before and after explicit GC. Each completed large run is
  replaced by two eight-set IS/OOS runs, with GC after each, to detect retained results.
  These are JS heap sizes, not process RSS or GPU memory. GC observations are outside the
  recorded frame interval.

## Machine

AMD Ryzen 7 9850X3D, 8 physical / 16 logical cores, 61.6 GiB usable RAM; Windows 11 build
26200; Node 24.20.0; Playwright Chromium 153.0.8010.12, headless. The app uses its native
15-worker pool. This is the shared development machine; other worktrees and desktop applications
may compete for CPU. CDP throttling is an emulation, not a physical phone benchmark.
The throttle is applied to the page target; the benchmark does not independently throttle Worker
targets. Event Timing rounds durations to 8 ms and omits events below its 16 ms threshold.
Instrumentation retains numeric samples and long-frame attribution, so replacement heaps are
expected to remain somewhat above the initial empty app. No full trial objects are retained by
the probe.

## Before and after

Baseline: application revision `2b0ab25` on `web/perf`, before the fixes below.
After: the working-tree application changes in this report. Measurements were taken on
2026-10-03/04 (UTC). Each matrix contains one run per scenario, not repeated statistical trials.
The full matrices are `test-results/perf/baseline/report.json` and
`test-results/perf/after/report.json` under `apps/web`; per-scenario raw JSON and screenshots
sit beside them. These are ignored local artifacts. Preserve them when running e2e by selecting
a separate `--output` directory. To reproduce a baseline, use revision `2b0ab25` in a separate
checkout with only this benchmark, its helper modules and npm entry copied in.

### Streaming main-thread work

Long tasks: **count / p50 / p95 / max**, durations in ms. A dash means no samples.

| Scenario              | Before                | After                |
| --------------------- | --------------------- | -------------------- |
| IS/OOS desktop native | 31 / 60 / 116 / 162   | 5 / 58 / 69 / 69     |
| WF desktop native     | 5 / 336 / 373 / 373   | 0 / — / — / —        |
| IS/OOS phone native   | 2 / 54 / 70 / 70      | 1 / 72 / 72 / 72     |
| WF phone native       | 4 / 322 / 376 / 376   | 0 / — / — / —        |
| IS/OOS desktop 4×     | 767 / 88 / 231 / 695  | 300 / 70 / 182 / 499 |
| WF desktop 4×         | 13 / 81 / 1154 / 1154 | 16 / 71 / 147 / 147  |
| IS/OOS phone 4×       | 388 / 66 / 124 / 311  | 147 / 69 / 139 / 300 |
| WF phone 4×           | 28 / 70 / 1289 / 1486 | 24 / 70 / 139 / 149  |

The strict under-50-ms contract is **not met**. Native walk-forward has no observed long
tasks after batching, but native IS/OOS still has 69–72 ms maxima. Throttled IS/OOS improves
from 767 to 300 desktop long tasks and 388 to 147 phone long tasks, yet maxima remain
499 and 300 ms. Count reductions are descriptive: workload timing and host contention vary.

Post-done long-task counts/maxima after the fix are desktop IS/OOS 4×: 4/161 ms,
desktop WF 4×: 7/181 ms, phone WF 4×: 9/320 ms; the other five scenarios have none.

Frame deltas: **p95 / max / count >50 ms**, before → after. Every scenario has a 16.7 ms
p50. A frame gap measures scheduling as well as work; it cannot prove a CPU violation alone.

| Scenario              | Before             | After              |
| --------------------- | ------------------ | ------------------ |
| IS/OOS desktop native | 16.8 / 333.3 / 104 | 16.7 / 316.7 / 40  |
| WF desktop native     | 16.8 / 366.6 / 14  | 16.8 / 16.8 / 0    |
| IS/OOS phone native   | 16.7 / 316.7 / 25  | 16.7 / 116.7 / 4   |
| WF phone native       | 16.8 / 366.7 / 20  | 16.7 / 16.8 / 0    |
| IS/OOS desktop 4×     | 83.4 / 833.3 / 804 | 33.4 / 849.9 / 371 |
| WF desktop 4×         | 16.8 / 1166.7 / 11 | 33.3 / 183.3 / 27  |
| IS/OOS phone 4×       | 33.4 / 333.4 / 451 | 33.3 / 216.6 / 238 |
| WF phone 4×           | 50.0 / 1483.2 / 77 | 33.3 / 383.3 / 39  |

### Publication cadence

Same-phase progress intervals, ms: **min / p50 / p95 / max**, and number below 249 ms
(a 1 ms observation tolerance). Phase and window boundaries are excluded.

| Scenario              | Before                          | After                          | Violations before → after |
| --------------------- | ------------------------------- | ------------------------------ | ------------------------- |
| IS/OOS desktop native | 51.8 / 296.5 / 394.9 / 634.1    | 251.2 / 283.8 / 384.2 / 1346.2 | 1 → 0                     |
| WF desktop native     | 254.7 / 286.1 / 453.0 / 922.5   | 252.8 / 271.9 / 484.4 / 491.5  | 0 → 0                     |
| IS/OOS phone native   | 252.4 / 283.4 / 390.7 / 887.7   | 250.9 / 286.2 / 400.4 / 520.7  | 0 → 0                     |
| WF phone native       | 253.5 / 283.3 / 640.1 / 819.0   | 253.2 / 268.9 / 411.7 / 442.4  | 0 → 0                     |
| IS/OOS desktop 4×     | 253.3 / 375.9 / 639.6 / 1304.9  | 251.1 / 307.3 / 462.3 / 1168.7 | 0 → 0                     |
| WF desktop 4×         | 259.8 / 291.3 / 1203.7 / 1244.4 | 260.2 / 300.9 / 493.4 / 1154.2 | 0 → 0                     |
| IS/OOS phone 4×       | 154.4 / 317.7 / 422.8 / 885.8   | 251.0 / 304.8 / 431.8 / 603.1  | 1 → 0                     |
| WF phone 4×           | 253.3 / 307.9 / 1274.2 / 1924.1 | 256.6 / 288.4 / 481.6 / 1534.8 | 0 → 0                     |

All after progress intervals are at least 250.9 ms. Analysis-summary identity intervals
include finalization and explicit settings changes, so raw intervals are an additional
audit rather than the same cadence series. IS/OOS summary intervals are:

| Scenario              | Before min / p50 / p95 / max      | After min / p50 / p95 / max       |
| --------------------- | --------------------------------- | --------------------------------- |
| IS/OOS desktop native | 206.1 / 1148.3 / 3879.1 / 11297.2 | 262.4 / 1380.1 / 4207.3 / 8321.8  |
| IS/OOS phone native   | 164.8 / 723.2 / 2772.5 / 9346.6   | 263.9 / 921.4 / 3081.0 / 8068.5   |
| IS/OOS desktop 4×     | 203.2 / 1792.1 / 4613.4 / 13567.0 | 272.0 / 1641.9 / 7416.0 / 21872.5 |
| IS/OOS phone 4×       | 227.1 / 1258.3 / 7282.2 / 14374.1 | 257.3 / 1587.7 / 9791.5 / 16254.7 |

There are zero after summary intervals below 249 ms. The 250 ms rule caps publication
frequency; it is not a response-latency promise. Analysis may lag by seconds, particularly
after a settings change. Walk-forward publishes completed windows rather than IS/OOS summary
objects, so it has no samples in this second series.

### Interactions

Maximum input-to-two-rAF paint opportunity across the early/late attempts, ms, **before →
after**. These are a few targeted interactions, not a production INP estimate.

| IS/OOS scenario       | Summary     | Filter       | Map hover    | Page          | Scroll       |
| --------------------- | ----------- | ------------ | ------------ | ------------- | ------------ |
| IS/OOS desktop native | 33.2 → 31.1 | 33.7 → 29.6  | 29.6 → 30.0  | 49.6 → 32.7   | 39.5 → 46.2  |
| IS/OOS phone native   | 18.0 → 33.5 | 24.9 → 23.9  | 24.8 → 39.0  | 32.2 → 27.0   | 39.5 → 44.6  |
| IS/OOS desktop 4×     | 52.6 → 46.6 | 42.1 → 91.8  | 58.8 → 109.3 | 222.2 → 94.3  | 130.2 → 48.7 |
| IS/OOS phone 4×       | 44.6 → 29.3 | 36.1 → 154.9 | 113.6 → 28.9 | 126.9 → 118.6 | 40.9 → 48.0  |

Walk-forward summary and window scrolling replace IS/OOS-only interactions:

| WF scenario       | Summary before → after | Window scroll before → after |
| ----------------- | ---------------------- | ---------------------------- |
| WF desktop native | 23.1 → 29.6            | 42.8 → 54.9                  |
| WF phone native   | 28.8 → 31.4            | 40.2 → 46.8                  |
| WF desktop 4×     | 33.0 → 68.4            | 92.2 → 119.7                 |
| WF phone 4×       | 27.8 → 31.1            | 38.0 → 69.4                  |

Native Event Timing for clicks, **count / p50 / p95 / max**, ms (all clicks during the
observation, including tab/navigation clicks; durations are rounded by Chromium):

| Scenario              | Before              | After               |
| --------------------- | ------------------- | ------------------- |
| IS/OOS desktop native | 7 / 48 / 64 / 64    | 7 / 32 / 48 / 48    |
| WF desktop native     | 2 / 24 / 40 / 40    | 2 / 16 / 24 / 24    |
| IS/OOS phone native   | 17 / 24 / 48 / 48   | 17 / 24 / 48 / 48   |
| WF phone native       | 8 / 16 / 32 / 32    | 7 / 16 / 24 / 24    |
| IS/OOS desktop 4×     | 7 / 72 / 432 / 432  | 7 / 104 / 152 / 152 |
| WF desktop 4×         | 3 / 32 / 184 / 184  | 3 / 80 / 112 / 112  |
| IS/OOS phone 4×       | 17 / 56 / 152 / 152 | 18 / 56 / 200 / 200 |
| WF phone 4×           | 6 / 48 / 120 / 120  | 9 / 48 / 128 / 128  |

The sidebar blocks the actual objective control while running. The following explicitly
labelled workflow fallback measures the real action and waits for current analysis plus two
animation callbacks. Values are **early / late**, before → after. It is not a successful UI
objective test.

| IS/OOS scenario       | Synchronous ms before → after | Analysis-through-paint seconds before → after |
| --------------------- | ----------------------------- | --------------------------------------------- |
| IS/OOS desktop native | 1.8 / 18.9 → 0.8 / 3.2        | 1.3 / 6.4 → 1.2 / 8.1                         |
| IS/OOS phone native   | 0.8 / 8.4 → 1.8 / 2.8         | 1.4 / 6.2 → 0.5 / 4.2                         |
| IS/OOS desktop 4×     | 0.8 / 7.8 → 1.5 / 25.4        | 3.1 / 6.9 → 2.8 / 17.6                        |
| IS/OOS phone 4×       | 1.8 / 3.2 → 1.2 / 24.9        | 2.5 / 9.5 → 2.2 / 7.8                         |

Early after WF objective/filter fallback through-paint costs were respectively 31.8/32.9 ms
(desktop native), 29.5/33.4 ms (phone native), 112.1/87.7 ms (desktop 4×), and 27.5/45.8 ms
(phone 4×). Late WF objective actions began during the run but finished after it ended,
so their 5.5–20.9 second latency includes reselection and completion work. The baseline phone
WF 4× early filter took 30.3 seconds and left no late interaction checkpoint; its table uses
the early samples only. All matrix runs completed with no recorded page or interaction errors,
but that missing checkpoint is a coverage limitation. The current runner flags missing checkpoints.

### Heap lifetime

Page JS heap in decimal MB: before-run GC, peak sampled during run, finished before GC,
finished after GC, and first/second eight-set replacement after GC. Samples are approximately
once a second and pause during interaction sequences, so peak is a sampled lower bound.

| Scenario              | Before GC | Peak   | Finished | Retained | Replacement 1 / 2 |
| --------------------- | --------- | ------ | -------- | -------- | ----------------- |
| IS/OOS desktop native | 13.21     | 138.69 | 116.21   | 116.31   | 18.08 / 18.17     |
| WF desktop native     | 11.57     | 210.23 | 217.50   | 190.35   | 16.33 / 16.63     |
| IS/OOS phone native   | 10.78     | 118.93 | 138.09   | 111.85   | 15.07 / 15.17     |
| WF phone native       | 10.78     | 210.31 | 218.38   | 188.36   | 14.15 / 14.33     |
| IS/OOS desktop 4×     | 12.18     | 137.00 | 153.93   | 115.44   | 17.65 / 17.73     |
| WF desktop 4×         | 11.59     | 212.64 | 223.36   | 190.46   | 193.03 / 17.16    |
| IS/OOS phone 4×       | 10.79     | 135.31 | 112.00   | 111.83   | 15.15 / 15.30     |
| WF phone 4×           | 10.93     | 205.94 | 219.49   | 188.65   | 14.39 / 14.53     |

Baseline page retained → first replacement MB: IS/OOS desktop native 116.37 → 18.53;
WF desktop native 190.53 → 193.11; IS/OOS phone native 112.05 → 15.32; WF phone native
188.59 → 190.35. The WF memo retained the old run indefinitely across both replacements.
Clearing obsolete memos releases about 175 MB on replacement. The initial after desktop WF 4×
probe saw 193.03 MB at its first replacement and 17.16 MB at its second; a stricter settled
probe and idle heap follow-up are reported below, without discarding this observation.

The targeted repeat (`after-walk-settled/report.json`) also waits for stability to finish
and collects again after two seconds idle. First replacement immediate → idle page MB:
desktop native 16.79 → 16.79; phone native 14.11 → 14.11; desktop 4× 192.42 → 16.63;
phone 4× 14.27 → 14.27. The second replacements settled at 17.19, 14.31, 16.97 and
14.42 MB respectively. The desktop 4× delay is transient retention across outstanding
asynchronous work/GC, not the previous persistent memo leak; a new run releases it within
the measured two-second idle period. Its exact retaining path was not heap-snapshot profiled.
Native WF again had zero long tasks; 4× desktop/phone maxima were 176/67 ms in this repeat,
illustrating host-load variation. All four repeats had no page or interaction errors.

Worker heaps are separate from the page: all eight IS/OOS before/after observations retained
about 619.1–619.2 MB across Worker isolates after the large run (about 618 MB in analysis),
and 2.1 MB after replacement (about 1.4 MB in analysis). WF Workers retained about 1.4 MB
after completion and 1.7–1.8 MB after replacement. The large analysis run is released.

## Profiling and fixes

An 80-set harness pilot identified a synchronous burst when starting Top 20 reproduction after
completion. Its CPU profile attributes substantial time to `OptimizationWorkerPool.reproduce`
(structured cloning the full bar input) and `Worker.postMessage`, launched repeatedly in one task.
This is separate from the live-streaming contract. Pilot numbers are not scale acceptance results.

## Initial baseline and findings

The first completed desktop runs, before changing app code, measured 15 IS/OOS long tasks
(p50 58, p95/max 134 ms) and four walk-forward long tasks (p50 346, p95/max 380 ms).
The complete interaction harness then repeated desktop: 31 IS/OOS long tasks (p50 60, p95 116,
max 162 ms), five walk-forward long tasks (p50 336, p95/max 373 ms). This spread illustrates
contention on the shared machine; counts must be read together with duration and workload.

Walk-forward page heap after GC was 190.5 MB, and still 193.1 MB after an eight-set replacement.
`#wfMemo` retained the previous run after switching to IS/OOS, because that layout no longer
derived the walk-forward view. IS/OOS did release its data: page 116.4 → 18.5 MB and analysis
Worker approximately 618 → 1.4 MB after replacement.

Profiling identified repeated view construction on progress publications with unchanged analysis,
a pending IS timer publishing OOS progress just 51.8 ms after the phase transition, and
walk-forward's synchronous `selectionRecords` metric-column extraction at each window boundary.
`scoreMetric` lazily parses and sorts the whole report for a new metrics object, so 3,000 first
lookups produce a several-hundred-ms task. The workflow now divides extraction into 32-trial
tasks, preserving the package's metric semantics and compact Worker request.

The workflow also drops obsolete layout memos when a complete run replaces another, preserves
derived chart/leaderboard data during progress-only publications, clears the timer at a phase
boundary, and delays queued live views until at least 250 ms after the last reply. Explicit
setting changes retain immediate analysis requests. Summary inputs keep their references so
progress does not redraw an unchanged canvas or histogram. The leaderboard also reuses two
`Intl.NumberFormat` instances; profiles identified constructing a formatter per cell as a
major throttled render cost.

### Outside the owned paths

`pages/optimize/sidebar/OptimizeSidebar.tsx` places `Ranking` inside the same `inert={running}`
wrapper as search ranges, validation and properties. This blocks live objective changes and
sidebar filters despite WEB.md 3.1. Move Ranking outside that wrapper (with its current visual
order) and apply the dimming/inert state only to run setup sections. The benchmark records
`uiBlocked: true` and calls the normal workflow action to measure its synchronous cost and time
until current analysis is painted. It does not count this as a successful UI objective interaction.
IS/OOS filters use the enabled leaderboard removal buttons; walk-forward filters use the same
explicitly labelled workflow fallback.

The task names `packages/workers` in its fix list, but the working agreement explicitly forbids
package edits. No package files were changed. A remaining package fix is necessary for the strict
50 ms target under throttling: `AnalysisRun.view` in `packages/workers/src/analysis-client.ts`
currently serializes all accumulated `runAppend` trials in one `postMessage`. The baseline's
4× desktop and phone maxima were 107.6 and 185.0 ms. After app fixes they were 295.0 and
198.8 ms (desktop p95 95.3 ms), so this cost remains material. Split each range's unsent suffix into bounded
batches (for example 100 trials), yield to the host between batches, advance `#sent` only for
successfully posted batches, and enqueue `runView` after all append messages. Preserve the
existing unknown-run replay and close/cancel behavior; add tests for partial flush, restart and
cancellation. Do not truncate the metrics or drop trials. A separate package improvement would
avoid repeatedly cloning the full bar input when starting Top 20 reproductions.

## Limits and follow-up

- The first hourly 20,000-set attempt was interrupted because of its cost. The completed
  acceptance matrix uses full-span 4h aggregation; it does not establish hourly performance.
- The desktop leaderboard mounts a bounded 13-row page, keeping DOM size independent of the
  20,000 results, though it does not implement the table virtualization named in 4.9.
  Distribution and sensitivity are small SVGs; scatter/map use canvas, consistent with the
  more specific chart guidance in section 4.2. No layout or visual changes were made here.
- Ranking, map aggregation and selection run in analysis Workers, but compact record extraction,
  view assembly and some chart preparation remain on the page. Batching bounds the costly WF
  extraction; it does not move all derived work to a Worker.
- Shared-machine load, a single run per matrix cell, and page-only CPU throttling limit comparisons.
  A physical phone, repeated confidence intervals, wider histories and larger axes remain unmeasured.
- The runner is a measurement tool, not a passing performance assertion. Review `tasks`,
  `snapshots`, `interactionErrors`, blocked controls and heap lifetime in the emitted report.

## Validation

All gates passed on this working tree:

```powershell
npm run build
npm run typecheck --workspaces
npm run test --workspaces
npm run format:check
$env:E2E_BASE_PORT = '6774'
npm run e2e -w @pine/web -- --workers=2 --output=test-results/e2e-perf-gate
```

Workspace tests: 643 Node tests and 367 component tests (1,010 total), zero failures.
Full e2e: 80 passed in 3.3 minutes; ports 6774–6776 were checked unused before launch.
Build, all workspace typechecks, Prettier and `git diff --check` passed. Every changed file
was formatted with `npx prettier --write`. `npm run check` was not required because no
package files changed. Gate logs remain under `apps/web/test-results/perf-*.log`.

The new Node tests cover metric extraction equivalence/cache reuse and yielding, percentile
and cadence calculations, fixture aggregation, progress-only view reuse, delayed analysis replies
and phase-transition timers. The scale before/after measurements cover memo release and render
cost; existing component/e2e tests cover the unchanged formatting and chart behavior.

Implementation files are `scripts/perf-live-optimization.ts`, its `perf-live-browser.ts` probe,
`perf-market.ts` and `perf-statistics.ts` with tests; `workflows/optimize-records.ts` with tests;
`workflows/optimize-session.ts` and its tests; summary `SummaryPanel.tsx` and
`DistributionChart.tsx`; and leaderboard `useResultFormat.ts`, all under `apps/web`.
The web package adds `perf:live`, and `scripts/test-node.ts` includes the benchmark helpers' tests.
Changes are uncommitted on `web/perf`; no protected page/range modules were edited.
