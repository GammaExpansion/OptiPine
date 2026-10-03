# Strategy Layer Case List (INDEX)

[← Back to strategy/README.md](./README.md) | [Back to the test suite overview](../README.md)

This list covers all 64 independent case directories in the Strategy broker layer (21 in v5, 43 in v6). The new date and trade-type case has completed a native paired capture and matches in full. In the 2 existing weekly holding probes, only Sharpe and Sortino do not yet match; they remain unverified.

---

## 1. Pending orders and basic matching (order lifecycle and Probe B)

| ID | Version | Symbol / timeframe | Plot columns | What it tests and key checks |
|---|---|---|---|---|
| `S_pending_entries` | v5 / v6 | BATS:AAPL 60 | 18 | • Trigger and fill conditions for limit / stop / stop-limit on either side of the market price<br>• stop-limit with limit > stop (fills on trigger) and limit < stop (waits for a pullback)<br>• Pending orders persist across bars until filled/cancelled; amendment with the same ID; the associated Exit is invalidated automatically after a close (prevents GhostExit) |
| `B_orders_strings__delay` | v5 / v6 | BATS:AAPL 60 | 8 | • Probe B baseline: pending order price rounding direction<br>• Fill timing alignment with Order execution delay = One tick<br>• Verbatim consistency of `str.tostring / str.format` text passed through Trades.Signal |
| `B_orders_strings__none` | v5 / v6 | BATS:AAPL 60 | 8 | • Probe B baseline: rounding of pending market orders<br>• Timing alignment with Order execution delay = None (immediate matching) |
| `S_limit_verification__2` | v6 | BATS:AAPL 60 | 17 | Two-tick limit verification for longs and shorts, price improvement on opening gaps; the source constant 2 and the raw report label are kept separately |
| `S_limit_verification__0` | v6 | BATS:AAPL 60 | 17 | Properties explicitly disable verification; the native report confirms N=0 |
| `S_limit_verification__1` | v6 | BATS:AAPL 60 | 17 | A separate source changes only the constant to 1, distinguishing N=1 / N=2, which share the same report label |
| `S_limit_verification_marketable__2` | v6 | BATS:AAPL 60 | 17 | Marketable long and short limit orders and the two-tick verification condition |
| `S_limit_verification_stop_limit__2` | v6 | BATS:AAPL 60 | 17 | stop-limit activation and two-tick limit verification |
| `S_limit_verification_exit__2` | v6 | BATS:AAPL 60 | 17 | Limit exits and price improvement when already marketable after the entry |

---

## 2. Exits, stops and brackets

| ID | Version | Symbol / timeframe | Plot columns | What it tests and key checks |
|---|---|---|---|---|
| `S_exit_brackets` | v5 / v6 | BATS:AAPL 60 | 18 | • 4-tick path race resolution when a tight 0.15% bracket triggers on both sides within one bar<br>• **Key v5 vs v6 divide**: when a relative value (40 ticks) and an absolute value (0.5%) are both set, v5 gives priority to the absolute value and v6 to whichever triggers first |
| `S_exit_partial` | v5 / v6 | BATS:AAPL 60 | 16 | • Exit quantity reservation (e.g. 19+20, where only 1 share is left for the second to close)<br>• `qty_percent` takes profit in 50% batches<br>• An Exit without `from_entry` keeps applying to later new Entries; an invalid `from_entry` is treated as invalid |
| `S_trailing` | v5 / v6 | BATS:AAPL 60 | 12 | • Trailing stop: `trail_price` activation + 30-tick trail (long and short)<br>• `trail_points` 30-tick activation + 20-tick trail; coupling between the trail level and the 4-tick extreme assumption |
| `S_close_variants` | v5 / v6 | BATS:AAPL 60 | 10 | • Close API family: default Signal text from `close(id)` without a comment<br>• Reducing by a fixed share count with `qty` and by proportion with `qty_percent`<br>• `close_all` default text; fill timing when `immediately=true` forces an immediate fill |

