# Current golden data limits

Updated 2026-09-21. All 240 verified cases match; the 6 unverified cases do not take part in the
regression gate. This page records only the limits that still affect how the suite is used. It
does not keep process logs of completed captures.

The 4 remaining parse cases, v5 `P_err_no_version` and `P_err_version_4` and v5/v6 `P_err_import`,
have not yet completed a native compile recheck.
The other 2 unverified cases are the weekly ratio differences in the table below. The newly
confirmed `request.security` and `request.financial` cases record only that they compile
successfully; they do not verify runtime results for requested data.

All six language regression probes have completed their native checks.
Of these, `P_request_result_types` verifies compilation only; the drawing ID state and the plot
linestyle series do not mean that the engine supports drawing rendering.

| Case | Current status |
|---|---|
| `S_sizing_crypto` ([v5](../strategy/v5/S_sizing_crypto), [v6](../strategy/v6/S_sizing_crypto)) | The current capture and source revision pass completely; the v5 `syminfo.mincontract` compile error is recorded by a separate case |
| `M_time__aapl_D` ([v5](../indicator/v5/M_time__aapl_D), [v6](../indicator/v6/M_time__aapl_D)) | Complete-history captures of the original sources with an explicit version, taken during a market closure after a refresh, pass completely; the mixed tail state of the old snapshot was not reproduced |
| `A_numeric_semantics` | The v5/v6 shifted standard deviation is implemented with a fixed-length compensated rolling sum |
| `S_risk_max_cons_loss_days__hold_1_weekly` / `__hold_2_weekly` (v6) | Both native weekly paired captures are complete. All series, trades, and other metrics pass; only Sharpe and Sortino are empty in TradingView while the engine returns numbers. Each passes 213/215 strict checks and remains unverified; no native values or comparison rules were changed |

The weekly full-close and partial-close recaptures both pass completely, leaving positions of -2
and -1 respectively. This confirms that the risk order quantity is taken from the position held
when the rule triggers. Cancellation from fill callbacks and the priority of multiple risk rules
triggering at once still lack independent native verification.

Separate fixtures record the TradingView v5 `syminfo.mincontract` compile error and the v6 numeric
output. The provenance of the old successful v5 output still cannot be traced; the new revision
removes only that invalid plot and keeps the rest of the order logic and outputs. Do not treat
inconsistencies in the old provenance as current v5 runtime capability.

An unclosed final bar can retain market data without script outputs; Replay selections for
strategy cases are recorded explicitly in `meta.execution`. Without such a record, the live
execution state cannot be inferred from OHLCV.

Each capture keeps the original CSV/XLSX, source, and notes in the archive. Changing a fixture
requires a baseline update and an explanation of the provenance change. Do not derive engine
inputs or settings from expected plot values.

A trading calendar is an input declared by the case that needs it; do not assume one is supplied
based on `tickerid` alone. Coverage and the limits of the provider's historical data are described
in [calendar inputs](calendar-inputs.md).

## Historical evidence

An adopted case keeps only `source.pine`, `meta.json`, the native exports it needs, and an optional
`calendar.json`. Provenance, pairing conclusions, and key anomalies are stored in `meta.capture` /
`meta.notes`; Replay execution inputs are stored directly in `meta.execution`. The loader no
longer depends on additional capture documents.

The complete original capture notes, manifests, audits, and diffs are kept in the maintainer's
local archive and are not distributed with the repository. Some `.golden/captures/...` paths in
`meta.capture` point to that archive and serve only as provenance records.

`tests/calendars/tradingview-aapl.json` in old manifests refers to the original independent
calendar. The same original file is now stored, with its bytes unchanged, as `calendar.json`
inside each case that needs it. `probe.pine` in the calendar provenance corresponds to the current
`packages/golden/scripts/probes/calendar.pine`.

The pre-migration `tests/` directory is now `packages/golden/fixtures/`, and `scripts/` is now
`packages/golden/scripts/`. Old paths in the original notes, manifests, and calendar provenance
fields keep their original text; use this mapping to find the current files.

The archive is not a runtime dependency of ordinary tests or CI. The sources, market data,
reports, metadata, and required provenance records of adopted fixtures, and the regression
baseline, all remain in the repository.
