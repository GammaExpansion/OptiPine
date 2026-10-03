import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { getBacktestStore } from '../../../state/backtest.ts';
import { uiStore } from '../../../state/ui.ts';
import { strategySource } from '../../../workflows/test-support.ts';
import { PreviewBanner } from '../../backtest/preview/PreviewBanner.tsx';
import { loadScript } from '../../backtest/states/test-support.tsx';
import {
  optimization,
  renderInEnglish,
  runOptimization,
  useOptimizeTestServices,
} from '../test-support.tsx';
import { FailedCombinationsDialog } from './FailedCombinationsDialog.tsx';

useOptimizeTestServices();

test('failed combinations carry inputs and diagnostics, export CSV, and preview in Issues', async () => {
  await loadScript(
    `${strategySource}if length == 3 and bar_index == 3\n    runtime.error("Stopped on purpose")\n`,
  );
  act(() => {
    optimization().actions.setRange('Length', { from: 2, to: 4, step: 1 });
    optimization().actions.removeFilter(1);
    optimization().actions.removeFilter(0);
    uiStore.getState().setDialogOpen('failedCombinations', true);
  });
  await runOptimization();
  expect(optimization().results?.failures).toHaveLength(3);
  expect(optimization().views?.leaderboard.passing).toBe(6);
  const user = userEvent.setup();
  renderInEnglish(
    <>
      <FailedCombinationsDialog />
      <PreviewBanner />
    </>,
  );
  const dialog = screen.getByRole('dialog', { name: '3 failed' });
  expect(within(dialog).getAllByText('Stopped on purpose')).toHaveLength(3);
  expect(within(dialog).getAllByText(/bar 4/)).toHaveLength(3);
  const create = vi.fn(() => 'blob:failed-list');
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = create;
      static revokeObjectURL = vi.fn();
    },
  );
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  await user.click(within(dialog).getByRole('button', { name: 'Export list' }));
  expect(create).toHaveBeenCalledWith(expect.any(Blob));
  expect((click.mock.instances[0] as HTMLAnchorElement).download).toBe('failed-combinations.csv');
  vi.unstubAllGlobals();
  const inputs = getBacktestStore().getState().inputs;
  await user.click(within(dialog).getAllByRole('button', { name: 'Backtest' })[0]);
  expect(uiStore.getState().openDialogs).not.toContain('failedCombinations');
  expect(uiStore.getState().dockTab).toBe('issues');
  expect(uiStore.getState().page).toBe('backtest');
  await waitFor(() => expect(getBacktestStore().getState().preview?.run.status).toBe('failed'));
  expect(getBacktestStore().getState().inputs).toBe(inputs);
});
