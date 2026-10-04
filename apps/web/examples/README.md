# Example defaults and tuning evidence

These examples load two calendar years of Binance spot BTCUSDT 1h ending at the current hour.
The audit below uses the public `@pine/engine` `run` and `sweep` APIs. Initial capital remains
100,000 USDT, commission 0.1% per fill, and position size 50% of equity for Trend Breakout and
95% for the two long-only examples. Trend still simulates shorts on spot candles.

## Defaults and scope

“Previous” means the first proposed tuning, before the wider audit requested in review.

| Example        | Input                                 | Original main     | Previous | Revised |
| -------------- | ------------------------------------- | ----------------- | -------- | ------- |
| Trend Breakout | Length                                | 20                | 195      | 180     |
|                | Multiplier                            | 2                 | 2.25     | 2.25    |
|                | Source / trailing / Trail %           | close / false / 3 | same     | same    |
| RSI Reversal   | RSI length                            | 14                | 100      | 14      |
|                | Oversold                              | 30                | 45       | 30      |
|                | Stop %                                | 3                 | 10       | 10      |
|                | Trend EMA length                      | absent            | absent   | 200     |
|                | Source / Exit at midline              | close / true      | same     | same    |
| MA Cross       | Fast length                           | 50                | 99       | 80      |
|                | Slow length                           | 200               | 200      | 250     |
|                | Stop %                                | 5                 | 3        | 3       |
|                | Average type / Require rising slow MA | EMA / true        | same     | same    |

Trend and MA change **defaults only**. All original numeric ranges and steps are retained;
RSI length's maximum is restored to 100 and Oversold's to 45. Every revised numeric default is
more than 10% of its declared range away from either bound. Trend 180 is 20 below its 200 maximum
(the span is 195); MA 80 is 20 below its 100 maximum (span 95). The test checks this rule for every
numeric input, including risk controls.

RSI adds one standard entry filter: an oversold recovery may buy only while `close > ta.ema(close,
trendLength)`. It remains a long-only recovery through the oversold threshold, with a midline or
symmetric overbought exit and a percentage stop. The EMA input is appended after the existing
inputs. Its 50–500 hourly-bar range covers roughly two days through three weeks, independently
useful trend horizons; step 10 and default 200 give ordinary round choices. The existing RSI
inputs keep their titles and order. Tests check actual eligibility and identical prefix signals
when future bars are removed.

Trend's five inputs stay on lines 9–13 and its plots on 33–35, as on B3. Its defaults differ from
the mock's illustrative values. Mock performance figures are illustrative, not example-run
assertions, and are unchanged. RSI's added input and calculation shift later lines; that is the
only strategy logic/layout deviation, explicitly permitted in review. No packages or production
UI components change.

## Primary data and headline results

The recorded fixture is `../e2e/fixtures/market/btc-two-years.json.gz`: 17,520 real closed hourly
bars in `[2024-10-03 14:00, 2026-10-03 14:00)` UTC. See its README for provenance. Net includes
fees and excludes unrealized open P&L. PF is profit factor, trades are closed trades, win rate is
percentage profitable, and drawdown is the engine's intrabar maximum, amount and percentage of
the applicable equity peak. All amounts below are USDT.

| Example | Version  | Net profit |     PF | Trades | Win rate |       Max drawdown |
| ------- | -------- | ---------: | -----: | -----: | -------: | -----------------: |
| Trend   | Previous | +44,147.68 | 1.7965 |     40 |   42.50% |  11,685.67 / 9.91% |
| Trend   | Revised  | +45,086.79 | 1.8011 |     40 |   45.00% | 12,446.33 / 10.44% |
| RSI     | Previous | +37,215.96 | 1.8781 |     46 |   73.91% | 22,628.99 / 16.48% |
| RSI     | Revised  | +11,098.75 | 2.6929 |     23 |   73.91% |   7,644.37 / 7.61% |
| MA      | Previous | +49,459.44 | 1.6775 |     32 |   37.50% | 31,888.80 / 21.18% |
| MA      | Revised  | +47,932.04 | 1.6728 |     31 |   32.26% | 35,200.86 / 23.18% |

