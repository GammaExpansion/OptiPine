import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, test } from 'vitest';
import { getBacktestStore, openScript } from '../state/backtest.ts';
import { getMarketDataStore } from '../state/marketData.ts';
import { testInput } from '../state/test-support.ts';
import {
  loadScript,
  renderInEnglish,
  runBacktest,
  useBacktestTestServices,
} from '../pages/backtest/states/test-support.tsx';
import { strategySource } from '../workflows/test-support.ts';
import { RunControls } from './RunControls.tsx';

useBacktestTestServices();
const runButton = () => screen.getByRole('button', { name: /Run backtest/ });

test('the run action explains what is missing, most fundamental first', async () => {
  renderInEnglish(<RunControls />);
  expect(runButton()).toBeDisabled();
  expect(runButton()).toHaveAccessibleDescription('Open a script and select market data first');
  expect(document.getElementById('run-missing')).toHaveTextContent(
    'Open a script and select market data first',
  );
  act(() => openScript({ source: strategySource, fileName: null, origin: { kind: 'pasted' } }));
  await waitFor(() => expect(runButton()).toHaveAccessibleDescription('Select market data first'));
  act(() => getMarketDataStore().getState().actions.useCsv(testInput, 'prices.csv'));
  await waitFor(() => expect(runButton()).toBeEnabled());
  act(() => getBacktestStore().getState().actions.setInput('Length', 1));
  expect(runButton()).toHaveAccessibleDescription('Fix the value of Length');
});

test('a run shows its elapsed time and Cancel, which keeps the previous result', async () => {
  await loadScript();
  renderInEnglish(<RunControls />);
  await runBacktest();
  expect(screen.getByText('120 bars, 0.0 s')).toBeInTheDocument();
  act(() => void getBacktestStore().getState().actions.run());
  expect(screen.getByText('Running, 0.0 s elapsed')).toBeInTheDocument();
  expect(screen.getByRole('progressbar', { name: 'Backtest in progress' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Run backtest/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(getBacktestStore().getState().run.status).toBe('cancelled');
  expect(getBacktestStore().getState().result).not.toBeNull();
  expect(screen.getByText('Run cancelled; previous results kept')).toBeInTheDocument();
  expect(runButton()).toBeEnabled();
});

test('the header marks an outdated result, a failed run and a failed compile', async () => {
  await loadScript();
  renderInEnglish(<RunControls />);
  await runBacktest();
  act(() => getBacktestStore().getState().actions.setInput('Length', 7));
  expect(screen.getByText('Results outdated')).toBeInTheDocument();
  fireEvent.click(runButton());
  await waitFor(() => expect(screen.getByText('120 bars, 0.0 s')).toBeInTheDocument());
  act(() =>
    getBacktestStore()
      .getState()
      .actions.setSource(`${strategySource}if bar_index == 3\n    runtime.error("x")\n`),
  );
  await waitFor(() => expect(runButton()).toBeEnabled());
  await runBacktest();
  expect(screen.getByText('Run failed')).toBeInTheDocument();
  act(() => getBacktestStore().getState().actions.setSource('//@version=6\nplot(missing)'));
  await waitFor(() => expect(screen.getByText('1 compile error')).toBeInTheDocument());
  expect(runButton()).toHaveAccessibleDescription('Fix the compile errors to run');
});
