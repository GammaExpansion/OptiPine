# Indicator Case Guide

[← Back to the test suite overview](../README.md)

Indicator cases record TradingView's bar-by-bar output for technical indicators, built-in math functions, language evaluation semantics and the time system. Each case plots every observed value with `plot()` and exports it unmodified with the chart data.

For the complete list of case directories, see [**`INDEX.md`**](./INDEX.md).

---

## 📊 Suite size and coverage

- **Total cases**: 39 independent case directories (16 under `v5/*`, 23 under `v6/*`); 39 verified, 0 unverified.
- **Files**: each captured case directory contains these 3 files:
  - `source.pine`: the indicator source (native verification status is in the metadata)
  - `meta.json`: symbol definition, time zone, export information and verification status
  - `data.csv`: the official native export of the full bar history (including every `plot*()` observation column)

---

## 🧭 Module categories and test matrix

All cases are divided into the following core modules by calculation type and language feature:

### 1. Technical analysis builtins
| Bundle | APIs / functions covered | Key alignment challenges and checks |
|---|---|---|
| `I_ma` | `sma`, `ema`, `rma`, `wma`, `vwma`, `swma`, `hma`, `alma`, `linreg` | • Row at which each MA's seed is initialized at the start of the data (First valid bar)<br>• Length 1 and long (200) boundaries<br>• Nested calls and historical series as input (`source[1]`) |
| `I_osc` | `rsi`, `macd`, `stoch`, `cci`, `mfi`, `tsi`, `wpr`, `mom`, `roc`, `change`, `cog`, `cmo`, `dmi` | • Multi-output indicators and nested calculations<br>• Numeric smoothing of oscillators under division by zero and very small fluctuations |
| `I_vol` | `tr`, `atr`, `stdev`, `variance`, `dev`, `bb`, `bbw`, `kc`, `kcw`, `supertrend`, `sar` | • First-bar initialization rule for true range (TR)<br>• Running standard deviation (`stdev`) recursion and control of precision drift at high price magnitudes |
| `I_extremes` | `highest`, `lowest`, `highestbars`, `lowestbars`, `pivot*`, `valuewhen`, `barssince`, `cross*`, `rising`, `falling`, `percentrank`, `median`, `mode` | • Which value extreme and event lookup functions select when values tie<br>• `na` propagation from `valuewhen` and `barssince` when the condition has never occurred |
| `I_volume` | `vwap`, `obv`, `accdist`, `pvt`, `nvi`, `pvi`, `wad`, `wvad`, `iii` | • Cumulative reset logic of `vwap` under different anchor periods (Anchor)<br>• Accumulated floating-point error in cumulative (Accumulate) indicators as the bar count grows |

### 2. Language series semantics and compiler state machine
| Bundle | What it tests | Key checks and version differences |
|---|---|---|
| `I_lang_series` | Series evaluation count, history breaks in conditional branches, dynamic lookback | • **Evaluation difference**: v5 strict evaluation (all arguments evaluated) vs v6 short-circuit evaluation (Short-circuit)<br>• Internal series history breaks caused by calling `ta.*` inside conditional branches (`if / switch`)<br>• `var` inside a user-defined function binds independently per call site<br>• Truncation guard when dynamic history lookback `series[dynamic_offset]` reaches the hard limit (RE10007, 10,000 limit) |
| `I_collections` | `array`, `matrix`, `map` collection operations | • Array sort stability, binary search boundary behavior<br>• Matrix determinant, transpose and multiplication precision<br>• Map key/value reads and writes and iteration consistency |
| `I_language_support` / `I_language_support__enum_override` | `enum`, `input.enum`, chained calls on matrix return values | Member display titles, function arguments, identity in arrays and history; a separate export after switching the input in the UI, checked against the non-empty override in `meta.inputs`; eigenvalue order for symmetric, diagonal and nonsymmetric matrices |
| `I_eigen_boundaries` / `I_eigen_complex` | Eigenvalue boundaries | Singleton and zero matrices, and fractional output from integer matrices; complex roots of a rotation matrix return zero real parts; the native runtime error for an empty matrix is kept as supporting evidence |