Each half is an independent 8,760-bar run with fresh capital, flat positions and fresh indicator
warmup; the split is 2025-10-03 14:00 UTC. They do not sum to the compounded full-period result.

| Example | Version  | First-year net | Second-year net |
| ------- | -------- | -------------: | --------------: |
| Trend   | Previous |     +12,123.06 |      +18,803.67 |
| Trend   | Revised  |     +12,166.98 |      +19,760.77 |
| RSI     | Previous |     +35,880.79 |         +982.62 |
| RSI     | Revised  |      +4,257.53 |       +6,035.41 |
| MA      | Previous |     +45,163.74 |       +6,083.28 |
| MA      | Revised  |     +46,807.53 |       +3,823.50 |

## Narrow and wide neighbourhoods

All grids are Cartesian and include the centre. Narrow grids use ±1 declared step, with bools and
options fixed at their defaults. A narrow winner has net > 0 and finite PF > 1. Wide grids count
net > 0 as profitable: PF is null when no trade loses, so the finite-PF count is also disclosed.
Zero-trade points stay in the denominator and mean, as do losing points. No results are discarded.

| Example | Version  | Narrow profitable | Narrow mean net |  Wide profitable | Wide mean net |
| ------- | -------- | ----------------: | --------------: | ---------------: | ------------: |
| Trend   | Previous |      27/27 (100%) |      +35,991.24 | 475/720 (65.97%) |    +11,360.52 |
| Trend   | Revised  |      27/27 (100%) |      +30,890.09 | 400/720 (55.56%) |     +4,971.01 |
| RSI     | Previous |      27/27 (100%) |      +23,694.83 | 156/576 (27.08%) |    −10,474.99 |
| RSI     | Revised  |      81/81 (100%) |      +13,278.36 | 103/162 (63.58%) |     +4,335.54 |
| MA      | Previous |      27/27 (100%) |      +50,746.77 | 288/300 (96.00%) |    +39,286.14 |
| MA      | Revised  |      27/27 (100%) |      +49,732.38 |   108/108 (100%) |    +36,290.62 |

Narrow axes, in input order:

| Example | Previous                                                       | Revised                                                                 |
| ------- | -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Trend   | Length 194/195/196; Multiplier 2/2.25/2.5; Trail % 2.75/3/3.25 | Length 179/180/181; same Multiplier and Trail %                         |
| RSI     | Length 99/100/101; Oversold 44/45/46; Stop % 9.5/10/10.5       | Length 13/14/15; Oversold 29/30/31; Stop % 9.5/10/10.5; EMA 190/200/210 |
| MA      | Fast 98/99/100; Slow 199/200/201; Stop % 2.5/3/3.5             | Fast 79/80/81; Slow 249/250/251; same Stop %                            |

Trend's inactive Trail % repeats equivalent narrow runs; it does not change the mean. The wide
grid activates both trailing modes, so that dimension matters there.

Wide axes (roughly ±20% numeric stress, with bounds exceptions explained below):

| Example | Version  | Numeric axes                                                             | Bools and options                              |
| ------- | -------- | ------------------------------------------------------------------------ | ---------------------------------------------- |
| Trend   | Previous | Length 160/180/195/210/230; Multiplier 1.75/2.25/2.75; Trail % 2.5/3/3.5 | Both trailing values × all 8 sources           |
| Trend   | Revised  | Length 140/160/180/200/220; same Multiplier and Trail %                  | Both trailing values × all 8 sources           |
| RSI     | Previous | Length 80/100/120; Oversold 36/40/45/49; Stop % 8/10/12                  | Both exits × all 8 sources                     |
| RSI     | Revised  | Length 11/14/17; Oversold 24/30/36; Stop % 8/10/12; EMA 160/200/240      | Both exits; close source                       |
| MA      | Previous | Fast 80/90/99/110/120; Slow 160/180/200/220/240; Stop % 2.5/3/3.5        | Both average types × both rising-filter values |
| MA      | Revised  | Fast 65/80/95; Slow 200/250/300; Stop % 2.5/3/3.5                        | Both average types × both rising-filter values |

