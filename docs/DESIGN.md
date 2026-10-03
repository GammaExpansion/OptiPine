# Pine Engine Design

Build an offline Pine Script v5 / v6 engine for indicator evaluation, strategy backtesting,
and eventually parameter optimization. TradingView results in [golden fixtures](../packages/golden/fixtures/README.md)
provide the compatibility baseline.

This document defines the goals, boundaries, and development loop. Implementation choices
follow working examples and measurements. Fixture analysis and unresolved semantics live in
[compatibility notes](COMPATIBILITY_NOTES.md).

## 1. Goals and scope

- Compile Pine v5 / v6 scripts and report useful diagnostics.
- Reproduce indicator outputs, strategy trades, and report metrics for supported features.
- Grow compatibility incrementally using verified TradingView fixtures.
- Keep the engine usable in Node and a browser, with a hosted optimizer as the eventual product.

The initial scope is the language and backtesting behavior exercised by the golden suite.
Passing the suite demonstrates compatibility for those cases; it is not a claim of complete
Pine support. Additional scripts and focused probes should expand coverage as the engine grows.

Secondary data requests, published library imports, bar magnifier, live tick processing,
drawing rendering, and currency conversion are deferred. Their priority can change when a
concrete use case requires them. APIs that affect computation still need correct behavior or
an explicit unsupported result, even when their visual output is outside scope.

Compatibility limits for unclosed final bars are tracked in the
[compatibility notes](COMPATIBILITY_NOTES.md).

## 2. Principles

1. **Use observed TradingView behavior as the reference.** Verified fixtures are acceptance
   evidence within their recorded version, inputs, and settings. When documentation and a
   fixture disagree, investigate that context and add a focused probe if needed.
2. **Keep expected results outside the engine.** The engine receives source, market data,
   and execution settings. Only the harness reads expected plots, trades, and metrics.
3. **Separate evidence from hypotheses.** Record uncertain behavior with the available
   evidence and the probe needed to resolve it. A passing parse test establishes compilation
   behavior only. Unknown semantics do not require a default or a configurable policy switch.
4. **Report coverage separately from correctness.** Distinguish unsupported features,
   mismatching results, and execution failures. Never silently substitute a plausible result
   for a feature whose behavior has not been implemented.
5. **Preserve established compatibility.** Improvements must pass the regression rules below.
   An aggregate score cannot compensate for breaking a previously working result.

## 3. Structure and boundaries

TypeScript is the working language choice. Keep core computation independent of filesystem,
process, and DOM access so it can run in Node and a browser. The adapters own environment
integration. Parser technique, build tools, storage layout, libraries, and concurrency model
remain implementation decisions.

### Directory layout

Use npm workspaces to separate pure computation, compatibility verification, and integration:

```text
OptiPine/
├── apps/
│   └── cli/
│       ├── src/main.ts         # Command-line entry point
│       ├── tests/              # CLI integration tests
│       └── package.json
├── packages/
│   ├── engine/
│   │   ├── src/
│   │   │   ├── index.ts        # Public compile, run, and sweep API
│   │   │   ├── compiler/       # Syntax, semantic checks, and diagnostics
│   │   │   ├── runtime/        # Evaluation, history, state, and builtins
│   │   │   └── broker/         # Orders, matching, and accounting
│   │   ├── package.json
│   │   └── tsconfig.build.json
│   ├── messages/               # Plain-data text and coded errors shared by the packages
│   ├── optimizer/              # Search spaces, validation, walk-forward, and result analysis
│   ├── market-data/            # Binance and Yahoo feeds, proxy middleware, CSV and profiles
│   ├── workers/                # Engine and analysis Workers and the optimization pool
│   └── golden/
│       ├── src/                # Load, normalize, compare, run, and baseline
│       ├── fixtures/           # Native TradingView evidence and documentation
│       │   ├── parse/
│       │   ├── indicator/
│       │   ├── strategy/
│       │   └── golden-baseline.json
│       ├── scripts/            # Build fingerprint, calendar import and its probe
│       ├── package.json
│       └── tsconfig.build.json
├── docs/
├── .github/workflows/
├── package.json                # Shared tasks and npm workspaces
├── package-lock.json
└── tsconfig.base.json
```

- **Dependencies:** `@pine/cli -> @pine/golden -> @pine/engine`; `@pine/optimizer` and
  `@pine/market-data` depend on `@pine/engine` and `@pine/messages`; `@pine/workers` adds
  `@pine/optimizer`; an application can use all five. The CLI may also call the engine
  directly. Packages use explicit public exports, never another package's `src/` path. The
  engine does not depend on the harness or read golden files.
- **Builds:** each workspace owns its configuration and `dist/`. Root tasks build in
  dependency order. The engine exports ESM and type declarations without environment
  dependencies; the harness and CLI use Node. The harness carries its comparison
  fingerprint with the built package.
- **Tests:** keep unit tests beside the modules they test and CLI integration tests in
  `apps/cli/tests/`. `packages/golden/fixtures/` holds TradingView fixtures, their documentation,
  and the baseline.
- **Market data:** each fixture owns its inputs. A fixture that needs calendar metadata
  declares a local `calendar.json` in `meta.json`; the harness loads only that declaration.
  The engine receives the calendar as an explicit input and never locates market data.
