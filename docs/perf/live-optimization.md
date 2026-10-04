# Live optimization performance

The strict 50 ms target remains open. This review replaces the single-run comparison with
three repetitions of four scenarios on first-pass revision `5d4dd7f` and the uncommitted
Worker/sidebar follow-up. Profiled runs are separate from the timing comparison.

## Changes under review

- `AnalysisRun.view` captures both range lengths, serializes concurrent views, posts at most
  100 trials per host task across both ranges, and yields between batches. Acknowledged offsets
  advance only after a successful append. Unknown-run replay, cancellation epochs and close
  preserve every trial and stop obsolete work. Tests cover partial flush, restart and cancellation.
- Reproduction clones immutable common input once per run, sends it once per reproduction Worker,
  reuses idle Workers, and staggers initial transfers. Cancel/dispose/next optimization terminate
  active and idle Workers. Tests cover input snapshots, overrides, revisions, replay and aborts.
- Ranking is outside the sidebar's inert setup wrappers, retaining the original visual order.
  Objective, direction and filters remain usable during a run. The current benchmark clicks the
  real objective menu/filter chips and verifies their settings; it has no workflow fallback.
- This review adds streamed CDP trace capture, saved source maps, a source-mapped task report,
  and a repeated-results report. No additional application fix is justified by the captured
  worst tasks: the dominant clone, drawing, selection and layout paths predate this follow-up.

## Method and machine

The production app loads the recorded two-year BTCUSDT fixture, then selects its real 4h control:
17,520 hourly bars become 4,379 complete UTC buckets. External/market requests are blocked;
Playwright serves only the recorded data. Date is shifted to the recording; native performance,
Event Timing and animation clocks are untouched. No synthetic trials or replacement Workers.

IS/OOS searches 20,000 distinct random combinations (seed 7301): Length 5–54 by 1,
Multiplier 0.25–5 by 0.25, Trail % 0.25–5 by 0.25, trailing enabled. Its 70/30 split executes
40,000 backtests. WF uses four windows, two IS months / one OOS month / six-month step,
3,000 candidates per window. Desktop is 1440 × 900; phone is 390 × 844. Desktop displays
summary, leaderboard, map and sensitivity together; WF displays its own results panels.
Phone exercises the real tabs. Summary, objective, filter, map hover, leaderboard paging and
scrolling are exercised at 15% and 80% progress (60% for WF, with window scrolling).

`PerformanceObserver` records long tasks, Event Timing and long animation frames; rAF records
frame deltas. The observation starts before the Start click. Tasks beginning before the done
publication count in the run even when they straddle completion; finalization is recorded
separately. Frame gaps include OS/compositor scheduling, not just JavaScript work. An absent
long task is represented as zero only in the across-run maximum comparison.

Machine: AMD Ryzen 7 9850X3D, 8 cores / 16 threads, 66.16 GB RAM; Windows 11 build 26200;
Node 24.20.0; headless Playwright Chromium 153.0.8010.12. The app uses 15 sweep Workers.
CDP 4× throttles the page target, not each Worker independently; this is not a physical-phone test.

The maintainer restarted the machine during the earlier attempt. `repeat-before-1` and
`repeat-after-1` are complete but excluded because they ran under the earlier contention;
`repeat-after-2` is incomplete. The first post-restart repeat was interrupted by a provider
disconnect and began at 100% host CPU, so it is excluded too. Existing `attribution` and
`attribution-complete` IS/OOS traces lost their tail despite having a report JSON and are invalid
for full-run attribution. All artifacts are preserved under `apps/web/test-results/perf/`.
The replacement `quiet-trace` captures have both boundary marks, CPU profiles and source maps;
the initial host sample was 20.4% busy with 44.7 GB free. The host remains shared.
Before each fresh four-scenario pass, two 2-second samples of `os.cpus()` counters, separated
by 15 seconds, must both be at most 35% busy. The runner paused through further 81–100% bursts.
This controls launch-time contention, not load throughout each run. A mid-run Node-process spot
check measured 0.4% total CPU; no builds, tests or profiling from this agent overlap the repeats.
The load log is `apps/web/test-results/perf-ready-matrix.log`, with accepted samples in
`perf-quiet-{before,after}-{1,2,3}-load.json`. This is still a shared-host comparison, not a
confidence interval or a claim of dedicated-machine isolation.