All 8 sources means open/high/low/close/hl2/hlc3/ohlc4/hlcc4. Engine overrides deliberately probe
lengths past the UI maximum for Trend and the previous MA pick, without expanding their declared
ranges. Previous RSI Oversold stops at 49: extending 45 to 54 would invert its intended oversold
and overbought roles. Revised RSI's threshold grid covers the full ±20% without clipping.
RSI's fourth numeric input makes a full source cross expensive; a separate centre audit covers
all 8 sources × both exits: 10/16 profitable, mean +2,633.51, with all 8 sources profitable at the default midline
exit. This samples categorical sensitivity, not all source/numeric interactions.

The wide RSI previous count has 155 finite PF > 1 winners and one positive point without losses.
The revised count has 97 finite-PF winners, 6 positive points without losses, and 36 no-trade
points. Its midline subset is 63/81 profitable, mean +6,953.28; overbought exits are 40/81,
mean +1,717.79. Trend's trailing-off subset averages +8,750.59, versus +1,191.44 with trailing on.
These are modest, uneven plateaus for Trend and RSI, not evidence that arbitrary nearby settings
work. MA's broad plateau is substantially stronger. Round interior defaults intentionally give up
some neighbourhood mean relative to the edge picks.

## Why the RSI filter

A conventional unfiltered screen tested 96 combinations: length 14/20/25/30, Oversold 25/30/35/40,
both exits, and Stop % 3/5/10. None met positive full-period and both-year results with at least 30
closed trades. The best full-period candidate, 14/25 with overbought exit and a 10% stop, made
+14,852.96 but lost −18,062.64 in year two. This finite screen does not prove that every possible
unfiltered setting fails; it supports using the permitted simple trend filter instead of stretching
RSI to 100 bars and its threshold to 45.

The same 96 sets with EMA(200), followed by 18 EMA(300/400) horizon probes, identified conventional
candidates. Wide-grid checks rejected RSI(14)/35/EMA(200) (88/162 profitable but mean −1,077.96)
and RSI(20)/35/EMA(300) (68/162 profitable, mean +975.89), despite the latter's 81/81 profitable
narrow grid and +16,749.32 centre profit. This illustrates why a narrow grid alone is insufficient.
RSI(25)/40/EMA(200) with a 3% stop initially passed a clipped grid (114/216, mean +2,888.53),
but extending Oversold through the full +20% value of 48 made all 54 added points lose:
114/270 profitable, mean -3,903.27. That candidate was rejected. EMA(300) at the same centre
had only a marginal clipped-grid improvement (116/216, mean +2,909.37). RSI(14)/30 with a
3% stop also failed the majority test (74/162, mean +1,606.73).

The final comparison widened the stop to 8/10/12%, retaining conventional RSI thresholds.
At Oversold 35 the wide result was 104/162, mean +1,878.04, and its narrow mean +9,816.09
(80/81 profitable). Oversold 30 has the stronger wide and narrow means and retains the original
RSI(14)/30 interpretation. The 10% stop gives recoveries room to reach the existing exit;
position size and fees are unchanged. The selected EMA(200) is a familiar trend horizon.
The default closes 23 trades, meeting “tens” but below the initial screening cutoff of 30;
the regression floor is now 20. This trades sample size for conventional settings and a better
plateau, not a claim that 23 trades establish durability. All original bounds are restored.

## Fresh Binance check

