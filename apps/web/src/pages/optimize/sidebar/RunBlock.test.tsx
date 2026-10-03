import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { uiStore } from '../../../state/ui.ts';
import { strategySource } from '../../../workflows/test-support.ts';
import { loadScript } from '../../backtest/states/test-support.tsx';
import {
  loadOptimization,
  loadWalkForward,
  optimization,
  renderInEnglish,
  runOptimization,
  useOptimizeTestServices,
} from '../test-support.tsx';
import { RunBlock } from './RunBlock.tsx';

useOptimizeTestServices();

const block = () => within(screen.getByRole('region', { name: 'Optimization run' }));

test('Start runs the grid, shows its progress with Cancel, then becomes Re-optimize (O1, O8)', async () => {
  const user = userEvent.setup();
  await loadOptimization();
  renderInEnglish(<RunBlock />);
  expect(block().getByText('9')).toBeVisible();
  const threads = optimization().runBlock.threads;
  expect(block().getByText(`No estimate yet, ${threads} threads`)).toBeVisible();
  await user.click(block().getByRole('button', { name: 'Start' }));
  expect(optimization().run.status).toBe('running');
  expect(block().getByRole('progressbar', { name: 'Optimization progress' })).toBeVisible();
  expect(block().getByText('Elapsed 0:00')).toBeVisible();
  expect(block().getByRole('button', { name: 'Cancel' })).toBeVisible();
  await act(async () => {
    while (optimization().run.status === 'running')
      await new Promise((done) => setTimeout(done, 20));
  });
  expect(optimization().results?.combinations).toBe(9);
  expect(block().getByRole('button', { name: 'Re-optimize' })).toBeEnabled();
  expect(block().getByText(/^Last run 0:00, \d threads?$/)).toBeVisible();
  act(() => optimization().actions.setRange('Length', { to: 5 }));
  expect(block().getByText('12')).toBeVisible();
  expect(block().getByText('Re-optimize to update')).toBeVisible();
});

test('Cancel stops the run and keeps the last complete results', async () => {
  const user = userEvent.setup();
  await loadOptimization();
  renderInEnglish(<RunBlock />);
  await runOptimization();
  const results = optimization().results;
  act(() => void optimization().actions.start());
  await user.click(block().getByRole('button', { name: 'Cancel' }));
  expect(optimization().run.status).toBe('cancelled');
  expect(optimization().results).toBe(results);
  expect(block().getByRole('button', { name: 'Re-optimize' })).toBeEnabled();
});

test('failed combinations are counted after a run and open their list (R11)', async () => {
  const user = userEvent.setup();
  await loadScript(`${strategySource}if length == 3 and bar_index == 40\n    runtime.error("x")\n`);
  act(() => optimization().actions.setRange('Length', { from: 2, to: 4, step: 1 }));
  renderInEnglish(<RunBlock />);
  await runOptimization();
  expect(optimization().results?.failures).toHaveLength(3);
  await user.click(block().getByRole('button', { name: '3 failed' }));
  expect(uiStore.getState().openDialogs).toEqual(['failedCombinations']);
});

test('a walk-forward run shows its window and the backtests it took (W4, W1)', async () => {
  await loadWalkForward();
  renderInEnglish(<RunBlock />);
  expect(block().getByText('36')).toBeVisible();
  expect(block().getByText('backtests')).toBeVisible();
  act(() => void optimization().actions.start());
  expect(block().getByText('Window 1 / 4')).toBeVisible();
  expect(block().getByText('0 / 9 combos')).toBeVisible();
  await act(async () => {
    while (optimization().run.status === 'running')
      await new Promise((done) => setTimeout(done, 20));
  });
  expect(optimization().results?.windows).toBe(4);
  expect(block().getByText('36')).toBeVisible();
  expect(block().getByText(/^Last run 0:00, \d threads?$/)).toBeVisible();
});
