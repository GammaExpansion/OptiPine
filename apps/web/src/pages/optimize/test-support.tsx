import { act, waitFor } from '@testing-library/react';
import { beforeEach, expect } from 'vitest';
import { getBacktestStore } from '../../state/backtest.ts';
import { getMarketDataStore } from '../../state/marketData.ts';
import { getOptimizationStore } from '../../state/optimization.ts';
import { testInput } from '../../state/test-support.ts';
import { uiStore } from '../../state/ui.ts';
import { syntheticBars } from '../../workflows/test-support.ts';
import { loadScript, useBacktestTestServices } from '../backtest/states/test-support.tsx';

export { renderInEnglish } from '../backtest/states/test-support.tsx';

/** Fresh services with in-process Workers and the English Optimize page for every test. */
export function useOptimizeTestServices() {
  useBacktestTestServices();
  beforeEach(() => uiStore.setState({ page: 'optimize' }));
}

export const optimization = () => getOptimizationStore().getState();

/**
 * The test strategy with the 120 synthetic bars, ready to optimize a small grid: Length 2–4 by
 * Source close, hl2 and ohlc4, nine combinations over IS / OOS.
 */
export async function loadOptimization() {
  await loadScript();
  await waitFor(() => expect(getBacktestStore().getState().compile.status).toBe('compiled'));
  act(() => optimization().actions.setRange('Length', { from: 2, to: 4, step: 1 }));
  await waitFor(() => expect(optimization().readiness.ok).toBe(true));
}

/** Start the optimization and wait for it to finish. */
export async function runOptimization() {
  await act(() => optimization().actions.start());
  expect(optimization().run.status).toBe('done');
}

/** 180 daily bars from 2026-01-01: four walk-forward windows of 2 IS months and 1 OOS month. */
export const dailyInput = {
  ...testInput,
  timeframe: '1D',
  bars: syntheticBars(180).map((bar, index) => ({
    ...bar,
    time: Date.UTC(2026, 0, 1) / 1000 + index * 86_400,
  })),
};

/** The optimization of `loadOptimization` over the daily bars, set to walk forward by month. */
export async function loadWalkForward() {
  await loadOptimization();
  act(() => {
    getMarketDataStore().getState().actions.useCsv(dailyInput, 'daily.csv');
    optimization().actions.removeFilter(0);
    optimization().actions.removeFilter(0);
    optimization().actions.setValidation({
      mode: 'walk-forward',
      walkForward: { inSampleMonths: 2, outOfSampleMonths: 1, stepMonths: 1 },
    });
  });
  await waitFor(() => expect(optimization().readiness.ok).toBe(true));
}
