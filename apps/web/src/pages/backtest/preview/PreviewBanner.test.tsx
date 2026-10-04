import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { getBacktestStore } from '../../../state/backtest.ts';
import { uiStore, useUiStore } from '../../../state/ui.ts';
import { SelectionBar } from '../../optimize/selection/SelectionBar.tsx';
import { FixedParameters } from '../../optimize/walkforward/FixedParameters.tsx';
import { WfSelectionBar } from '../../optimize/walkforward/WfSelectionBar.tsx';
import {
  loadOptimization,
  loadWalkForward,
  optimization,
  renderInEnglish,
  runOptimization,
  useOptimizeTestServices,
} from '../../optimize/test-support.tsx';
import { loadScript, runBacktest, failingSource } from '../states/test-support.tsx';
import { PreviewBanner } from './PreviewBanner.tsx';

useOptimizeTestServices();
const backtest = () => getBacktestStore().getState();

function Pages() {
  const page = useUiStore((state) => state.page);
  return page === 'optimize' ? <SelectionBar /> : <PreviewBanner />;
}

async function results() {
  await loadOptimization();
  await runBacktest();
  act(() => {
    optimization().actions.removeFilter(1);
    optimization().actions.removeFilter(0);
  });
  await runOptimization();
}

test('preview leaves inputs and result intact, Back restores Optimize, Apply and Undo restore the original run', async () => {
  await results();
  const user = userEvent.setup();
  const beforeInputs = backtest().inputs;
  const beforeResult = backtest().result;
  renderInEnglish(<Pages />);
  expect(screen.getByRole('region', { name: 'Selected parameter set' })).toHaveTextContent(
    'Neighbourhood mean',
  );
  await user.click(screen.getByRole('button', { name: 'View backtest' }));
  await waitFor(() => expect(backtest().preview?.run.status).toBe('done'));
  expect(await screen.findByText('Current inputs are unchanged.')).toBeVisible();
  expect(backtest().inputs).toBe(beforeInputs);
  expect(backtest().result).toBe(beforeResult);
  await user.click(screen.getByRole('button', { name: 'Back to optimization' }));
  expect(backtest().preview).toBeNull();
  expect(uiStore.getState().page).toBe('optimize');
  await user.click(screen.getByRole('button', { name: 'Apply to inputs' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeVisible());
  expect(uiStore.getState().page).toBe('backtest');
  expect(backtest().inputs.find((field) => field.descriptor.title === 'Length')?.origin?.kind).toBe(
    'rank',
  );
  expect(screen.getByText('Applied the parameters of #1 and re-ran the backtest')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Undo' }));
  expect(backtest().inputs).toBe(beforeInputs);
  expect(backtest().result).toBe(beforeResult);
  expect(backtest().applied).toBeNull();
  expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
});

test('setting a completed preview as current reuses its result and the toast can be dismissed', async () => {
  await results();
  const user = userEvent.setup();
  renderInEnglish(<Pages />);
  await user.click(screen.getByRole('button', { name: 'View backtest' }));
  await waitFor(() => expect(backtest().preview?.run.status).toBe('done'));
  const previewResult = backtest().preview!.result;
  await user.click(screen.getByRole('button', { name: 'Set as current inputs' }));
  expect(backtest().result).toBe(previewResult);
  expect(screen.queryByText('Current inputs are unchanged.')).toBeNull();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
});

test('editing inputs invalidates the old Undo action and Chinese preview copy names the set', async () => {
  await results();
  act(() => uiStore.getState().setLanguage('zh'));
  const user = userEvent.setup();
  renderInEnglish(<Pages />);
  await user.click(screen.getByRole('button', { name: '查看这组参数的回测' }));
  expect(screen.getByText('正在预览优化结果 #1 的参数')).toBeVisible();
  await user.click(screen.getByRole('button', { name: '设为当前参数' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '撤销' })).toBeVisible());
  act(() => backtest().actions.setInput('Length', 7));
  expect(screen.queryByRole('button', { name: '撤销' })).toBeNull();
});

test('an applied set that fails still offers Undo to restore the prior inputs', async () => {
  await loadScript(failingSource);
  const inputs = backtest().inputs;
  await act(() =>
    backtest().actions.applyParameters(
      { Length: 2 },
      {
        kind: 'rank',
        optimizationId: 1,
        trialId: 'failed',
        rank: 1,
      },
    ),
  );
  expect(backtest().run.status).toBe('failed');
  renderInEnglish(<PreviewBanner />);
  expect(screen.getByText('Applied the parameters of #1; the backtest failed')).toBeVisible();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Undo' }));
  expect(backtest().inputs).toBe(inputs);
  expect(backtest().run.status).toBe('idle');
});

function WalkForwardPages() {
  const page = useUiStore((state) => state.page);
  return page === 'optimize' ? (
    <>
      <FixedParameters />
      <WfSelectionBar />
    </>
  ) : (
    <PreviewBanner />
  );
}

test('a walk-forward window previews as Wn and the fixed set applies by name (B16, B17)', async () => {
  await loadWalkForward();
  await runOptimization();
  const user = userEvent.setup();
  renderInEnglish(<WalkForwardPages />);
  const window = optimization().walkForward!.selection!.window;
  const name = `W${window.plan.index + 1}`;
  await user.click(screen.getByRole('button', { name: 'View backtest' }));
  expect(uiStore.getState().dockTab).toBe('report');
  expect(
    await screen.findByText(`Previewing the parameters of optimization result ${name}`),
  ).toBeVisible();
  // The searched inputs only, in declaration order: Length, then Source.
  expect(
    screen.getByText(`Length ${window.parameters!.Length}, ${window.parameters!.Source}`),
  ).toBeVisible();
  expect(backtest().preview?.origin).toMatchObject({ kind: 'window', window: window.plan.index });
  act(() => uiStore.getState().setLanguage('zh'));
  expect(screen.getByText(`正在预览优化结果 ${name} 的参数`)).toBeVisible();
  act(() => uiStore.getState().setLanguage('en'));
  await user.click(screen.getByRole('button', { name: 'Back to optimization' }));
  await user.click(await screen.findByRole('button', { name: 'Apply to inputs' }));
  await waitFor(() =>
    expect(
      screen.getByText('Applied the parameters of fixed set and re-ran the backtest'),
    ).toBeVisible(),
  );
  expect(backtest().inputs.find((field) => field.descriptor.title === 'Length')?.origin?.kind).toBe(
    'fixed',
  );
});
