import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runWithEquity, type MarketBar } from '@pine/engine';
import type { TrialResult } from './validation.ts';
import { finalizeWalkForward, type WalkForwardExecution } from './walk-forward.ts';

const day = 86400;
const config = { inSampleLength: 12, outOfSampleLength: 6, step: 6 };
const cagrKey = 'Performance/Annualized return (CAGR)/All %';
const capitalKey = 'Performance/Initial capital/All USD';
const netKey = 'Performance/Net profit/All USD';
const cagr = (change: number, days: number) => ((1 + change / 1000) ** (365 / days) - 1) * 100;
const bar = (time: number): MarketBar => ({
  time,
  open: 100,
  high: 100,
  low: 100,
  close: 100,
  volume: 1,
});
const result = (change: number, days: number): TrialResult => ({
  plots: [],
  trades: [],
  diagnostics: [],
  equity: [1000, 1000 + change],
  metrics: { [capitalKey]: 1000, [netKey]: change, [cagrKey]: cagr(change, days) },
});

/** Independent account endpoints let each regression choose its return and observed duration. */
function window(
  index: number,
  inChange: number,
  outChange: number,
  outDays = 365,
  outStartDays = 730,
): WalkForwardExecution {
  const split = outStartDays * day;
  return {
    index,
    inSampleStart: split - 365 * day,
    inSampleEnd: split,
    outOfSampleStart: split,
    outOfSampleEnd: split + outDays * day + 1,
    inSampleStartIndex: 0,
    inSampleEndIndex: 2,
    outOfSampleStartIndex: 2,
    outOfSampleEndIndex: 4,
    gapBefore: false,
    trials: [],
    inSampleBars: [bar(split - 365 * day), bar(split)],
    outOfSampleBars: [bar(split), bar(split + outDays * day)],
    inSampleResult: result(inChange, 365),
    outOfSampleResult: result(outChange, outDays),
  };
}

function close(actual: number | null, expected: number) {
  assert.notEqual(actual, null);
  assert.ok(Math.abs(actual! - expected) < 1e-10, `${actual} != ${expected}`);
}

for (const [inside, outside] of [
  [-100, 200],
  [-100, -200],
  [0, 200],
]) {
  test(`IS ${inside} and OOS ${outside} have no window or total WFE`, () => {
    const finalized = finalizeWalkForward([window(0, inside, outside)], config);
    assert.equal(finalized.windows[0].wfe, null);
    assert.equal(finalized.totals.wfe, null);
  });
}

test('positive IS retains a negative WFE for OOS losses and zero for flat OOS', () => {
  for (const outside of [-200, 0, 200]) {
    const finalized = finalizeWalkForward([window(0, 100, outside)], config);
    close(finalized.windows[0].wfe, outside / 100);
    close(finalized.totals.wfe, outside / 100);
  }
});

test('a three-day final window cannot dominate the stitched annualized return', () => {
  const first = window(0, 100, -200);
  const tail = { ...window(1, 100, 10, 3, 1096), partial: true };
  const finalized = finalizeWalkForward([first, tail], config);
  assert.ok(finalized.windows[1].wfe! > Math.abs(finalized.windows[0].wfe!));
  assert.equal(finalized.totals.equity.at(-1), 810);
  close(finalized.totals.wfe, cagr(-190, 369) / cagr(200, 730));
});

test('a losing stitched OOS run cannot inherit a positive sum of window CAGRs', () => {
  const first = window(0, 100, -500, 182.5);
  const second = window(1, 100, 400, 182.5, 913.5);
  const finalized = finalizeWalkForward([first, second], config);
  const oldRatio =
    finalized.windows.reduce((sum, item) => sum + item.outOfSampleAnnualized!, 0) /
    finalized.windows.reduce((sum, item) => sum + item.inSampleAnnualized!, 0);
  assert.ok(oldRatio > 0);
  assert.equal(finalized.totals.equity.at(-1), 900);
  assert.equal(finalized.totals.outOfSampleNet, -100);
  close(finalized.totals.wfe, cagr(-100, 366) / cagr(200, 730));
  assert.ok(finalized.totals.wfe! < 0);
});