The secondary request uses `@pine/market-data` `loadFeed` and `createUpstreamFetch`, covering
`[2024-10-04 02:00, 2026-10-04 02:00)` UTC: 17,520 closed bars, fetched on 2026-10-04 UTC
(2026-10-03 America/Los_Angeles). The optional live test passed for all revised defaults.
No live data is stored in the repository.

| Example | Net profit |     PF | Trades | Win rate |       Max drawdown |
| ------- | ---------: | -----: | -----: | -------: | -----------------: |
| Trend   | +45,086.79 | 1.8011 |     40 |   45.00% | 12,446.33 / 10.44% |
| RSI     | +11,098.75 | 2.6929 |     23 |   73.91% |   7,644.37 / 7.61% |
| MA      | +47,932.04 | 1.6728 |     31 |   32.26% | 35,200.86 / 23.18% |

The inputs overlap by 17,508 hours. Identical closed-trade metrics are expected: this checks the
fresh current-hour request, not independent out-of-sample performance.

- Trend: the in-sample wide plateau is uneven and uses simulated shorts; use walk-forward to test
  whether this slow breakout region persists.
- RSI: the in-sample EMA filter leaves only 23 closed trades and many sparse grid points; use
  walk-forward to test the recovery rule in unseen regimes.
- MA: in-sample profit remains first-year-heavy with 23.18% drawdown; use walk-forward to assess
  the broad parameter region outside the selected period.

## Verification and reproduction

The ordinary profitability test checks net > 0, PF > 1, 20–400 closed trades, positive independent
years, narrow neighbourhoods and RSI categorical options on the recorded fixture. The expensive
wide-grid audit and network check are explicit opt-ins; routine web tests remain offline and do
not execute hundreds of extra full-history backtests. Diagnostics print exact metrics and counts.

```powershell
node --test apps/web/examples/examples.test.ts apps/web/examples/profitability.test.ts
$env:EXAMPLES_WIDE = '1'
node --test --test-name-pattern='wider profitable plateau' apps/web/examples/profitability.test.ts
Remove-Item Env:EXAMPLES_WIDE
$env:EXAMPLES_LIVE = '1'
node --test --test-name-pattern='latest two years' apps/web/examples/profitability.test.ts
Remove-Item Env:EXAMPLES_LIVE
```

For previous wide grids, use the table's overrides with `sweep`; for RSI also remove the added
EMA input/calculation and `and close > trend` entry clause. Split years before running; do not
slice the output of a full-period run. Preserve the fixture's symbol metadata and execution mode.

Synthetic tests retain compile/plot intent and cover the added filter. The chart unit test uses
the demo's full history for slower Trend signals; the marker e2e focuses an actual closed RSI
trade; the drawdown-label assertion accepts compact and full-value negative labels at the new scale. B9 checks the revised default, B12 explicitly fixes its short window and unreachable band,
and the recorded B5 test checks tens of trades and profitability instead of an obsolete >300 count.
Searches of `apps/web/e2e`, `apps/web/src` and `docs` found no other real-run numeric assertions.

Required gates (run from the repository root):

```powershell
npm run build
npm run typecheck --workspaces
npm run test -w @pine/web -- --maxWorkers=2
npm run format:check
$env:E2E_BASE_PORT = '6474'
npm run e2e -w @pine/web -- --workers=2
npm run check
```

Final verification: build and all workspace typechecks passed; the web suite with
`EXAMPLES_WIDE=1` passed 147 Node tests (only the live test skipped) and 332 Vitest tests.
The separate live test passed. Full Playwright passed all 74 tests on base port 6474 with two
workers. Formatting passed. `npm run check` matched all 240 verified fixtures, with no mismatches,
unsupported cases or crashes, and preserved the regression baseline (six fixtures remain
unverified). An earlier optimizer timing assertion failed during concurrent exploratory work;
the final web run passed without changing that test. The chart expectation described above was
corrected before the passing full e2e rerun. Existing jsdom canvas warnings do not fail Vitest.
