# Strategy Case Guide

[← Back to the test suite overview](../README.md)

Strategy cases record the actual behavior of TradingView's order matching engine (Broker Emulator) in order lifecycle, matching priority, position calculation and report metrics. Per-bar state columns are exported with the chart; individual trades and summary metrics are exported with the strategy report.

For the complete list of case directories, see [**`INDEX.md`**](./INDEX.md).

---

## 📊 Suite size and coverage

- **Total cases**: 64 independent case directories (21 under `v5/*`, 43 under `v6/*`); 62 verified, 2 unverified.
- **Version isolation**: v5 and v6 share the same source apart from the converted version line. Each is exported natively in TradingView on its own; nothing is reused across versions.
- **Files**: each captured case directory contains these 4 files:
  - `source.pine`: the test strategy source (fixed periodic schedule, no indicator dependencies)
  - `meta.json`: test metadata (symbol, time zone, export information and verification status)
  - `data.csv`: the full bar history from the TradingView chart export (including per-bar state monitoring plot columns)
  - `report.xlsx`: the native 5-sheet export of the TradingView strategy report (Performance, Trades analysis, Risk-adjusted performance, Trades, Properties)
- **Verification status**: 62 cases pass in full. The weekly consecutive-loss recapture confirmed the behavior when a full or partial close fills together with a fixed-quantity risk order. In the two cases closed only by the risk rule, only Sharpe and Sortino still disagree; they remain unverified. See [known issues](../docs/known-issues.md).

> [!NOTE]
> `verified: true` in `meta.json` means the test data has been checked for completeness against TradingView's official output and cross-audited.

---

## 🧭 Module categories and test matrix

Interleaved features in a single complex strategy make results hard to attribute. To avoid this, all cases are strictly isolated by feature into 7 modules:

### 1. Pending order lifecycle and matching
| Case bundle | Core question | Key assertions |
|---|---|---|
| `S_pending_entries` | How pending orders above and below the market price trigger; when an amendment with the same ID takes effect; how cancellation interacts with closing | • `limit / stop / stop-limit` trigger conditions<br>• `stop-limit` with `limit > stop` (fills on trigger) and `limit < stop` (waits for a pullback after triggering)<br>• Exit orders are cancelled automatically after a close (prevents ghost fills, `GhostExit`) |
| `B_orders_strings__delay`<br>`B_orders_strings__none` | Order price rounding direction and order execution delay (Probe B baseline) | • Fill timing under `Order execution delay` (One tick vs None)<br>• Raw string alignment of `str.tostring / str.format` in Trades.Signal |
| `S_limit_verification__2` (v6) | Two-tick limit verification | Price verification for long and short pending orders, price improvement on opening gaps; the source constant 2 and the raw report label are recorded separately |
| `S_limit_verification__0` (v6) | Control with limit verification disabled | Properties explicitly overridden to Requested price; together with the native report this confirms N=0 |
| `S_limit_verification__1` (v6) | One-tick limit verification | A separate source changes only the verification constant to 1; N=1 and N=2 have the same native report label and are distinguished by the source and the capture record |
| `S_limit_verification_marketable__2` (v6) | Marketable limit orders with two-tick verification | How long and short limit orders relate to the market price, the verification condition and the opening fill price |
| `S_limit_verification_stop_limit__2` (v6) | Two-tick verification after a stop-limit activates | Cannot fill before the stop activates; after activation it must pass limit verification |
| `S_limit_verification_exit__2` (v6) | Two-tick limit exits | Exit orders activated after the entry, price improvement when already marketable |

### 2. Exit and bracket order semantics
| Case bundle | Core question | Key assertions |
|---|---|---|
| `S_exit_brackets` | Matching race when stop-loss and take-profit orders are both pending; priority of relative and absolute parameters | • 4-tick path race when a tight 0.15% bracket is satisfied on both sides within one bar<br>• **Key v5 vs v6 difference**: when `profit/loss` and `limit/stop` are both set, v5 gives priority to the absolute price and v6 to whichever triggers first |
| `S_exit_partial` | Partial exit quantity allocation and order association coverage | • Reserved shares (e.g. 19+20, where only 1 share is left for the second)<br>• `qty_percent` closes in proportional batches<br>• An Exit without `from_entry` stays bound to later Entries |
| `S_trailing` | Trailing stops and trailing stop level calculation | • Long and short activation and trailing with `trail_price` / `trail_points` + `trail_offset`<br>• Coupling between tracking the High/Low extremes and the 4-tick path assumption |
| `S_close_variants` | Behavior of the whole close API family and its default text | • Default Signal text from `close(id)` without a comment<br>• Partial closes with `qty` and `qty_percent`<br>• Fill timing when `immediately=true` forces an immediate fill |