- **Evidence:** current conclusions live in the compatibility notes. Raw captures, the tools
  that audit them and temporary experiments belong outside the checkout; generated reports
  are ignored local artifacts. Probes needed to collect new fixtures, such as the calendar
  probe, live in `packages/golden/scripts/`.
- **Grow with the code:** use descriptive module names and add subdivisions when responsibilities
  justify them. Keep `@pine/engine` as the public computation entry point.

### Inputs and outputs

Engine inputs include Pine source, OHLCV bars, symbol and session metadata, timeframe,
input overrides, and strategy settings. Outputs include diagnostics, execution warnings,
ordered plot series, trades, and metrics. Warnings describe ignored visual or logging
effects without failing the run; reading an unimplemented drawing value remains unsupported.

Each independent run has isolated state. For deterministic scripts, identical source, inputs,
and settings produce identical outputs, regardless of earlier runs.

Calendar input is optional. A fixture without a declaration supplies no calendar;
a declared file that is missing or invalid fails loading. Symbol metadata never selects
an internal calendar. See the [calendar input contract](../packages/golden/fixtures/docs/calendar-inputs.md).

Explicit run settings override script-declared defaults. Golden runs use the settings in
effect when the TradingView results were collected. The harness may read the report's
Properties sheet to recover them and passes normalized settings to the engine, without
expected performance data or fixture-specific identifiers. Missing or ambiguous settings
must be recorded explicitly in the harness; expected results must not be used to select
settings merely because they improve the match.

The fixture format and collection rules are defined in the [fixture README](../packages/golden/fixtures/README.md).
File parsing and export normalization belong to the harness.

### Compilation and execution support

Compilation checks syntax and semantics. A builtin with a known signature can pass those
checks before its runtime implementation exists; attempting to run such a script reports
`unsupported`. Missing compiler support is also reported as unsupported, not counted as a
matching TradingView compile error.

This distinction lets compilation coverage grow independently of execution coverage. The
exact diagnostic schema and command names can evolve with the implementation.

## 4. Validation and regression

### What to compare

| Tier                        | Acceptance evidence                                           |
| --------------------------- | ------------------------------------------------------------- |
| Compilation                 | TradingView compile status and, for errors, the recorded line |
| Indicator / strategy series | Output columns and their values on corresponding bars         |
| Strategy trades             | Ordered trade records, including missing and extra records    |
| Strategy metrics            | Individual report values                                      |

The harness reports `match`, `mismatch`, `unsupported`, and `crash` separately. A reproduced
TradingView compile error is a match; an engine failure is not. Cases marked
`verified: false` remain visible but do not gate changes until re-verified.

For numeric outputs, define tolerances alongside the comparator and justify them using
export precision and representative cases. Compare missing-value positions explicitly.
Check output shape and alignment before comparing values; missing bars or columns must not
disappear from the denominator.

Trade comparison must account for both missing and extra rows. A matching prefix can help
locate the first divergence, but cannot alone establish progress if erroneous trailing rows
have been added. Report metrics independently so trade matching cannot hide metric errors.

Start diagnostics with the case, version, column or trade field, first differing bar or row,
and expected/actual values. Add internal state tracing when real debugging needs justify it.

### Progress and the regression gate

Progress scores summarize partial compatibility by tier. For unchanged fixtures and
comparison rules, a change passes the regression gate only when:

- No tracked score decreases: series columns, compilation cases, trades, and metrics are
  checked independently rather than only through an overall average.
- Previously matching assertions still match, including individual series cells and report
  values; a gain elsewhere cannot hide a new mismatch.
- Previously supported checks remain executable, and previously matching trade prefixes
  do not shorten.

Keep an accepted baseline under version control once the first slice works. Baseline updates
are explicit and follow a full run of the tracked cases. CI checks against that baseline and
does not automatically accept the current output.

Changes to fixtures, tolerances, or scoring rules need an explained baseline update so that
measurement changes remain distinguishable from engine improvements. The baseline file
format and score formulas can be selected with the first comparators.

## 5. Development plan

Begin with one small, complete path through the system. Choose a verified indicator fixture
with a narrow feature set, or collect a focused one if the existing cases require too much.

| Stage                   | Outcome                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First working slice     | Run a small verified indicator in a specified Pine version; match at least one plot column over its full history and locate the first differing value on a mismatch |
| Repeatable validation   | Add targeted case selection, coverage reporting, and an explicit regression baseline                                                                                |
| Language and indicators | Expand compilation checks, history and state semantics, builtins, collections, and time behavior as cases require                                                   |
| Strategy backtesting    | Start with market orders and accounting, then extend matching, sizing, recalculation, risk rules, and metrics                                                       |
| Optimizer and product   | Evaluate parameter sweeps and browser integration against concrete user and performance requirements                                                                |

Only the first slice needs a detailed implementation plan now. Later stages describe a
direction; their ordering can change as dependencies and compatibility gaps become clearer.
A complete harness, report loader, or tracing system is not a prerequisite for the first
indicator result.

For each increment: select a behavior, inspect its evidence, implement it, compare the
relevant case, then run the tracked regression suite before accepting a new baseline.
Shortened histories can speed investigation, but acceptance uses the full tracked inputs.

Measure representative compile time, execution time, and memory use once an engine exists.
Set performance targets from those measurements and optimizer needs. Worker pools, compiled
program reuse, generated code, and alternative execution backends should follow demonstrated
bottlenecks.