The first-pass copy is `git archive 5d4dd7f` under ignored `.golden/perf-baseline`, with shared
external dependencies and an explicit Vite alias to its separately built Worker package.
The bundle source map was checked to contain the first-pass analysis client, not the follow-up.
No Git write operation is needed. Baseline retains its original benchmark's workflow objective
probe because its ranking controls are inert. Follow-up uses real UI, including menu/tab work.
These are complete user scenarios, not an isolated causal estimate of the Worker change.

## Repeated results

The fresh three-pair matrix completed with zero page or interaction errors in every repetition.
The load gate accepted two consecutive samples at or below 35% host CPU before each pass. Earlier
single-run comparisons and the interrupted `repeat-*` artifacts are superseded and are not pooled
into these values. Timing runs did not enable tracing or CPU profiling.

Each cell is **median / maximum across three runs**. Long-task maximum and count are measured by
the `longtask` observer; `frames >50` is the number of rAF deltas above 50 ms. A zero long-task
maximum means no observed long task in that repetition.

| Scenario            | First-pass long-task max (ms) | Follow-up long-task max (ms) | First-pass count | Follow-up count | First-pass frames >50 | Follow-up frames >50 |
| ------------------- | ----------------------------: | ---------------------------: | ---------------: | --------------: | --------------------: | -------------------: |
| IS/OOS desktop 4×   |                 **480 / 545** |                **217 / 398** |        262 / 263 |       165 / 186 |             273 / 274 |            188 / 200 |
| WF desktop 4×       |                 **207 / 313** |                **118 / 126** |          14 / 14 |           8 / 9 |               14 / 20 |                6 / 9 |
| IS/OOS phone native |                   **65 / 70** |                    **0 / 0** |            1 / 1 |           0 / 0 |                 2 / 7 |                3 / 3 |
| WF phone native     |                     **0 / 0** |                    **0 / 0** |            0 / 0 |           0 / 0 |                 0 / 2 |                0 / 0 |

The raw per-run values are retained in `apps/web/test-results/perf/quiet-{before,after}-{1,2,3}`;
the aggregate JSON is `perf-quiet-{before,after}-summary.json`. Follow-up append batches stayed
at or below 100 trials in every run. Its desktop IS/OOS append p95 was about 9–10 ms; occasional
individual posts reached 69–84 ms under scheduling contention, so the cap bounds cloned work but
does not guarantee a wall-time bound. Reproduction requests sent a full snapshot once per Worker,
with later requests carrying parameters only. Replaced-run page heaps settled around 15–19 MB;
reusable reproduction Workers settled around 16.1–16.6 MB. The extra Worker heap is the deliberate
reuse tradeoff and was stable across both replacement runs.

## Where the remaining stalls come from

CDP captures `devtools.timeline`, V8 and user timing with a 512 MB buffer and streams JSON to disk.
`Profiler.start/stop` supplies the renderer V8 samples; both use Chrome's monotonic microsecond
clock. The analyzer selects the renderer thread containing `perf-live-begin`, excludes other
threads and work after `perf-live-end`, and source-maps sample stacks. It rejects missing marks.
Trace `RunTask` includes GC/system work that Long Tasks API can omit, so its counts/maxima need
not match the observer. CPU samples are statistical attribution, not exact function timers.
`thread` below is Chrome's actual thread CPU time; `wall` includes throttling and scheduling.

Five longest tasks in each fresh trace, milliseconds (times are seconds after the begin mark):

