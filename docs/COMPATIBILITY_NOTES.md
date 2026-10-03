# Compatibility notes

These notes explain measured behaviors that are easy to change accidentally.
The [design](DESIGN.md) defines scope; [fixture documentation](../packages/golden/fixtures/README.md)
defines the validation contract. Expected outputs never become execution inputs.

## Coverage and evidence

The accepted suite contains 240 matching verified cases and 6 unverified cases.
This covers their Pine v5/v6 sources, market inputs and settings, not complete Pine
compatibility. Unsupported behavior remains explicit. See [known issues](../packages/golden/fixtures/docs/known-issues.md)
for fixture attribution and remaining evidence limits.

Native compiler checks confirm the existing v5/v6 `P_err_request_financial`,
`P_err_request_security` and `P_err_strategy_risk` sources compile successfully.
These are compile-only fixtures; they do not establish runtime support or supply
secondary data for `request.*`.

Independent TradingView probes support the mechanisms below. Their raw captures are kept
outside this repository and are not needed for unit tests or CI. Adopted fixtures keep
compact provenance in `meta.capture` and explicit run context in `meta.execution`. A
synthetic regression test is not an additional TradingView observation.

## Language values and ignored effects

Enum members retain their type and identity through functions, collections and history;
`str.tostring` exposes the declared display title, or the member name when no title exists.
`input.enum` accepts a member name, qualified name or unique display title in the caller's
JSON input overrides. Invalid or ambiguous selections fail explicitly.

The four `I_language_support` fixtures cover independent v5/v6 runs with default
and overridden enum inputs. Each preserves 27,704 bars from native index 0 and all
15 outputs. Chained `matrix.eigenvalues().get(...)` returns an array element: the
observed symmetric matrices return eigenvalues in descending order, while the
nonsymmetric example returns its negative root before its positive root. Symmetric
Householder/QL and nonsymmetric Hessenberg/QR calculations reproduce these observations
within the existing numeric tolerance; the fixtures do not establish every matrix's
ordering or all numerical edge cases.

Two further v6 fixtures cover singleton and zero matrices, fractional eigenvalues
from an integer matrix, and a rotation matrix whose complex roots expose two zero
real components. The engine returns real components for conjugate pairs. The
native empty-matrix probe compiles and then fails on bar 0; its runtime-error text
is preserved with `I_eigen_boundaries`. Numeric CSV values do not establish a
different static array type for the integer-matrix overload.

Drawing creation, mutation and deletion, `log.*`, and the previously silent visual/alert
effects emit `RunResult.warnings`, deduplicated by function and source line within a run.
They do not render or deliver alerts. Drawing IDs are opaque handles that can pass through
lifecycle calls and collections. `na(id)` checks whether an ID exists, including named
`x` arguments; it does not read geometry. Getters and other computed uses of those IDs
remain unsupported. Arguments are still evaluated, so an ignored effect cannot hide an error in
its arguments. Diagnostics continue to indicate failure. The harness and the Worker
protocol preserve warnings separately.

`chart.point` holds explicit time, index and price coordinates. Its constructors,
readable fields and independent copies support point-based drawing calls without
rendering. Arrays, maps and matrices can carry drawing IDs to lifecycle calls;
numeric operations on those IDs remain unsupported.

Regression tests drawn from published community scripts cover untyped string parameters and independent type inference
at each user-function call, including nested calls and method receivers. A user-defined
method only takes precedence for its declared receiver type. Explicit `const`, `simple`
and `series` declarations retain their constraints; a const reference may still mutate
its contents. Leading `or` and `:` continuation lines are parsed without treating them as
local blocks. Pine v5's block-indentation restriction on continuations remains in place.

Trade index/time accessors and `ta.valuewhen` preserve their source types, and request
expressions preserve bool/tuple types at compilation. This does not add runtime
`request.*` or `ta.pivot_point_levels` support. Plot linestyle constants and the string
type/value of `size.*` are recognized. The string `timestamp` overload accepts a space
between date and clock and uses UTC when no zone is supplied, independent of the host
and market timezones.

