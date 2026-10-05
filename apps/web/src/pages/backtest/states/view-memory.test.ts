import { expect, it } from 'vitest';
import type { BacktestState } from '../../../workflows/backtest.ts';
import { backtestViewMemory } from './view-memory.ts';

const initial = () =>
  ({
    scriptId: 1,
    source: 'script',
    compile: { status: 'compiled' },
    run: { status: 'done' },
    dataset: { revision: 1, input: { bars: [] } },
    result: null,
    preview: null,
  }) as unknown as BacktestState;

it('edits, input/property changes, running and replacement results share the displayed data view', () => {
  const state = initial();
  const view = backtestViewMemory(state)!;
  view.equity.unit = 'percent';
  view.trades.scrollTop = 300;
  const result = { computedWith: { dataset: state.dataset } } as BacktestState['result'];
  expect(backtestViewMemory({ ...state, source: 'edited', result })).toBe(view);
  expect(backtestViewMemory({ ...state, run: { status: 'running', startedAt: 1 }, result })).toBe(
    view,
  );
  expect(backtestViewMemory({ ...state, result: { ...result! } })).toBe(view);
  expect(backtestViewMemory({ ...state, scriptId: 2 })).not.toBe(view);
  expect(backtestViewMemory({ ...state, dataset: { ...state.dataset!, revision: 2 } })).not.toBe(
    view,
  );
});

it('preview views are separate and returning restores the main view on its own data', () => {
  const state = initial();
  const main = backtestViewMemory(state)!;
  const origin = { kind: 'rank', rank: 1, optimizationId: 1, trialId: 'a' } as const;
  const preview = {
    origin,
    result: null,
    run: { status: 'running', startedAt: 1 },
  } as BacktestState['preview'];
  const view = backtestViewMemory({ ...state, preview });
  expect(view).not.toBe(main);
  expect(backtestViewMemory({ ...state, preview: { ...preview! } })).toBe(view);
  expect(backtestViewMemory(state)).toBe(main);
  // An outdated result stays on its own dataset until a new run actually displays new data.
  const result = { computedWith: { dataset: state.dataset } } as BacktestState['result'];
  expect(
    backtestViewMemory({ ...state, result, dataset: { ...state.dataset!, revision: 2 } }),
  ).toBe(main);
});