test('overlapping anchored IS durations concatenate and OOS idle gaps count in elapsed time', () => {
  const first = window(0, 100, 50, 90);
  const second = window(1, 200, 50, 90, 1000);
  second.inSampleStart = first.inSampleStart;
  second.inSampleBars = [bar(first.inSampleStart), bar(second.inSampleEnd)];
  second.inSampleResult = result(200, 635);
  const finalized = finalizeWalkForward([first, second], config);
  close(finalized.totals.wfe, cagr(100, 360) / cagr(300, 1000));
});

test('window and total amounts and WFE use equity while objectives and profitability retain reported net', () => {
  const execution = window(0, 100, 50);
  execution.inSampleResult!.metrics[cagrKey] = 999;
  execution.outOfSampleResult!.metrics[cagrKey] = 999;
  execution.outOfSampleResult!.equity = [1000, 950];
  const finalized = finalizeWalkForward([execution], config);
  close(finalized.windows[0].wfe, -0.5);
  close(finalized.totals.wfe, -0.5);
  assert.equal(finalized.windows[0].outOfSampleNet, -50);
  assert.equal(finalized.windows[0].outOfSampleValue, -50);
  assert.equal(finalized.windows[0].outOfSampleObjectiveValue, 50);
  assert.equal(finalized.totals.outOfSampleNet, -50);
  assert.equal(finalized.totals.outOfSampleValue, -50);
  assert.equal(finalized.totals.metrics[netKey], -50);
  assert.equal(finalized.totals.winningWindows, 1);
});

test('an open position is valued at the last bar without charging an exit commission', () => {
  const execution = window(0, 0, 0);
  const source = `//@version=6
strategy("Hold", initial_capital=1000, commission_type=strategy.commission.percent, commission_value=1)
if bar_index == 0
    strategy.entry("L", strategy.long, qty=1)`;
  for (const [side, lastPrice] of [
    ['inSample', 120],
    ['outOfSample', 110],
  ] as const) {
    const original = execution[`${side}Bars`];
    const bars = [
      original[0],
      bar(original[0].time + day),
      {
        ...original[1],
        open: lastPrice,
        high: lastPrice,
        low: lastPrice,
        close: lastPrice,
      },
    ];
    const result = runWithEquity(source, { bars, timeframe: 'D', syminfo: {} });
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.metrics[netKey], -1, 'only the entry commission is realized');
    assert.equal(result.metrics['Performance/Open PnL/All USD'], lastPrice - 100);
    assert.equal(result.equity.at(-1), 1000 + lastPrice - 100 - 1);
    execution[`${side}Bars`] = bars;
    execution[`${side}Result`] = result;
  }
  const finalized = finalizeWalkForward([execution], config);
  assert.equal(finalized.windows[0].inSampleNet, 19);
  assert.equal(finalized.windows[0].outOfSampleNet, 9);
  assert.equal(finalized.totals.inSampleNet, 19);
  assert.equal(finalized.totals.outOfSampleNet, 9);
  assert.equal(finalized.totals.equity.at(-1), 1009);
  assert.equal(finalized.totals.metrics[netKey], 9);
  assert.equal(finalized.totals.metrics['Performance/Net profit/Long USD'], null);
  assert.equal(finalized.totals.winningWindows, 0);
  close(finalized.windows[0].wfe, 9 / 19);
  close(finalized.totals.wfe, 9 / 19);
});