Six independent language probes are verified v6 fixtures. The four indicators (`I_generic_values`,
`I_leading_continuations`, `I_drawing_presence`, `I_plot_linestyles`) each preserve
27,046 native hourly bars from index 0 on BINANCE:BTCUSDT, and every output series
matches. Drawing presence and linestyle numeric outputs do not establish rendering
support. `S_timestamp_trade_types` covers the same range with byte-identical chart
exports surrounding the native XLSX; all series, 3,758 closed trades and report metrics
match. Its final Replay bar retains blank script outputs with explicit execution
context. `P_request_result_types` independently compiled in Pine Editor; this only
verifies bool/tuple result typing, not runtime requests.

Native v6 probes confirm that integer division retains its integer type while its
value can contain a fraction: `int x = 5 / 2` plots 2.5, and integer seconds divided
by 61 can initialize an explicit int. Real float operands (`close`, or a divisor
of `61.0`) are still rejected; only explicit `int(...)` truncates the quotient.
The independent [division parse fixture](../packages/golden/fixtures/parse/v6/P_syn_int_division/source.pine)
records native compilation. A strategy that enables Bar Magnifier compiles but stays
unsupported at execution, because Bar Magnifier needs lower-timeframe data the engine is
not given.

Conditional user functions sample captured global variables and `bar_index` in
their own call history. Native OHLCV references such as `close[1]` still use the
previous chart bar; a custom alias of `close` uses sampled call history instead.
An ordinary conditional block does not resample global bindings. The independent
`history-scopes` probe distinguishes these paths; separate call sites and fill
recalculation rollback have regression coverage.

Repeated `strategy.exit` submissions preserve an activated trailing extreme for
the same exit ID and lot when activation price is unchanged, including widening
or tightening the offset. The stop is recomputed from that extreme and the amended
offset. A newly added lot or an explicitly cancelled order starts with fresh state.
This fixes Aurora's missing trades, while its separate tick/sizing differences
remain under investigation.

A valid trailing activation with `trail_offset=na` uses zero distance at runtime.
The independent `trailing-na` captures compare native na, zero, finite, to-na and
from-na inputs on the same full history. Zero-distance trails fill at activation,
including an opening gap; they must not wait for another favorable observation
because floating-point reconstruction put the stop one tick behind that price.
An absent activation level does not create a trailing order beside a fixed stop.

## Runtime limits and script-chosen keys

Length arguments of the windowed `ta.*` builtins must be at least one bar: zero, negative
and `na` lengths raise a runtime error naming the argument, as TradingView does, instead of
silently running with a length of one. Builtins whose second argument is a series or an
offset (`ta.cross*`, `ta.change`, `ta.valuewhen`) are unchanged.

Collections are capped at 100,000 elements, matrices at 100,000 cells and `str.repeat`
results at 4,096 characters; sizes must be non-negative integers. Every constructor and
growth path (`array.new*`, `push`, `unshift`, `insert`, `concat`, `matrix.new`, `map.put`,
`map.put_all`) checks the limit before allocating and reports a runtime diagnostic.
`map.put_all` copies entries; earlier builds compiled it and did nothing.

The per-bar execution budget of 2,000,000 steps counts statements as well as expression
evaluations, so a v5 `for` loop whose body is only `continue` or a `var` declaration stops
with a `limit` diagnostic instead of running until the worker is cancelled. Input overrides
are matched by own title only, so a title such as `constructor` or `__proto__` never
resolves to an `Object.prototype` member.

## Moving sums and variance

[RollingSum](../packages/engine/src/runtime/rolling-sum.ts) retains a compensated total and
a ring of corrected incoming operands. When the window is full, it first removes
the saved operand with compensation, then adds the new sample with compensation
and saves that corrected operand. Saving raw samples or reversing this order loses
the rounding history observed in TradingView.

Two deterministic native probes each contain 3,599 bars. Their six sum streams
match exactly across all 3,580 populated windows per stream. Equal current windows
retain different results after different prefixes; rounding continues to evolve
through 2,044 constant windows. These observations distinguish the implementation
from a recurrence retaining only the published total and the raw current window.
The preserved verifier checks source/capture hashes and all populated observations.
This reproduces measured rounding; it neither improves numerical accuracy nor
uniquely identifies TradingView's internal implementation.