### 3. Constants, syntax and basic numeric semantics
| Bundle | What it tests | Key checks |
|---|---|---|
| `I_strings_ops` | String operations and operator behavior | • `str.*` Unicode character length, `tonumber` boundaries and regex matching<br>• Operator precedence and associativity<br>• How `const int / const int` integer division propagates through compound expressions (v5 integer truncation vs v6 keeps float) |
| `I_math_colors` | Full set of math functions and color components | • `na / inf` boundary output from `math.*`<br>• Reproducibility and sequence state of seeded random numbers (Seeded random)<br>• RGB encoding differences of the 17 built-in named colors between v5 and v6 |
| `A_numeric_semantics` | Constant numeric baseline (Probe A) | • Modulo, integer conversion, division-by-zero protection, `na` propagation rules<br>• Reset and skip rules of `ta.ema / rma / sma` when they hit an `na` gap mid-series |

### 4. Time system, metadata and cross-timeframe alignment
| Bundle variant | Chart and timeframe | What it tests |
|---|---|---|
| `M_time__aapl_60` | BATS:AAPL 1h | Date/time component breakdown in the exchange's regular time zone (America/New_York), daylight saving time (DST) offset changes, `session.ismarket` evaluation |
| `M_time__aapl_D` | BATS:AAPL 1D | Cross-day timestamps on the daily timeframe and time consistency with dividend adjustment turned off |
| `M_time__btcusdt_60` | BINANCE:BTCUSDT 1h | `time(tf, session)` behavior in a 7×24-hour crypto market, session flags and missing-bar handling |
| `M_time__btcusdt_D` | BINANCE:BTCUSDT 1D | Higher-timeframe (HTF) time alignment (`time("D")` / `time("W")`) through built-in mapping that needs no secondary chart data |

---

## 📋 Cross-version capture rules

1. **Separate exports**: Changing `//@version=5` to `//@version=6` does not by itself mean the output is identical. The v5 and v6 versions of each case each have their own native `data.csv`, exported under the matching version with a TradingView Premium account. Both copies are kept even when their contents happen to be identical.
2. **Known version difference**: In `M_time__*_D`, the `len_tf_period` column measures `"D"` (length 1) in v5 and `"1D"` (length 2) in v6.
3. **Input overrides**: The default input of `I_language_support` is `Simple average`. `__enum_override` was exported separately after changing it to `Exponential average` in the TradingView settings, and passes the same display title in `meta.inputs.Average`. Both variants keep the 27,704 bars of history the native account can load, starting at `probe_index=0`; the 15 output columns cover the final bar of the paused Replay. Missing market bars are kept as is; see `meta.capture` and `meta.notes` in each directory for provenance and capture limits.
4. **Eigenvalue boundaries**: The two `I_eigen_*` cases each store 27,704 bars of native v6 output. The `I_eigen_complex` source has no index column. Its full history is confirmed because its six raw OHLCV columns are identical, row for row, to those of `I_eigen_boundaries`, whose `probe_index` runs continuously from 0..27703. Both are compared against their complete golden output, with no added columns or relaxed comparison rules. The empty-matrix probe compiles successfully and then reports RE10088 on bar 0. The original message is kept in `meta.capture.related_runtime_error` of `I_eigen_boundaries` and is not counted as a compile-failure case.

---

## ⚠️ Key boundaries and known details

> [!NOTE]
> **`syminfo.session` return value**:
> The Pine Script built-in variable `syminfo.session` returns the current chart's session mode (`"regular"` or `"extended"`, i.e. the ETH pre-market/after-hours toggle), not a session string. The exchange's regular session string is normalized and stored in `meta.syminfo.session_hours` (for example `"0930-1600"` for stocks and `"0000-0000:1234567"` for crypto).

> [!NOTE]
> **Hard history lookback limit (RE10007 error)**:
> The Pine runtime imposes a hard limit of 10,000 bars on `series[offset]`. The test script `I_lang_series` guards against it by capping the dynamic offset at `math.min(bar_index, 10000)`; the column is named `dynamic_offset_capped`.