test('the README windows reconcile marked-to-market amounts with the stitched curve and WFE', () => {
  // Audited real BTC runs: independent account endpoints and observed bar spans, including W3's tail.
  const endpoints = [
    [
      1727964000, 1761951600, 112925.36278329839, 1761955200, 1772319600, 118016.816255899,
      4556.504004699,
    ],
    [
      1738368000, 1772319600, 121160.09660370476, 1772323200, 1782860400, 103181.30720631509,
      946.4244991150862,
    ],
    [
      1748736000, 1782860400, 124670.10280877628, 1782864000, 1791032400, 99485.44432173058,
      -3410.714240769414,
    ],
  ];
  const executions = endpoints.map(
    ([isStart, isEnd, isEquity, oosStart, oosEnd, oosEquity, net], index) => {
      const execution = window(index, 0, 0);
      execution.inSampleBars = [bar(isStart), bar(isEnd)];
      execution.outOfSampleBars = [bar(oosStart), bar(oosEnd)];
      execution.outOfSampleStart = oosStart;
      execution.outOfSampleEnd = oosEnd + 3600;
      execution.inSampleResult = {
        ...result(0, 365),
        equity: [100000, isEquity],
        metrics: { [capitalKey]: 100000 },
      };
      execution.outOfSampleResult = {
        ...result(0, 365),
        equity: [100000, oosEquity],
        metrics: { [capitalKey]: 100000, [netKey]: net },
      };
      return execution;
    },
  );
  const finalized = finalizeWalkForward(executions, {
    inSampleLength: 13,
    outOfSampleLength: 4,
    step: 4,
  });
  close(finalized.totals.inSampleNet, 58755.56219577944);
  close(finalized.totals.outOfSampleNet, 20683.56778394467);
  close(finalized.totals.equity.at(-1)!, 120683.56778394467);
  close(finalized.totals.wfe, 1.4733395725598648);
  assert.equal(finalized.totals.winningWindows, 2);
  for (const [index, window] of finalized.windows.entries()) {
    const [isStart, isEnd, isEquity, oosStart, oosEnd, oosEquity] = endpoints[index];
    const annualized = (equity: number, seconds: number) =>
      ((equity / 100000) ** ((365 * day) / seconds) - 1) * 100;
    close(window.inSampleNet, isEquity - 100000);
    close(window.outOfSampleNet, oosEquity - 100000);
    close(
      window.wfe,
      annualized(oosEquity, oosEnd - oosStart) / annualized(isEquity, isEnd - isStart),
    );
  }
});

test('a one-bar tail has no window CAGR but can complete a stitched account', () => {
  const first = window(0, 100, 50);
  const tail = window(1, 100, 0, 0, 1096);
  tail.outOfSampleBars = [tail.outOfSampleBars[0]];
  tail.outOfSampleResult!.equity = [1000];
  tail.outOfSampleResult!.metrics[cagrKey] = null;
  const finalized = finalizeWalkForward([first, tail], config);
  assert.equal(finalized.windows[1].wfe, null);
  close(finalized.totals.wfe, cagr(50, 366) / cagr(200, 730));
  assert.equal(finalizeWalkForward([tail], config).totals.wfe, null);
});

test('missing or failed equity, invalid capital and nonfinite annualization stay unavailable', () => {
  assert.equal(finalizeWalkForward([], config).totals.wfe, null);
  for (const side of ['inSampleResult', 'outOfSampleResult'] as const) {
    for (const alter of [
      (value: TrialResult) => {
        value.equity = undefined;
      },
      (value: TrialResult) => {
        value.equity = [1000];
      },
      (value: TrialResult) => {
        value.equity = [1000, NaN];
      },
      (value: TrialResult) => {
        value.equity = [1000, 0];
      },
      (value: TrialResult) => {
        value.metrics[capitalKey] = 0;
      },
      (value: TrialResult) => {
        value.diagnostics = [{ kind: 'runtime', line: 1, message: 'failed' }];
      },
    ]) {
      const execution = window(0, 100, 50);
      alter(execution[side]!);
      assert.equal(finalizeWalkForward([execution], config).totals.wfe, null);
    }
  }
  const execution = window(0, 100, 1000, 0.001);
  assert.equal(finalizeWalkForward([execution], config).totals.wfe, null);
  assert.equal(finalizeWalkForward([execution], config).windows[0].wfe, null);
});