[TA calculations](../packages/engine/src/runtime/ta.ts) share this accumulator for `math.sum`
and `ta.sma`. Variance uses independent input and squared-input sums:
`max(0, squareSum / n - (sum / n) * (sum / n))`. Sample variance multiplies by
`n / (n - 1)`; stdev takes the square root. This also reproduces both original
`A_numeric_semantics` shifted-price histories. Collection variance remains separate:
these probes establish TA behavior, not array or matrix arithmetic.

Missing inputs do not advance the ring; warmup needs the requested number of valid
samples. [Rollback](../packages/engine/src/runtime/rollback.ts) clones rings when saving and
again on every restore, including nested TA states, so repeated fill calculations
cannot mutate the saved checkpoint. [Tests](../packages/engine/src/runtime/rolling-sum.test.ts)
cover these boundaries. Changing length within one call history remains unsupported;
the measurements establish fixed windows, not how to resize accumulated state.

## Calendars, risk limits and VWAP

[Calendar](../packages/engine/src/calendar.ts) distinguishes a supplied session, a known
closure inside coverage (`null`), and unavailable coverage (`undefined`).
[Calendar data](../packages/golden/fixtures/docs/calendar-inputs.md) is supplied explicitly by the caller.
Golden fixtures declare a local file through `meta.session_calendar`; the loader
does not select calendars by symbol or search other directories. Missing or invalid
declared files fail loading. Holidays and shortened sessions are never inferred
from expected plots. Explicit recurring session arguments retain their own schedule.

Weekly/monthly periods use their own lookup bounds and provider timestamps, even
when they extend beyond daily coverage. A missing period inside overall coverage
remains distinct from unavailable metadata outside it. Chart bars can exist after
a supplied session close: their chart timestamp and nominal close still exist,
while implicit session timestamps can be missing.

Daily transitions have different measured meanings in [Clock](../packages/engine/src/runtime/time.ts)
and the [broker](../packages/engine/src/broker/broker.ts):

| Previous → current implicit daily time | `timeframe.change` | Automatic VWAP | Daily fill limit |
| -------------------------------------- | ------------------ | -------------- | ---------------- |
| First bar                              | false              | reset          | reset            |
| Same valid time                        | false              | keep           | keep             |
| Different valid times                  | true               | reset          | reset            |
| Valid → missing                        | false              | keep           | reset            |
| Missing → missing                      | false              | reset          | reset¹           |
| Missing → valid                        | false              | reset          | keep             |

¹ The risk probe distinguishes entry into missing time and return to valid time,
but cannot separately establish resetting on every consecutive missing bar: no
fill occurred on its first missing bar. The implemented rule fits independent
observations and complete golden histories; that branch remains unisolated.

The risk counter resets once before a bar's first fill, not on script recalculation;
unavailable calendar data retains the exchange civil-date fallback. An independent
AAPL early-close probe observed reopening after the daily halt and no fresh
allowance on return to the next valid session. Automatic VWAP instead matched all
250 v6 and 692 v5 native observations with the rule above. Explicit VWAP anchors
remain independent. [Risk](../packages/engine/src/broker/risk.test.ts) and
[VWAP tests](../packages/engine/src/runtime/vwap.test.ts) cover the implemented distinctions.

The new account-risk probes separately exercise `max_drawdown`, `max_intraday_loss`
and `max_cons_loss_days`. Both cash and percent drawdown halt after a decline in
realized balance from its realized peak; native runs continue through larger
unrealized losses. Both cash and percent intraday loss compare current equity with
day-start equity, rather than an intraday high. Their observed forced-close comment
is `Close Position (Max intraday Loss)`.
The weekly cash capture additionally shows that a period beginning with negative
equity disables the cash threshold; a later period beginning with positive equity
restores it, even while realized balance remains negative. This boundary is
independent of the percentage rule's bankruptcy handling.

