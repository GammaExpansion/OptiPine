import { act, cleanup, render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect } from 'vitest';
import { I18nProvider } from '../../../i18n/I18nProvider.tsx';
import { getBacktestStore, openScript } from '../../../state/backtest.ts';
import { getMarketDataStore } from '../../../state/marketData.ts';
import { replaceServices } from '../../../state/services.ts';
import { fakeServices, testInput } from '../../../state/test-support.ts';
import { defaultPaneSizes, uiStore } from '../../../state/ui.ts';
import { strategySource } from '../../../workflows/test-support.ts';

/** Fresh services with in-process Workers and the English UI for every test of the file. */
export function useBacktestTestServices() {
  let restore: () => void;
  beforeEach(() => {
    restore = replaceServices(() => fakeServices());
    uiStore.setState({
      page: 'backtest',
      dockTab: 'report',
      language: 'en',
      openDialogs: [],
      paneSizes: { backtest: { ...defaultPaneSizes }, optimize: { ...defaultPaneSizes } },
      drawerOpen: false,
      optimizeTab: 'summary',
    });
  });
  afterEach(() => {
    cleanup();
    restore();
  });
}

export const renderInEnglish = (ui: ReactNode) => render(<I18nProvider>{ui}</I18nProvider>);

/** Open `source` with the 120 synthetic test bars and wait for its compile. */
export async function loadScript(source = strategySource) {
  act(() => {
    openScript({ source, fileName: 'test.pine', origin: { kind: 'file' } });
    getMarketDataStore().getState().actions.useCsv(testInput, 'prices.csv');
  });
  await waitFor(() => expect(getBacktestStore().getState().compile.status).not.toBe('compiling'));
}

export async function runBacktest() {
  await act(() => getBacktestStore().getState().actions.run());
}

/** The test strategy, failing at its fourth bar (zero-based bar 3). */
export const failingSource = `${strategySource}if bar_index == 3
    runtime.error("Stopped on purpose")
`;

/** A strategy that never enters. */
export const quietSource = `//@version=6
strategy("Quiet", initial_capital = 10000)
length = input.int(5, "Length", minval = 2)
plot(ta.sma(close, length), "Basis")
`;