### 3. Pyramiding and multi-order matching rules
| Case bundle | Core question | Key assertions |
|---|---|---|
| `S_pyramiding_fifo` | Pyramiding limit and FIFO close order | • With `pyramiding=3`, the 4th Entry is silently ignored<br>• The actual exit matching sequence of `close("E2")` under the FIFO rule |
| `S_pyramiding_any` | Closing a specific order under the ANY rule | • Under the ANY rule, `close("E2")` targets and closes exactly the specified Entry |

### 4. Commission, slippage and margin leverage
| Case bundle | Core question | Key assertions |
|---|---|---|
| `S_commission_slippage__*` | Commission modes and where slippage applies | • 4 modes: Base(0/0), 0.1% percent, 0.05 USD/share, 1 USD/order<br>• Market/Stop orders take slippage; pending Limit orders do not<br>• Commission base for both entry and exit sides |
| `S_margin` | 4x leverage (25% margin) and forced liquidation | • Margin Call trigger threshold and per-bar `margin_liquidation_price`<br>• Number of liquidations, liquidated quantity and bankruptcy protection |

### 5. Event-driven recalculation triggers
| Case bundle | Core question | Key assertions |
|---|---|---|
| `S_calc_on_order_fills` | Intrabar recalculation triggered by order fills | • Number of executions within one bar (`calcs_on_bar`) and the cap at 4<br>• The OHLC slice and instantaneous position state seen during recalculation<br>• On which tick a market order submitted during recalculation fills |

### 6. Risk management rules
| Case bundle | Core question | Key assertions |
|---|---|---|
| `S_risk` (compatibility bundle) | Combined risk baseline | Activates three risk rules at once; keeps the historical baseline from before the split |
| `S_risk_allow_entry_in` | One-direction entry rule | Under `allow_entry_in(long)`, a short entry while long becomes a close; a short entry while flat is rejected |
| `S_risk_max_position_size` | Maximum position size cap | A 40-share order is cut to the 25-share limit; handling of later Entry and Order calls once the position is full |
| `S_risk_max_intraday_filled_orders` | Intraday filled-order limit | After the daily fill count reaches the limit (3), later orders (including close_all) are blocked; trading resumes on the next day, across the overnight boundary |
| `S_risk_max_drawdown__cash` (v6) | Cash drawdown 100 | A drawdown in realized balance triggers a permanent halt; unrealized profit and loss is observed separately |
| `S_risk_max_intraday_loss__cash` (v6) | Intraday cash loss 100 | A loss relative to start-of-day equity triggers a forced close; trading resumes the next trading day |
| `S_risk_max_cons_loss_days__2` (v6) | Two consecutive losing days | Accumulates realized PnL per complete trading day; halts permanently once the threshold is reached |
| `S_risk_max_cons_loss_days__1` (v6) | One losing day | Threshold explicitly overridden to 1; halts permanently after the first complete losing trading day; captured independently and compared with the two-day threshold |
| `S_risk_max_drawdown__percent` (v6) | Percent drawdown 1% | A drawdown of realized balance from its peak triggers a permanent halt; unrealized profit and loss does not trigger it |
| `S_risk_max_intraday_loss__percent` (v6) | Intraday percent loss 1% | A loss relative to start-of-day equity triggers a forced close; realized profit earlier in the day can offset later unrealized losses |
| `S_risk_limits__control` (v6) | Risk-rule control | Same market and schedule, with risk thresholds set out of reach; compared with each risk mode's separate native export |
| `S_risk_max_intraday_loss__cash_march` / `__cash_april` (v6) | Range boundaries for report risk ratios | Separate exports ending in March and in April; verify that Sharpe/Sortino choose daily or monthly observations by trading range |
| `S_risk_max_intraday_loss__cash_weekly` (v6) | Weekly cash loss rule | Each weekly bar is a risk period; negative starting equity for a period suspends the cash threshold, which takes effect again once starting equity is positive |
| `S_risk_max_cons_loss_days__2_weekly` (v6) | Weekly consecutive losing days | Unrealized losses across periods trigger the halt; the scheduled full close and the fixed-quantity risk order fill at the same open and leave a reverse position; the complete series, trades and report are verified |
| `S_risk_max_cons_loss_days__full_close_2_weekly` / `__partial_close_2_weekly` (v6) | Simultaneous full / partial close | Initial position 2; after the scheduled close of 2 / 1, the fixed-quantity risk order sells 2, leaving -2 / -1 respectively; all series, trades and metrics pass |
| `S_risk_max_cons_loss_days__hold_1_weekly` / `__hold_2_weekly` (v6) | Position held across one / two losing periods | Closed by the risk rule on 2024-01-15 / 01-22 respectively, then halted; series and trades pass; Sharpe and Sortino are empty natively but numeric in the engine, so these are not yet verified |

