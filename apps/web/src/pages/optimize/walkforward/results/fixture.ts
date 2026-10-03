import type { ParameterOrigin } from '../../../../workflows/inputs.ts';
import type { WalkForwardView, WindowResult } from '../../../../workflows/walk-forward.ts';
import { fixtureMap, stabilityFixture } from '../stability/fixture.ts';

export type ResultsScenario = 'complete' | 'live' | 'flat';
const day = 86400;
const isNets = [9840, 11200, 10450, 8900, 12300, 10100];
const oosNets = [2310, 1120, -860, 2980, 1640, 410];
const trades = [41, 38, 35, 44, 39, 12];
const efficiencies = [0.94, 0.4, -0.33, 1.34, 0.53, 0.44];

/** Smooth deterministic samples for screenshot coverage; these are not engine results. */
function curve(count: number, start: number, net: number, seed: number) {
  return Array.from({ length: count }, (_, index) => {
    const position = index / Math.max(1, count - 1);
    return (
      start +
      net * position +
      Math.sin(position * Math.PI) * (Math.sin(index * 1.9 + seed) * 80 + Math.sin(index / 5) * 170)
    );
  });
}

export function fixtureOrigin(window: WindowResult): ParameterOrigin | null {
  return window.status === 'done' && window.trialId !== null
    ? { kind: 'window', optimizationId: 1, trialId: window.trialId, window: window.plan.index }
    : null;
}

/** W1/W2, W4 and W5 extend the stability fixture with dated equity and a fixed set. */
export function resultsFixture(scenario: ResultsScenario = 'complete'): WalkForwardView {
  const base = stabilityFixture();
  const start = Date.UTC(2023, 0, 1) / 1000;
  const end = Date.UTC(2025, 4, 5) / 1000;
  const times = Array.from({ length: (end - start) / day }, (_, index) => start + index * day);
  let capital = 100000;
  const windows = base.windows.map((window, index): WindowResult => {
    const plan = {
      ...window.plan,
      outOfSampleEnd: Math.min(window.plan.outOfSampleEnd, end),
      inSampleStartIndex: (window.plan.inSampleStart - start) / day,
      outOfSampleStartIndex: (window.plan.outOfSampleStart - start) / day,
      inSampleBars: (window.plan.inSampleEnd - window.plan.inSampleStart) / day,
      outOfSampleBars:
        (Math.min(window.plan.outOfSampleEnd, end) - window.plan.outOfSampleStart) / day,
      partial: index === 5,
    };
    if (scenario === 'live' && index >= 2)
      return {
        ...window,
        plan,
        status: index === 2 ? 'running' : 'waiting',
        completed: index === 2 ? 280 : 0,
        trialId: null,
        parameters: null,
        inSample: null,
        outOfSample: null,
        wfe: null,
        inSampleEquity: [],
        outOfSampleEquity: [],
      };
    if (scenario === 'flat' && index === 3)
      return {
        ...window,
        plan,
        status: 'flat',
        trialId: null,
        parameters: null,
        inSample: null,
        outOfSample: { netProfit: 0, annualizedReturn: 0, trades: 0 },
        wfe: null,
        inSampleEquity: [],
        outOfSampleEquity: Array.from({ length: plan.outOfSampleBars }, () => capital),
      };
    const inSampleEquity = curve(plan.inSampleBars, capital - isNets[index], isNets[index], index);
    const outOfSampleEquity = curve(plan.outOfSampleBars, capital, oosNets[index], index + 10);
    capital += oosNets[index];
    return {
      ...window,
      plan,
      inSample: { netProfit: isNets[index], annualizedReturn: 10, trades: 140 },
      outOfSample: {
        netProfit: oosNets[index],
        annualizedReturn: efficiencies[index] * 10,
        trades: trades[index],
      },
      wfe: efficiencies[index],
      inSampleEquity,
      outOfSampleEquity,
    };
  });
  const live = scenario === 'live';
  const flat = scenario === 'flat';
  const selected = windows[live ? 1 : 2];
  const view: WalkForwardView = {
    ...base,
    windows,
    times,
    inProgress: live,
    totals: {
      windows: 6,
      completed: live ? 2 : 6,
      traded: live ? 2 : flat ? 5 : 6,
      profitable: live ? 2 : flat ? 4 : 5,
      flat: flat ? 1 : 0,
      failed: 0,
      inSampleNet: live ? 21040 : flat ? 53890 : 62790,
      outOfSampleNet: live ? 3430 : flat ? 4620 : 7600,
      outOfSampleTrades: live ? 79 : flat ? 165 : 209,
      wfe: live ? null : flat ? 0.41 : 0.54,
    },
    equity: {
      times: windows.flatMap((window) =>
        times.slice(
          window.plan.outOfSampleStartIndex,
          window.plan.outOfSampleStartIndex + window.outOfSampleEquity.length,
        ),
      ),
      values: windows.flatMap((window) => window.outOfSampleEquity),
    },
    fixed: live
      ? null
      : {
          parameters: { Length: 27, Multiplier: 2, Source: 'close', 'Use trailing stop': false },
          meanLoss: 0.019,
          origin: { kind: 'fixed', optimizationId: 1 },
        },
    stability: live ? null : base.stability,
    map: null,
    selection: { window: selected, explicit: !live, origin: fixtureOrigin(selected) },
  };
  return { ...view, map: live ? null : fixtureMap(view) };
}