| Scenario          |      At | Wall / thread | Function and module; evidence                                                                                                                                                                                                                                                         |
| ----------------- | ------: | ------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IS/OOS desktop 4× |   0.238 |  177.2 / 43.3 | `OptimizationWorkerPool.optimize`, `packages/workers/src/optimizer-client.ts`: full `structuredClone(common)` and `structuredClone(parameters)` in the Promise executor. ~95 ms self samples there, ~26 ms GC. The only sweep post took 2.9 ms.                                       |
| IS/OOS desktop 4× | 126.148 |   159.2 / 4.2 | V8 `MajorGC` / `GCFinalizeMC`, 159.1 ms trace span; no application stack or Worker post.                                                                                                                                                                                              |
| IS/OOS desktop 4× | 184.205 |  148.7 / 41.2 | `SummaryCanvas` drawing effect and scatter point loop (`pages/optimize/summary/SummaryCanvas.tsx`), including repeated CSS `getPropertyValue`; `distributionView` in `workflows/optimize-views.ts`. ~36 / 13 ms inclusive/self samples respectively; ~52 ms idle samples in the task. |
| IS/OOS desktop 4× | 179.941 |  147.2 / 38.7 | Same summary effect: ~29 ms CSS-token reads, ~15 ms `distributionView`, ~23 ms GC and ~30 ms idle samples.                                                                                                                                                                            |
| IS/OOS desktop 4× | 189.338 |  143.4 / 33.1 | Real late objective click: React render/commit of Ranking/Popover and DistributionChart. `Ranking.tsx` onClick → `OptimizeSession.setObjective`; DOM deletion/update dominates self samples.                                                                                          |
| WF desktop 4×     |   0.040 |  135.2 / 31.8 | Start click: React `commitDeletionEffectsOnFiber` / `removeChild` and `react-resizable-panels` measurement, mounting `WalkForwardResults` from `OptimizePage.tsx`; first `SummaryChart` drawing effect.                                                                               |
| WF desktop 4×     |  23.470 |  127.1 / 33.5 | `drawSummary` in `walkforward/results/draw.ts` (~28 ms inclusive), `SummaryChart.tsx` effect, `selectionRecords` and fixed-parameter scans in `workflows/walk-forward.ts`.                                                                                                            |
| WF desktop 4×     |  23.330 |   87.8 / 22.3 | `OptimizeSession.#stability` → `AnalysisWorkerClient.request` → native postMessage, full window records: 40.7 ms measured serialization; summary effect shares the task.                                                                                                              |
| WF desktop 4×     |  17.621 |   77.4 / 18.7 | Next-window `OptimizationWorkerPool.optimize` input/parameter clone (~14 ms self samples), summary drawing and React commit in the same reply continuation.                                                                                                                           |
| WF desktop 4×     |   5.955 |   73.6 / 17.7 | Same next-window clone (~11 ms) plus `SummaryChart` effect's `document.fonts.ready` (~16 ms) and drawing.                                                                                                                                                                             |
| WF phone native   |   7.493 |   23.9 / 22.8 | V8 major GC, 23.4 ms trace span. No application stack.                                                                                                                                                                                                                                |
| WF phone native   |  10.049 |   17.7 / 15.1 | Settings-tab transition: React passive mount/style updates and Radix Presence `getAnimationName`.                                                                                                                                                                                     |
| WF phone native   |  15.172 |   13.8 / 13.2 | `OptimizeSession.#stability` → `AnalysisWorkerClient.request` native serialization (~9.4 ms samples), plus summary formatting.                                                                                                                                                        |
| WF phone native   |   3.336 |   12.5 / 11.5 | Settings-tab mount: React `completeWork`/DOM append and `SearchRanges.tsx` render.                                                                                                                                                                                                    |
| WF phone native   |  10.347 |    11.3 / 9.6 | Real filter-chip removal: React/Radix Select render and detached-fiber cleanup.                                                                                                                                                                                                       |

All identified heavy implementations existed in `5d4dd7f`; enabling the real Ranking UI exposes
its existing render cost during streaming. None of these top tasks is a batched `runAppend` or
new reproduction transfer. The earlier 794/1,072/263 ms observations had no CPU trace; these
captures do not establish their exact internal cause or prove that contention explains all of them.
The earlier LoAF evidence put them in startup reply/layout or an unattributed render phase.
WF uses `records`/`choose`/`stability` rather than the IS/OOS `AnalysisRun.view` append path.