All seven hourly risk modes, including the no-risk control, reproduce every
observed series, trade and report metric. The hourly consecutive-losing-days
probes close positions within each day and establish count-1/count-2 behavior for
realized daily losses. They do not establish losses on positions held across days.
The [weekly losing-days capture](../packages/golden/fixtures/strategy/v6/S_risk_max_cons_loss_days__2_weekly/meta.json)
now matches all series, trades and report metrics. Completed-period equity declines
count toward the loss streak even while a position remains open. At the next open,
the already submitted full-size close executes before a risk order whose quantity
was fixed from the position at the halt. Both sell at the same opening price,
leaving an open short while subsequent script orders remain halted. The native
CSV, report and strict comparisons are unchanged.

Four further weekly captures isolate a two-unit held position with no scheduled close,
a full close, a half close, and a one-period loss threshold. Without a scheduled close,
the risk order flattens the position on January 22, 2024 for count 2 and January 15
for count 1. At the count-2 boundary, scheduled full and half closes leave positions
of -2 and -1 respectively. All four match every series and trade; the two scheduled-close
cases also match all report metrics. The two hold-only cases remain unverified because
TradingView leaves Sharpe and Sortino empty while the engine returns numbers.

Fill-callback cancellation still has synthetic regression coverage only. The
verified captures do not isolate simultaneous risk-rule priority, the permanent
halt at zero equity, a held position's day-opening gap or every on-close combination.

## Limit-order verification

`backtest_fill_limits_assumption` accepts a nonnegative integer number of minimum
ticks. A buy must trade that far below its limit, and a sell that far above it,
before becoming eligible. An intrabar fill retains the requested limit price.
If an order becomes eligible when the current price already exceeds the verification
threshold, it receives that better price. Native probes distinguish both opening
gaps and limit exits activated by an opening market fill. Six verified fixtures
cover resting limits at zero, one and two ticks, plus two-tick marketable limits,
stop-limits and exits, with complete series, trades and report comparisons.

The native report labels the untouched source setting `2` as
`Requested price and 1 tick beyond`. That label alone does not establish the
numeric setting. The source, independently recorded untouched Properties, raw
report label and captured feed identity must all remain in fixture provenance.
The independent one-tick source copy changes only that header constant and produces
different fills on identical OHLCV despite having the same report label. The zero-tick
control uses the explicitly observed UI override `Requested price`.

## Report calculations

The weekly losing-days report also establishes two boundaries: a negative cash
excursion at negative equity must not become a positive run-up percentage, and
`Avg profit / avg loss` is zero when closed trades include losses but no wins.

Sharpe and Sortino use periodic closed-equity returns. Short traded ranges use
calendar days; a range spanning more than two calendar-month boundaries uses
months. Native January–March and January–April captures distinguish those paths.
Intervening idle periods remain in the sample; a closed strategy ends at its last
exit, excluding trailing idle bars. An open position contributes its current PnL
only to the final period. The annual risk-free rate is divided by 365 or 12;
Sharpe uses population standard deviation, and Sortino uses downside deviations
from the period risk-free rate. The new daily observations use UTC crypto bars;
exchange-local day boundaries have not been independently isolated.

The two weekly hold-only risk probes expose a remaining boundary: their single closed
losing trade produces native null Sharpe and Sortino values, but the engine currently
returns numeric ratios. Their series, trades and other report metrics match. The
fixtures preserve both failures with `verified: false`; no expected values or
comparison rules are changed to hide them.

[Report amount conversion](../packages/engine/src/report-number.ts) uses a float32's shortest
decimal round-trip representation with decimal ties to even. Simply exposing
`Math.fround` is different at native report rounding boundaries. Prices, quantities
and execution economics retain their own precision; report conversion never feeds
back into trading state.

[Closed-equity cycles](../packages/engine/src/broker/closed-equity.ts) start at the first
closed-trade observation, without an initial-capital point or open profit. Raw net
profits accumulate in report order; each cumulative observation is converted once
for the curve. Drawdowns retain declines spanning at least two trade steps, plus
single-step declines strictly greater than 5% of peak balance. Independent reports
with identical trades and different capital distinguish this filter, including
exclusion at exactly 5%. It affects maximums as well as averages and run-up bounds.