---

## 3. Pyramiding and close matching rules

| ID | Version | Symbol / timeframe | Plot columns | What it tests and key checks |
|---|---|---|---|---|
| `S_pyramiding_fifo` | v5 / v6 | BATS:AAPL 60 | 12 | • `pyramiding=3` + 10% equity sizing: the first three fill, and the fourth exceeds the limit and is silently ignored<br>• **FIFO rule**: a `close("E2")` call actually closes the earliest entered position<br>• Reducing with `strategy.order` does not reverse the position and is not limited by pyramiding |
| `S_pyramiding_any` | v5 / v6 | BATS:AAPL 60 | 12 | • **ANY rule**: a `close("E2")` call closes exactly the entry with the specified ID<br>• Net Transaction quantity when `strategy.entry` reverses the position |

---

## 4. Commission, slippage and margin leverage

| ID | Version | Symbol / timeframe | Plot columns | What it tests and key checks |
|---|---|---|---|---|
| `S_commission_slippage__base` | v5 / v6 | BATS:AAPL 60 | 15 | Zero-commission, zero-slippage baseline control |
| `S_commission_slippage__pct` | v5 / v6 | BATS:AAPL 60 | 15 | 0.1% percent commission; charged on both entry and exit; Limit orders take no slippage |
| `S_commission_slippage__per_contract` | v5 / v6 | BATS:AAPL 60 | 15 | Fixed commission per share (0.05 USD / contract) |
| `S_commission_slippage__per_order` | v5 / v6 | BATS:AAPL 60 | 15 | Fixed commission per order (1 USD / order) |
| `S_commission_slippage__slip3` | v5 / v6 | BATS:AAPL 60 | 15 | Slippage of 3 ticks: applies only to Market orders and triggered Stop orders; Limit orders take no slippage |
| `S_margin` | v5 / v6 | BATS:AAPL 60 | 12 | 4x leverage (25% margin) + 300% full position: Margin Call liquidation trigger threshold, liquidated quantity, and per-bar comparison of `margin_liquidation_price` |

---

## 5. Intrabar recalculation triggers (intrabar order fills)

| ID | Version | Symbol / timeframe | Plot columns | What it tests and key checks |
|---|---|---|---|---|
| `S_calc_on_order_fills` | v5 / v6 | BATS:AAPL 60 | 24 | • Count of executions per bar (`calcs_on_bar`, capped at 4)<br>• Whether a recalculation triggered by an intrabar fill happens before or after the close calculation<br>• On which tick a market order submitted inside a recalculation fills; `barstate.isnew` state reported back |

---

## 6. Strategy risk management rules