Concrete follow-ups, kept out of this change because they are pre-existing costs:

- Split the initial parameter snapshot clone in `OptimizationWorkerPool.optimize` across host
  tasks while preserving invocation-time snapshot/cancellation semantics. Cache common input
  per sweep Worker too; it is still posted with every optimization chunk.
- In `SummaryCanvas`, read each CSS token once per draw, batch scatter points by color, cache
  geometry by summary identity, and avoid redrawing the whole plot solely for hover. Move
  `distributionView` sorting/histogram construction into the analysis Worker summary.
- Keep desktop result splits mounted across the empty → running transition, avoiding the
  synchronous DOM teardown/remount and repeated panel measurements in `OptimizePage.tsx`
  (outside this task's ownership).
- In `walkforward/results/SummaryChart.tsx`, subscribe to font readiness once, coalesce resize/view
  redraws, and draw once per frame. Its current effect draws immediately and again on an already
  resolved `fonts.ready` promise. Move `selectionRecords`/fixed-parameter scans and window records
  for choose/stability into Worker-owned storage; request results by run/window id. The WF chart
  and `walk-forward.ts` modules are outside this task's paths.
- Scope Ranking/Popover subscriptions and memoize unaffected setup sections so objective/filter
  clicks avoid broad React commits. These components are outside the newly authorized fix paths.

GC cannot be assigned to a particular allocation site from this CPU trace. Heap sampling and
retained-size profiling would be required before claiming a GC fix. Throttling and host scheduling
also inflate wall time: the 159 ms GC task used only 4 ms of renderer thread CPU.

## Verification and reproduction

From the repository root, after dependencies/packages are built:

```powershell
$env:PERF_SCENARIOS = 'is-oos-desktop-4x,walk-desktop-4x,walk-phone-1x,is-oos-phone-1x'
$env:PERF_LABEL = 'review-after-1'
npm run perf:live -w @pine/web
# Repeat with labels -2 and -3; alternate before/after order in separate baseline/current copies.
node apps/web/scripts/perf-repeat-report.ts apps/web/test-results/perf/review-after-1 apps/web/test-results/perf/review-after-2 apps/web/test-results/perf/review-after-3

$env:PERF_TRACE = '1'
$env:PERF_LABEL = 'review-trace'
$env:PERF_SCENARIOS = 'is-oos-desktop-4x,walk-desktop-4x,walk-phone-1x'
npm run perf:live -w @pine/web
node apps/web/scripts/perf-trace-report.ts apps/web/test-results/perf/review-trace/is-oos-desktop-4x
# Run the trace report for each other scenario too; unset PERF_TRACE for timing comparisons.
```

The benchmark is opt-in, outside the normal e2e spec glob. `PERF_PORT` defaults to 6274;
`PERF_TIMEFRAME=60` measures hourly bars instead, which are not acceptance evidence here.
`PERF_PROFILE=1` records just a CPU profile; `PERF_HEADED=1` shows Chromium. Artifacts include
raw observations, reports, screenshots, optional traces/profiles and exact bundle source maps.
Keep e2e output separate so Playwright does not clear the performance artifacts.

Build, all workspace typechecks and all 1,022 workspace tests passed (655 Node and 367 component
tests), including source-map/renderer attribution and repeated-result aggregation tests. All 80
e2e tests passed in 3.5 minutes with two workers on verified unused ports 6974–6976. `npm run check`
preserved the baseline: 293 compilation, 45,075,817 series, 4,091,028 trade and 9,982 metric
assertions, with no mismatches, unsupported cases or crashes. Logs are
`apps/web/test-results/perf-repeat-{build,typecheck,tests,e2e,check}.log`. The trace helper's typing
fixes were followed by another full workspace typecheck and focused trace tests. Final format
verification follows the report's completed measurements.

Gate commands:

```powershell
npm run build
npm run typecheck --workspaces
npm run test --workspaces
npm run format:check
$env:E2E_BASE_PORT = '6974'
npm run e2e -w @pine/web -- --workers=2 --output=test-results/e2e-perf-repeat
npm run check
```
