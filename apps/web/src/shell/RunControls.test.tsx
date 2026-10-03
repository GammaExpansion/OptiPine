import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, test } from 'vitest';
import { getBacktestStore, openScript } from '../state/backtest.ts';
import { getMarketDataStore } from '../state/marketData.ts';
import { testInput } from '../state/test-support.ts';
import { uiStore } from '../state/ui.ts';
import {
  loadScript,
  renderInEnglish,
  runBacktest,
  useBacktestTestServices,
} from '../pages/backtest/states/test-support.tsx';
import { strategySource } from '../workflows/test-support.ts';
import {
  loadOptimization,
  loadWalkForward,
  optimization,
  runOptimization,
} from '../pages/optimize/test-support.tsx';
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

const facts = () => screen.getByLabelText('Last run');

test('on the Optimize page the header states the run, with Cancel and no main action (R1, O8)', async () => {
  await loadOptimization();
  act(() => uiStore.setState({ page: 'optimize' }));
  renderInEnglish(<RunControls />);
  expect(facts()).toHaveTextContent('No optimization has run yet');
  expect(screen.queryByRole('button', { name: /Run backtest|Start/ })).toBeNull();
  let run!: Promise<void>;
  act(() => {
    run = optimization().actions.start();
  });
  expect(facts()).toHaveTextContent(/^Optimizing 0 \/ (0|9)$/);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await act(() => run);
  expect(facts()).toHaveTextContent('Optimization cancelled');
  await runOptimization();
  expect(facts()).toHaveTextContent('9 combos, 0:00');
  act(() => optimization().actions.setValidation({ outOfSamplePercent: 40 }));
  expect(facts()).toHaveTextContent('Results outdated');
  act(() => void optimization().actions.start());
  act(() => optimization().actions.cancel());
  expect(facts()).toHaveTextContent('Results outdated');
  act(() => optimization().actions.setValidation({ outOfSamplePercent: 30 }));
  expect(facts()).toHaveTextContent('Optimization cancelled; last results kept');
});

test('the header links failed combinations to their list and says when sets were sampled', async () => {
  await loadScript(`${strategySource}if length == 3 and bar_index == 40\n    runtime.error("x")\n`);
  act(() => {
    uiStore.setState({ page: 'optimize' });
    optimization().actions.setRange('Length', { from: 2, to: 4, step: 1 });
    optimization().actions.setSearched('Multiplier', false);
    optimization().actions.setSampling({ method: 'random', count: 5 });
  });
  renderInEnglish(<RunControls />);
  await runOptimization();
  expect(facts()).toHaveTextContent('5 random in 0:00');
  fireEvent.click(screen.getByRole('button', { name: /\d failed/ }));
  expect(uiStore.getState().openDialogs).toEqual(['failedCombinations']);
});

test('a walk-forward run states its window, then the windows it took (W4, W1)', async () => {
  await loadWalkForward();
  act(() => uiStore.setState({ page: 'optimize' }));
  renderInEnglish(<RunControls />);
  let run!: Promise<void>;
  act(() => {
    run = optimization().actions.start();
  });
  expect(facts()).toHaveTextContent('Window 1 / 4');
  await act(() => run);
  expect(facts()).toHaveTextContent(/^4 windows in 0:00$/);
});