Run-ups connect retained troughs to later peaks, using the first/last curve points
as outer endpoints, and require a positive increase over at least two steps.
Unfinished final phases count; an excluded final one-step decline does not lower
the preceding run-up peak. Equal highs advance the
peak and equal lows retain the first trough. Maximum percentage belongs to the
largest cash cycle; averages weight cycles equally. Duration floors the average
Unix-time interval once, in hours below one day and days otherwise. Native risk
reports distinguish `18 hours` and `1 day`, including the singular unit.
Empty cycles are null; zero starting balance leaves the percentage null.
Equal-extrema and zero-balance policies have synthetic coverage rather than
separate native confirmation.

[Cycle cash projection](../packages/engine/src/broker/report-cash.ts) applies after averaging:
start at cents and increase decimal precision only while a positive amount would
round to zero. It uses binary scaling and `Math.round`, not another float32 pass.
Native small-quantity and half-cent cases distinguish these choices; the preserved
report verifier reproduced all 130 cycle assertions across 13 independent reports.

[Average margin](../packages/engine/src/broker/report-margin.ts) averages complete bar-close
samples from the earliest actual entry, inclusive, through the penultimate supplied
bar, including flat intervals. Independent delayed-entry and open-only reports
distinguish that range from whole-history or closed-trade ranges. Side efficiency
is `(side closed net profit + all account open profit) / average account margin`.
Observed zero margin yields zero efficiency; complete no-trade histories yield
zero margin. Missing samples and an entry only on the final bar remain absent.

## Snapshot and version boundaries

Recorded [crypto captures](../packages/golden/fixtures/strategy/v5/S_sizing_crypto/meta.json)
pair CSV → XLSX → CSV at a stable Replay endpoint. `strategyClosePending` retains
the final market row, fills and valuation while skipping its regular strategy
close calculation. The loader requires explicit `meta.execution` with a paused
Replay selection and its timestamp, and a minute
bar ending exactly at the recorded selection time. UTC weekly captures also support
Monday 00:00 bars with selection exactly one week after the final bar's open;
other weekly session schedules are not inferred. This models that selection
boundary, not arbitrary stepped Replay, live ticks or a reconstructed event history.
Uncertain lifecycle bar-state reads and extra tick/fill/on-close modes in this
context are unsupported; expected blank plots cannot select the execution option.
Recorded `stepped: true` is rejected. `stepped: false` is recorded only when the
collection establishes it; omission in older captures does not assert that Replay
was never stepped. These execution fields and boundary checks do not require an
external notes file.

Native `Expectancy` cash and return fields preserve their own names and null empty
directions. Older `Expected payoff` keeps its observed zero for no closed trades.
The report parser does not turn unknown layouts or missing values into aliases.

Open entry commissions are already realized expenses: report Net profit and
Gross loss include them on the corresponding side, as do dependent cash metrics.
Account Open PnL reports gross floating price PnL, while an individual open trade's
economic profit includes its entry fee. Partial exits allocate that fee between closed and
remaining quantity; aggregate reporting must not deduct closed entry fees twice.

Native `strategy.opentrades.profit()` and open report rows additionally deduct a
projected commission at the current mark. Percentage fees therefore vary with that
mark; fixed fees follow their configured unit. `Trade.profit` retains economic PnL,
while `displayCommission` and the shared report projection express this display
convention without charging the account. Report commission remains the amount
actually paid. Cumulative report PnL uses the realized balance at each close (which
can still include entry fees on other open quantity), plus the projected profit
for an open row. Four full-history currency.NONE probes cover per-contract,
per-order, percentage and a partial long exit: every plot and trade field matches.
Their Sharpe/Sortino values still differ, so these probes are not verified fixtures.

Current native v5 rejects `syminfo.mincontract`; [the minimal v5 fixture](../packages/golden/fixtures/parse/v5/P_ver_mincontract/source.pine)
records that failure. The corrected v5 strategy removes only the invalid plot.
[Separate v6 metadata](../packages/golden/fixtures/indicator/v6/I_syminfo_mincontract/meta.json)
retains numeric coverage; quantity-step input provenance comes from an earlier
independent probe, not its own expected column. Historical successful v5 attribution
remains disputed, rather than being treated as equivalent behavior.
