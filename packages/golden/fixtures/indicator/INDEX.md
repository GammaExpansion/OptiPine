# Indicator Layer Case List (INDEX)

[← Back to indicator/README.md](./README.md) | [Back to the test suite overview](../README.md)

This list covers all 39 independent case directories in the Indicator layer (16 in v5, 23 in v6). All have completed native verification. The four new language regression cases each keep a complete 27,046-bar history, and every output series matches the engine.

---

## 1. Classic technical analysis builtins

| ID | Version | Symbol / timeframe | Plot columns | What it tests and key checks |
|---|---|---|---|---|
| `I_ma` | v5 / v6 | BATS:AAPL 60 | 34 | • Full moving-average family: `sma`, `ema`, `rma`, `wma`, `vwma`, `swma`, `hma`, `alma`, `linreg`<br>• Alignment of the first valid non-na row (First valid bar)<br>• Length 1 and 200 extreme boundaries, nested calls, and the `source[1]` historical series as input |
| `I_osc` | v5 / v6 | BATS:AAPL 60 | 28 | • Oscillator family: `rsi`, `macd`, `stoch`, `cci`, `mfi`, `tsi`, `wpr`, `mom`, `roc`, `change`, `cog`, `cmo`, `dmi`<br>• Multi-output tuple alignment and deeply nested indicator calculations |
| `I_vol` | v5 / v6 | BATS:AAPL 60 | 27 | • Volatility family: `tr`, `atr`, `stdev`, `variance`, `dev`, `bb`, `bbw`, `kc`, `kcw`, `supertrend`, `sar`<br>• Precision of the running true range and standard deviation recursions |
| `I_extremes` | v5 / v6 | BATS:AAPL 60 | 36 | • Extremes and events family: `highest`, `lowest`, `highestbars`, `lowestbars`, `pivot*`, `valuewhen`, `barssince`, `cross*`, `rising`, `falling`, `percentrank`, `percentile`, `median`, `mode`<br>• na propagation when the event has not occurred, and selection when values tie |
| `I_volume` | v5 / v6 | BATS:AAPL 60 | 21 | • Volume family: `vwap` (variable, source, anchor and three-output overloads), `obv`, `accdist`, `pvt`, `nvi`, `pvi`, `wad`, `wvad`, `iii`<br>• Floating-point accumulation precision of indicators that accumulate across bars |

---

## 2. Language series semantics and collections

| ID | Version | Symbol / timeframe | Plot columns | What it tests and key checks |
|---|---|---|---|---|
| `I_lang_series` | v5 / v6 | BATS:AAPL 60 | 35 | • **Evaluation difference**: v5 strict full evaluation vs v6 short-circuit evaluation (Short-circuit)<br>• Internal series history breaks when `ta.*` is called inside conditional branches (`if / switch`)<br>• `var` inside a function binds independently per call site; dynamic lookback `series[dynamic_offset]` is capped at the 10,000 limit |
| `I_collections` | v5 / v6 | BATS:AAPL 60 | 47 | • Collections: `array` statistics/sorting/binary search/slicing, `matrix` determinant/multiplication/transpose, `map` key/value reads and writes |
| `I_language_support` | v5 / v6 | BINANCE:BTCUSDT 60 | 15 | enum default input, display titles, member identity in functions/arrays/history; chained `m.eigenvalues().get()` calls, eigenvalues of symmetric, diagonal and nonsymmetric matrices and their order |
| `I_language_support__enum_override` | v5 / v6 | BINANCE:BTCUSDT 60 | 15 | The same source exported separately after changing Average to Exponential average in the TradingView UI; explicit override in `meta.inputs`; complete 27,704-bar native history |
| `I_eigen_boundaries` | v6 | BINANCE:BTCUSDT 60 | 7 | Eigenvalues of singleton, zero and integer matrices, with native fractional output for the integer matrix; `probe_index` runs continuously 0..27703; `meta.capture` stores the native empty-matrix runtime error |
| `I_eigen_complex` | v6 | BINANCE:BTCUSDT 60 | 2 | Both real-part outputs of the rotation matrix's complex roots are 0; no index column, so the same complete history is confirmed by the raw OHLCV matching boundaries row for row |
| `I_generic_values` | v6 | BINANCE:BTCUSDT 60 | 9 | String concatenation with undeclared parameter types, independent type inference for nested functions and array methods, explicit qualifiers and const references |
| `I_leading_continuations` | v6 | BINANCE:BTCUSDT 60 | 4 | Continuation lines starting with `or` and with the ternary `:`, local block results |
| `I_drawing_presence` | v6 | BINANCE:BTCUSDT 60 | 5 | `na` checks on drawing IDs, assigning `na` back after deletion, receiver dispatch between user-defined and built-in delete methods |
| `I_plot_linestyles` | v6 | BINANCE:BTCUSDT 60 | 4 | Solid, dashed and dotted line constants and their per-bar numeric output |

---

## 3. Constants, syntax and basic numeric semantics

| ID | Version | Symbol / timeframe | Plot columns | What it tests and key checks |
|---|---|---|---|---|
| `I_strings_ops` | v5 / v6 | BATS:AAPL 60 | 55 | • Strings and operators: `str.*` Unicode character length, `tonumber` boundaries and regex matching<br>• Operator precedence and associativity<br>• Propagation semantics of constant integer division in compound expressions |
| `I_math_colors` | v5 / v6 | BATS:AAPL 60 | 63 | • Math and colors: the full `math.*` set (including na/inf boundary output)<br>• Cross-bar reproducibility of seeded random numbers (Seeded random)<br>• RGB encoding differences of the 17 built-in named colors between v5 and v6 |
| `A_numeric_semantics` | v5 / v6 | BATS:AAPL 60 | v5: 63<br>v6: 59 | • Probe A baseline: constant division, modulo, rounding, division-by-zero protection and na propagation<br>• Seed reset logic of `ta.ema / rma / sma` when they hit an na gap |

---

## 4. Time system and multi-timeframe alignment

| ID | Version | Symbol / timeframe | Plot columns | What it tests and key checks |
|---|---|---|---|---|
| `M_time__aapl_60` | v5 / v6 | BATS:AAPL 60 | 63 | • Date/time component breakdown in the US equity regular time zone (America/New_York), daylight saving time (DST) offset changes, `session.ismarket` state evaluation |
| `M_time__aapl_D` | v5 / v6 | BATS:AAPL D | 63 | • Cross-day timestamps on US equity daily bars and time consistency with dividend adjustment turned off |
| `M_time__btcusdt_60` | v5 / v6 | BINANCE:BTCUSDT 60 | 63 | • 7×24-hour crypto clock, session flags, handling of missing-bar gaps |
| `M_time__btcusdt_D` | v5 / v6 | BINANCE:BTCUSDT D | 63 | • Cross-timeframe alignment on crypto daily bars (`time("D")` / `time("W")`) |
| `I_syminfo_mincontract` | v6 | BINANCE:BTCUSDT 60 | 1 | Independent full-history metadata probe; unavailable in v5, see parse `P_ver_mincontract` |
