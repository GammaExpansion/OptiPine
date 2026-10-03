# Golden data revision log

[Back to the suite overview](../README.md). The suite currently has 246 cases: 240 verified and
6 unverified. Raw capture records are kept outside the repository; current provenance is in each
fixture's `meta.capture` and `meta.notes`.

## 2026-09-21

- Added the independent v6 parse case `P_syn_int_division`: the native Pine Editor accepts
  assigning `timeframe.in_seconds(timeframe.period) / 61` to an explicit `int`.
  The chart displays a fraction; only an explicit `int(...)` truncates. The readings were not
  fabricated into a CSV golden.
- Community strategies that enable Bar Magnifier are not adopted into the suite: Bar Magnifier
  needs lower-timeframe data the engine is not given.
- Independent recaptures confirmed the na trailing offset and the display commission convention
  for open positions; the number of adopted cases is unchanged. The loader supports the native
  Volume column position. Trade comparison now uses the display commission computed at the mark
  and the actual realized balance. The comparison implementation fingerprint was migrated
  explicitly; the sources, inputs, expected observations, precision, and all previously matching
  assertions of the 240 verified cases are unchanged.

## 2026-09-19

- Added four independent v6 language indicator cases: `I_generic_values`,
  `I_leading_continuations`, `I_drawing_presence`, and `I_plot_linestyles`. Each preserves 27,046
  native BINANCE:BTCUSDT 60-minute bars, indexed contiguously from 0, and all output series match.
- Loading history to the left confirmed that the earliest history available to the account is
  2022-01-01, and that the actual last bar of the paused Replay is 2025-01-31 23:00 UTC. A first,
  partial export of 300 rows was rejected. The drawing column-order issue was resolved by
  adjusting the display order in TradingView and exporting again. The native files were not
  trimmed, reordered, or padded with values.
- The unmodified `P_request_result_types` source compiled successfully in an independent
  Pine Editor check and joined the verified parse cases. It verifies only the bool/tuple result
  types of request calls; it adds no secondary data or runtime request support.
- `S_timestamp_trade_types` completed a native CSV → XLSX → CSV pairing. The CSV exports before and
  after are identical byte for byte, and the XLSX Backtesting range matches the first and last of
  the 27,046 chart bars. All 11 outputs, 3,758 closed trades, and report metrics match. The blank
  script outputs on the final Replay bar are preserved as exported; the execution context is
  recorded explicitly in `meta.execution`. The market quantity step comes from an independent
  metadata probe.
- The uniform file structure is unchanged: provenance summaries go in `meta.capture`; detailed
  records and rejected captures are kept in the capture archive outside the repository.

## 2026-09-16

- Independently rechecked v5/v6 `P_err_request_financial`, `P_err_request_security`, and
  `P_err_strategy_risk`. All 6 original sources compile successfully in TradingView and were
  promoted to verified. The IDs, sources, and compile expectations are unchanged; provenance is
  stored in `meta.capture`, and the full records remain in the archive. This verifies compilation
  only; it does not extend data input or runtime support for `request.*`.

- Fixed weekly `max_cons_loss_days`: an equity decline over a completed period counts toward the
  losing streak. The already submitted full-size close order and the risk order whose quantity is
  fixed when the rule triggers fill in sequence, reproducing the native reversed position and the
  subsequent halt.
- Fixed the boundaries exposed by that report for the run-up percentage at negative equity and for
  the average profit/loss ratio when there are no winning trades.
- The native source, CSV, XLSX, capture records, and comparison rules of
  `S_risk_max_cons_loss_days__2_weekly` were not changed; it passes 217 independent strict checks
  and 218 suite checks and was promoted to verified. This fix used the existing native capture.
- Four independent weekly CSV → XLSX → CSV sets were then recaptured. The full and partial
  scheduled closes each pass all 215 strict checks, leaving positions of -2 and -1 respectively.
  Without a scheduled close, count 1 / count 2 are closed by the risk rule on 2024-01-15 / 01-22
  respectively, and all series and trades pass. However, native Sharpe and Sortino are empty while
  the engine returns numbers, so each passes 213/215 checks and remains unverified. Fill callbacks
  and the priority among multiple risk rules still have no independent native verification.
- Cases returned to the uniform file structure: provenance summaries, hashes, and pairing facts are
  merged into `meta.capture`, and the Replay selection time and paused state are stored directly in
  `meta.execution`. A stepping state that the old records do not establish is not fabricated. Extra
  notes, manifest, audit, and diff files moved to the capture archive outside the repository. The
  native sources, CSV, XLSX, calendars, and comparison rules are unchanged. Checks for the existing
  225 verified cases are retained; the baseline only migrates the metadata fingerprint explicitly
  and includes the new cases.

## 2026-09-13

- The existing harness, fixtures, and maintenance scripts moved into the `@pine/golden` workspace;
  the former `tests/` directory moved as a whole to `packages/golden/fixtures/`. The engine and CLI
  moved into `@pine/engine` and `@pine/cli` respectively and are called through public package
  entry points. Native sources, market data, reports, metadata, and provenance records keep their
  original bytes; the directory and build migration does not change comparison assertions or
  tolerances.
- The comparison-rule fingerprint is carried with the golden build output, so the compiled CLI can
  run. The baseline fingerprint migration was accepted explicitly after a full regression run
  confirmed it, and every existing assertion was kept.

## 2026-09-12

- Trading calendars became explicit inputs inside each case: the 8 v5/v6 cases `I_volume`,
  `M_time__aapl_60`, `M_time__aapl_D`, and `S_risk_max_intraday_filled_orders` declare a local
  `calendar.json` in their metadata, identical byte for byte to the original independent capture.
  A comparison of complete engine outputs confirmed that the other 56 cases that previously
  received a calendar automatically do not need one; the global directory and the per-symbol
  matching logic were removed. This change migrated only inputs and provenance fingerprints; native
  expectations and every comparison assertion are unchanged. See
  [calendar inputs](calendar-inputs.md).
- AAPL daily v5/v6 were recaptured from their own unmodified sources in a context refreshed during
  a market closure; each keeps 11,523 rows and 63 columns.
- Crypto v5/v6 use a stable CSV → XLSX → CSV pairing over the same calculation range. The new v5
  revision removes only the mincontract plot that does not compile; the other 12 columns and the
  trading logic are unchanged.
- Added a v5 mincontract compile-error case and an independent v6 numeric case. The provenance
  attribution of the original successful v5 output remains disputed.
- The baseline migration explicitly mapped plot positions and the native Expectancy names;
  comparison precision and verified status were not relaxed. The scope of the adjustments is now
  recorded in each fixture's metadata.
- The shifted standard deviation for both versions was fixed in the engine calculation; the
  original numeric fixtures are unchanged, and all 202 verified cases pass.

## Initial source calibration

- I_collections sums the matrix with array.sum over its two rows; matrix.sum itself is element-wise
  matrix addition.
- I_lang_series caps the dynamic history offset at 10,000 to avoid native RE10007; the column is
  named dynamic_offset_capped.
- syminfo.session reports the regular/extended mode; the session string is stored separately in
  session_hours.
- P_err_input_in_function actually compiles successfully; its original ID is kept.
- P_err_continuation_4spaces is a compile error in v5 and compiles successfully in v6; an EMA
  series length is a type error in both versions.

Capture, adoption, and regression rules are in the [capture procedure](collecting-golden-sop.md).