| ID | Version | Symbol / timeframe | Plot columns | What it tests and key checks |
|---|---|---|---|---|
| `S_risk` | v5 / v6 | BATS:AAPL 60 | 10 | Combined risk baseline: activates allow_entry_in, max_position_size and max_intraday_filled_orders together |
| `S_risk_allow_entry_in` | v5 / v6 | BATS:AAPL 60 | 10 | One-direction entries: under `allow_entry_in(long)`, while holding a long position, an opposing Short entry degrades into a close order; a Short entry while flat is ignored outright |
| `S_risk_max_position_size` | v5 / v6 | BATS:AAPL 60 | 10 | Maximum position cap: a 40-share order is cut to the 25-share limit; differing handling of later Entry and Order(qty=10) once the position is full |
| `S_risk_max_intraday_filled_orders` | v5 / v6 | BATS:AAPL 60 | 13 | Intraday trade count limit: after the daily limit of 3 is reached, the 4th and 5th orders (including close_all) are rejected; positions can be held overnight and trading resumes the next day |
| `S_risk_max_drawdown__cash` | v6 | BINANCE:BTCUSDT 60 | 18 | Cash drawdown 100; a drawdown in realized balance stops trading permanently |
| `S_risk_max_intraday_loss__cash` | v6 | BINANCE:BTCUSDT 60 | 18 | Intraday cash loss 100; measured against start-of-day equity, triggers a forced close and resumes the next day |
| `S_risk_max_cons_loss_days__2` | v6 | BINANCE:BTCUSDT 60 | 18 | Halts permanently after two consecutive trading days with realized losses |
| `S_risk_max_cons_loss_days__1` | v6 | BINANCE:BTCUSDT 60 | 18 | Threshold explicitly overridden to 1; halts permanently after the first complete trading day with a realized loss |
| `S_risk_max_drawdown__percent` | v6 | BINANCE:BTCUSDT 60 | 18 | Halts permanently after a 1% drawdown from the highest realized balance; unrealized profit and loss does not trigger it |
| `S_risk_max_intraday_loss__percent` | v6 | BINANCE:BTCUSDT 60 | 18 | Forced close after a 1% loss relative to start-of-day equity; profit earlier in the day can offset later unrealized losses |
| `S_risk_limits__control` | v6 | BINANCE:BTCUSDT 60 | 18 | Independent native control with the same market and schedule; risk thresholds set out of reach |
| `S_risk_max_intraday_loss__cash_march` | v6 | BINANCE:BTCUSDT 60 | 18 | Independent native export ending in March; verifies the Sharpe/Sortino daily observation range and the last close time |
| `S_risk_max_intraday_loss__cash_april` | v6 | BINANCE:BTCUSDT 60 | 18 | Independent native export ending in April; verifies Sharpe/Sortino monthly observations over a longer trading range |
| `S_risk_max_intraday_loss__cash_weekly` | v6 | BINANCE:BTCUSDT 1W | 18 | Resets on each weekly bar; negative starting equity for a period suspends the cash threshold, which takes effect again once starting equity is positive |
| `S_risk_max_cons_loss_days__2_weekly` | v6 | BINANCE:BTCUSDT 1W | 18 | Unrealized losses across periods count; a simultaneous full close and fixed-quantity risk order create a reverse position, and later script orders stay halted |
| `S_risk_max_cons_loss_days__full_close_2_weekly` | v6 | BINANCE:BTCUSDT 1W | 17 | Two consecutive losing periods; after the initial position of 2 is fully closed, the risk order sells 2, leaving -2; everything passes |
| `S_risk_max_cons_loss_days__partial_close_2_weekly` | v6 | BINANCE:BTCUSDT 1W | 17 | Two consecutive losing periods; the initial position of 2 first closes 1, then the risk order sells 2, leaving -1; everything passes |
| `S_risk_max_cons_loss_days__hold_1_weekly` | v6 | BINANCE:BTCUSDT 1W | 17 | No scheduled close; after one losing period, closed by the risk rule on 2024-01-15; series and trades pass; two ratios fail |
| `S_risk_max_cons_loss_days__hold_2_weekly` | v6 | BINANCE:BTCUSDT 1W | 17 | No scheduled close; after two consecutive losing periods, closed by the risk rule on 2024-01-22; series and trades pass; two ratios fail |

---

## 7. Symbol sizing and contract step

| ID | Version | Symbol / timeframe | Plot columns | What it tests and key checks |
|---|---|---|---|---|
| `S_sizing_crypto` | v5 / v6 | BINANCE:BTCUSDT 60 | v5: 12 / v6: 13 | • High-precision crypto positions (fractional Qty precision produced by 5% equity)<br>• Rounding rules for an explicit quantity (0.0123456)<br>• Silent skipping of very small orders (below 1e-7 or `syminfo_mincontract`) |

## 8. Date inputs and language types

| ID | Version | Symbol / timeframe | Plot columns | What it tests |
|---|---|---|---|---|
| `S_timestamp_trade_types` | v6 | BINANCE:BTCUSDT 60 | 11 | Space-separated date strings, explicit time zones, date input gating, return types of trade index/time/ID and `ta.valuewhen`; all 27,046 native bars, 3,758 closed trades and report metrics match |