### 7. Symbol precision and minimum quantity step
| Case bundle | Core question | Key assertions |
|---|---|---|
| `S_sizing_crypto` | High crypto precision and very small quantity steps | • Rounding and truncation rules for fractional positions (0.0123456 BTC)<br>• Skipping of very small orders below `syminfo_mincontract` (e.g. 1e-7) |

---

## 📐 Design conventions

So that each case exposes only one matching behavior, free from technical indicator error or data fluctuations, Strategy cases follow these conventions:

1. **Deterministic scheduling**:
   Trade signals depend on the bar index and an explicit start point, not on `ta.*` indicators. Periodic cases repeat an order sequence; position probes act only at specified indices.
2. **State isolation depends on the case's purpose**:
   Basic periodic cases close positions and cancel orders at the end of each cycle. Risk probes keep positions across cycles or halt permanently in order to observe the later effects.
3. **Observable state**:
   Relevant columns such as index, position, equity, unrealized PnL, realized PnL and trade counts are exported. Each case's source and metadata define the exact column names and count.
4. **Explicit configuration (Explicit Properties)**:
   Every `strategy()` parameter is written explicitly in the code. The TradingView chart Properties must be set exactly as the configuration list specifies, so that default settings cannot alter the test semantics.

---

## 📋 TradingView capture configuration SOP

When capturing test data, follow these chart and Properties settings exactly:

| Case bundle | Target chart (Symbol / TF) | Required TradingView Properties settings |
|---|---|---|
| Most basic cases (`S_pending_entries`, `S_exit_*`, `S_trailing`, `S_pyramiding_*`, `S_close_variants`) | BATS:AAPL 1h | Keep defaults (no special changes) |
| `S_commission_slippage__base` | BATS:AAPL 1h | Commission = 0, Slippage = 0 |
| `S_commission_slippage__pct` | BATS:AAPL 1h | Commission = `0.1 %` (percent) |
| `S_commission_slippage__per_contract` | BATS:AAPL 1h | Commission = `0.05 USD per contract` |
| `S_commission_slippage__per_order` | BATS:AAPL 1h | Commission = `1 USD per order` |
| `S_commission_slippage__slip3` | BATS:AAPL 1h | Slippage = `3 ticks`, Commission = 0 |
| `S_margin` | BATS:AAPL 1h | Long / Short leverage = `4x`; confirm Margin calls > 0 in the report |
| `S_calc_on_order_fills` | BATS:AAPL 1h | Script execution: check `On bar close, On order fill` |
| Basic `S_risk`, `S_risk_allow_entry_in`, `S_risk_max_position_size`, `S_risk_max_intraday_filled_orders` | BATS:AAPL 1h | Default settings |
| Account-risk and consecutive-loss isolation probes | BINANCE:BTCUSDT 1h / 1W | Set according to each case's `meta.inputs`, `meta.settings` and `meta.execution` |
| `S_sizing_crypto` | BINANCE:BTCUSDT 1h | Default settings; `mincontract` comes from an independent metadata probe, and `mintick` and other values are confirmed by the report Properties; see `meta.capture` for provenance |
| `B_orders_strings__delay` | BATS:AAPL 1h | Order execution delay = `One tick` |
| `B_orders_strings__none` | BATS:AAPL 1h | Order execution delay = `None` |

### Standard export procedure
1. Scroll the chart to the far left and make sure the full history has loaded (`bar_index = 0`).
2. Click **Export chart data** (choose the UNIX time format) and save it as `data.csv`.
3. Open the Strategy Tester report, click **Download data as XLSX** and save it as `report.xlsx`.
4. Export the CSV again and check that the two copies are identical byte for byte and that the report's Backtesting range matches the native CSV. Keep the source, inputs, settings, history and endpoint unchanged. After capturing a variant that changed Properties, always restore them. See [**`collecting-golden-sop.md`**](../docs/collecting-golden-sop.md) for the detailed procedure.

---

## ⚠️ Key boundaries and known caveats

> [!WARNING]
> **Margin Call liquidation coverage**:
> On the AAPL 1h timeframe, leveraged positions last only 18 bars, so liquidations rarely trigger under normal market conditions. Across the full 11-year history they occurred only a few times, in extreme markets (such as March 2020). If a shorter history range yields Margin calls = 0, raise `default_qty_value` to 400 and export again to ensure at least 1 liquidation.

> [!NOTE]
> **`calc_on_order_fills` recalculation behavior**:
> TradingView limits recalculation to at most 4 times within each bar. A close order issued during recalculation may fill on the next tick of the same bar, or be deferred to the Open of the next bar. Both are valid behavior under different extreme market conditions.

> [!NOTE]
> **`S_sizing_crypto` rule for very small orders**:
> If an order's quantity is below the minimum allowed step (`syminfo_mincontract`), TradingView skips the order outright. The Trades records then show only two trades for that cycle.
