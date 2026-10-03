# TradingView Golden Data Capture Standard Operating Procedure (SOP)

[← Back to the test suite README.md](../README.md)

This guide defines the standard operating procedure (SOP) for capturing and exporting golden
datasets (`data.csv` and `report.xlsx`) from the official TradingView platform. It keeps test data
added to the suite clean, free of contamination, and traceable to its version.

Cases that need a calendar capture a separate, independent probe CSV, which a project script then
converts into `calendar.json`. See [calendar inputs](calendar-inputs.md#generation-and-recapture)
for the generation steps and provenance records.

---

## 🛠️ Prerequisites and environment requirements

1. **Account and history range**: record the actual account plan. If it has not been verified,
   record it as "unrecorded"; do not fill in Premium by default. Verify the complete history range
   of this calculation. The strategy report's **Backtesting range** should correspond to the
   chart's calculated history and endpoint. **Trading range** is the actual trading interval, and
   the first trade need not occur on the first market bar;
2. **No modification of data**: place the exported `data.csv` and `report.xlsx` in the
   corresponding directory exactly as exported. Never open and save them manually in Excel or a
   text editor (this prevents corrupted line endings or scientific notation);
3. **Stable paired export**: export strategies in the order CSV → XLSX → CSV, keeping the source,
   inputs, settings, history range, and endpoint unchanged throughout. Verify that the two CSVs are
   byte-for-byte identical and that the report's Backtesting range corresponds to the CSV
   (converted to the same timezone). File names or close export times do not prove that the
   snapshots are paired. If they do not match, keep the original files and record the discrepancy;
   do not splice or patch them yourself.
4. **Keep delivery separate from adoption**: first save the native files, a copy of the source
   actually used, and the capture record to a separate archive or the ignored `.golden/captures/`
   directory, and record their SHA-256. Add them to the suite only after verification. When
   revising an existing fixture, explain the provenance, coverage changes, and baseline migration,
   and keep the old evidence. Adopted cases store only the source, metadata, native exports, and an
   optional calendar. Provenance, pairing facts, and key anomalies go in `meta.capture` /
   `meta.notes`; execution context goes in `meta.execution`. Complete notes, manifests, and the
   paired original files from before and after stay in the archive and are not added as case
   files. Resolve historical paths according to the [archive notes](known-issues.md#historical-evidence).

---

## 📋 Standard four-step capture (4-Step Pipeline)

```
[Step 1: Chart ready] ──> [Step 2: Scroll full history] ──> [Step 3: Export CSV] ──> [Step 4: Paired strategy export]
   Check symbol/timezone     Scroll left until no more loads   Select UNIX seconds      Download native XLSX, then export CSV
```

### Step 1: Prepare the chart environment
1. Open the specified symbol and timeframe (for example `BATS:AAPL` 1h or `BINANCE:BTCUSDT` 1h);
2. **Environment check**: record the chart timezone, the standard candlestick chart type, dividend
   adjustment, and the Regular / ETH setting. If a daily chart does not offer a Session option,
   record that it is not selectable. If the data source in the title differs from the one in the
   export dialog, record both. For strategies, also record the Deep Backtesting and Bar Magnifier
   state; when either is enabled, do not assume the ordinary chart CSV contains all calculation
   inputs;
3. **Load the target script**: use a separate chart and apply only the target script. For v5 and
   v6, separately paste the original text of the corresponding `source.pine`, and confirm that
   Pine Editor compiles it successfully and that it actually executes. A script title, or an
   indicator with the same name already on the chart, does not prove which source is running. Keep
   an exact copy of the source. If compilation fails, record the complete error and line number; do
   not modify the source to work around it, and do not treat an export with only empty plots as a
   successful execution.

### Step 2: Load the full bar history
1. Keep scrolling the chart left, or use the keyboard shortcut to load history to the left, until
   no new bars appear on the left (so that `bar_index = 0` is loaded into memory);
2. Record the time of the last market bar, the export time (with timezone), and the refresh and
   Replay actions actually performed. For an ordinary historical baseline, prefer reloading and
   exporting after the market close. When specifically verifying a realtime or cached state, first
   keep the original state and its export, then refresh. If Replay is used, record the selection
   time, the actual final bar, whether it was stepped forward, and whether it was paused. Do not
   infer these actions or the final execution state from the output columns;
3. Keep every loaded row, including missing warmup values at the start and empty script outputs on
   the final bar. If the data turns out to start partway through a calculation, record that
   limitation; do not use observed positions, counters, or indicator values to fill in the engine's
   initial state.

### Step 3: Export market data and observed columns (`data.csv`)
1. Click the menu button at the top right of the chart (the hamburger menu $\equiv$ or the three
   dots) and select **Export chart data...**;
2. **Time format option**: **you must select UNIX timestamp (UNIX timestamp, seconds)**; never
   select the ISO format;
3. Click export and save the native file to this capture's directory. Record the actual data
   source, the first and last times, the row count, and the column names; do not rename the file by
   saving it again.
4. If the script outputs `bar_index`, check the downloaded file directly: the first row's index is
   0 and later indices are consecutive (the final row of an independently recorded Replay can be
   empty). Do not conclude that the export is complete only because the chart has been scrolled to
   the left. Verify again after refreshing, switching timeframes, or reapplying the script. If
   truncation is found, keep and mark the original file and recapture into a new directory. Record
   the account's history loading limit and native market data gaps as they are.

### Step 4: Export the strategy backtest report (`report.xlsx`) — *Strategy cases only*
1. Click the **Strategy Tester** tab at the bottom of the chart;
2. Switch to **Overview** or **List of Trades** and click the **Download data as XLSX** button at
   the top right. Keep the native sheet and metric names, even if a newer UI differs from older
   fixtures;
3. Save the native workbook to this capture's directory, then export the CSV again to complete the
   pairing check. The settings and backtesting range in the report's Properties must match the
   capture record.
4. **Restore properties**: if the case changed commission, slippage, or leverage in Properties,
   restore them after the export.

---

## ⚙️ Properties configuration checklist

If a case tests a specific order-matching environment, open the strategy settings (Settings $\to$
Properties) before exporting and set the values exactly:

| Case bundle | Required Properties field | Expected value / option |
|---|---|---|
| `S_commission_slippage__pct` | Commission | `0.1 %` (percent) |
| `S_commission_slippage__per_contract` | Commission | `0.05 USD per contract` |
| `S_commission_slippage__per_order` | Commission | `1 USD per order` |
| `S_commission_slippage__slip3` | Slippage | `3 ticks` (Commission set to 0) |
| `S_margin` | Margin / Leverage | Long/Short leverage set to `4x` (25% margin) |
| `S_calc_on_order_fills` | Script execution | Check `On bar close, On order fill` |
| `B_orders_strings__delay` | Order execution delay | `One tick` |
| `B_orders_strings__none` | Order execution delay | `None` |

---

## 📝 Backfill and calibrate `meta.json`

After capture, update `meta.json` from the actual exported files:
1. **Time and environment fields**:
   - `data.exported_at`: the UTC ISO time of this export (for example `"2026-09-04T18:00:00Z"`);
   - `data.plan`: fill in from the actual record; if it has not been verified, enter
     `"unrecorded"` and explain why;
   - `data.tv_release_month`: the current TradingView release month (for example `"2026-09"`).
2. **Independent source for symbol contract information**:
   - Record an independent source for `meta.syminfo`, such as the report's Properties, exchange
     specifications, or a separate metadata probe, and keep its version, symbol, and native files.
     Do not set engine inputs solely by reading the expected output columns of the fixture under
     test; do not derive the quantity step from the price tick either.
   - For cases that depend on sessions or period boundaries, run the independent calendar probe and
     export its CSV from TradingView, convert it with `packages/golden/scripts/import-calendar.ts`,
     save `calendar.json` in the case, and set `session_calendar: { "file": "calendar.json" }`.
     Keep the raw CSV and its SHA-256, and confirm that the symbol, timezone, session, and coverage
     apply; see the [calendar capture notes](calendar-inputs.md). Do not infer the calendar from
     expected indicator values, and do not rely on other cases or a global directory to supply
     inputs.
3. **Revising existing cases**:
   - When the source, native data, or report schema changes, list the old and new hashes, the
     mapping of checks, and the coverage changes, and migrate the baseline explicitly after an
     independent review. Do not silently change `verified`, delete failing items, or relax
     comparison rules.
