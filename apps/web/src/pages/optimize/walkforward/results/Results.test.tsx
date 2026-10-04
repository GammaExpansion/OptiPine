import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { message } from '@pine/messages';
import { getOptimizationStore } from '../../../../state/optimization.ts';
import { getBacktestStore } from '../../../../state/backtest.ts';
import { uiStore } from '../../../../state/ui.ts';
import { setViewportWidth } from '../../../../test/viewport.ts';
import { renderInEnglish, useOptimizeTestServices } from '../../test-support.tsx';
import { FixedParameters } from '../FixedParameters.tsx';
import { WfSelectionBar } from '../WfSelectionBar.tsx';
import { WfSummary } from '../WfSummary.tsx';
import { WfTable } from '../WfTable.tsx';
import { installResultsFixture } from './fixture-store.ts';
import { resultsFixture } from './fixture.ts';

useOptimizeTestServices();
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
  HTMLElement.prototype.scrollIntoView = () => {};
});
const state = () => getOptimizationStore().getState();
const panels = () =>
  renderInEnglish(
    <>
      <WfSummary />
      <WfTable />
      <FixedParameters />
      <WfSelectionBar />
    </>,
  );

it('renders W1 totals and fixed parameters in both languages, switching W2 without changing results', () => {
  installResultsFixture();
  const view = state().walkForward;
  panels();
  const summary = screen.getByRole('region', { name: 'Stitched OOS equity' });
  expect(within(summary).getByText('+7,600')).toBeInTheDocument();
  expect(within(summary).getByText('5 / 6')).toBeInTheDocument();
  expect(screen.getByText('5 / 6 profitable')).toBeInTheDocument();
  expect(screen.getByText('Part')).toBeInTheDocument();
  expect(
    screen.getByRole('region', { name: 'Fixed parameters for every window' }),
  ).toHaveTextContent('Length27Multiplier2.00SourcecloseUse trailing stopoff');
  fireEvent.click(screen.getByRole('radio', { name: 'Per window' }));
  expect(screen.getByRole('img', { name: '6 windows with IS and OOS equity' })).toBeInTheDocument();
  expect(state().walkForward).toBe(view);
  act(() => uiStore.getState().setLanguage('zh'));
  expect(screen.getByRole('button', { name: '应用到输入' })).toBeEnabled();
  expect(screen.getByText('5 / 6 盈利')).toBeInTheDocument();
  // Searched inputs in declaration order, at their search steps' precision.
  expect(screen.getByRole('region', { name: '选定窗口' })).toHaveTextContent('26，2.25，close，关');
});

it('selects through rows and lanes, and delegates preview/apply without mutating Backtest', async () => {
  const hook = installResultsFixture();
  const backtest = getBacktestStore().getState();
  panels();
  const table = screen.getByRole('region', { name: 'Walk-forward window results' });
  fireEvent.click(within(table).getByText('24-10-01 → 12-31'));
  expect(state().walkForward?.selection?.window.plan.index).toBe(3);
  expect(screen.getByRole('region', { name: 'Selected window' })).toHaveTextContent('+2,980');
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'View backtest' }));
  await user.click(screen.getByRole('button', { name: 'Apply to inputs' }));
  expect(uiStore.getState().page).toBe('backtest');
  expect(hook.calls.slice(0, 3)).toEqual([
    { action: 'selectWindow', value: 3 },
    { action: 'selectWindow', value: 3 },
    { action: 'previewWindow', value: 3 },
  ]);
  expect(hook.calls.at(-1)).toEqual({
    action: 'applyFixedParameters',
    value: state().walkForward?.fixed,
  });
  const lane = within(screen.getByRole('region', { name: 'Stitched OOS equity' })).getByRole(
    'button',
    { name: 'Select W6' },
  );
  lane.focus();
  await user.keyboard('{Enter}');
  expect(state().walkForward?.selection?.window.plan.index).toBe(5);
  expect(state().walkForward?.selection?.origin).toMatchObject({ kind: 'window', window: 5 });
  expect(getBacktestStore().getState()).toBe(backtest);
});

it('delegates ranking and filter changes and uses the shared condition trigger', async () => {
  const hook = installResultsFixture();
  const windows = state().walkForward?.windows;
  panels();
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: 'Ranking objective' }));
  await user.click(screen.getByRole('option', { name: 'Sharpe ratio' }));
  expect(hook.calls[0]).toEqual({ action: 'setObjective', value: 'sharpeRatio' });
  await user.click(screen.getByRole('button', { name: /Ranking direction/ }));
  expect(state().viewSettings.direction).toBe('minimize');
  await user.click(screen.getByRole('button', { name: /Remove.*Trades/ }));
  expect(hook.calls.at(-1)).toEqual({ action: 'removeFilter', value: 0 });
  await user.click(screen.getByRole('button', { name: '+ Condition' }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  await user.keyboard('{Escape}');
  expect(hook.calls.at(-1)).toEqual({ action: 'setDraftFilter', value: null });
  expect(state().walkForward?.windows).toBe(windows);
});

it('keeps live finished windows visible, withholds final totals and fixed set, then fills W1', () => {
  const hook = installResultsFixture(resultsFixture('live'));
  panels();
  expect(screen.getByText('2 / 6 windows done')).toBeInTheDocument();
  expect(screen.getByText('Totals appear when every window is done')).toBeInTheDocument();
  expect(screen.getByText('+2,310')).toBeInTheDocument();
  expect(screen.queryByText('+3,430')).not.toBeInTheDocument();
  expect(screen.getAllByText('Waiting')).toHaveLength(3);
  expect(screen.getByText('Optimizing…')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Apply to inputs' })).not.toBeInTheDocument();
  act(() => state().actions.selectWindow(5));
  expect(screen.getByRole('button', { name: 'View backtest' })).toBeDisabled();
  act(() => state().actions.selectWindow(null));
  expect(state().walkForward?.selection).toMatchObject({
    explicit: false,
    window: { plan: { index: 1 } },
  });
  expect(screen.getByRole('button', { name: 'View backtest' })).toBeEnabled();
  act(() => hook.publish(resultsFixture()));
  expect(screen.getAllByText('+7,600')).toHaveLength(2);
  expect(screen.getByRole('button', { name: 'Apply to inputs' })).toBeEnabled();
});

it('shows flat and partial windows, Adjust focuses ranking, and failed windows cannot preview', () => {
  const hook = installResultsFixture(resultsFixture('flat'));
  panels();
  expect(screen.getByText('4 / 5 profitable, 1 flat')).toBeInTheDocument();
  expect(screen.getByText('No combination passes; window stays flat')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Adjust' }));
  expect(screen.getByRole('combobox', { name: 'Ranking objective' })).toHaveFocus();
  expect(screen.getByRole('button', { name: 'View backtest' })).toBeDisabled();
  const current = state().walkForward!;
  const failed = {
    ...current.windows[3],
    status: 'failed' as const,
    error: message('optimize.wfResults.status.failed'),
  };
  act(() =>
    hook.publish({
      ...current,
      windows: current.windows.map((window, at) => (at === 3 ? failed : window)),
      selection: { window: failed, origin: null, explicit: true },
    }),
  );
  expect(screen.getAllByText('Window failed').length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: 'View backtest' })).toBeDisabled();
});

it('retains pending data but disables preview/apply, then restores the real session actions', () => {
  const original = state();
  const fixture = resultsFixture();
  const hook = installResultsFixture({ ...fixture, pending: true });
  const { unmount } = panels();
  expect(screen.getAllByText('+7,600')).toHaveLength(2);
  expect(screen.getByRole('button', { name: 'View backtest' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Apply to inputs' })).toBeDisabled();
  unmount();
  hook.restore();
  expect(state().actions).toBe(original.actions);
  getOptimizationStore().setState({ walkForward: fixture });
  panels();
  expect(screen.getByRole('button', { name: 'View backtest' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Apply to inputs' })).toBeEnabled();
  expect(
    screen
      .getAllByRole('button', { name: 'Select W1' })
      .every((button) => !button.hasAttribute('disabled')),
  ).toBe(true);
});

it('renders no result slots for the absent workflow view', () => {
  const { container } = panels();
  expect(container).toBeEmptyDOMElement();
});

it('labels anchored IS and exposes analysis failures without hiding the retained results', () => {
  const fixture = resultsFixture();
  installResultsFixture({ ...fixture, error: message('optimize.wfResults.status.failed') });
  getOptimizationStore().setState({
    validation: {
      ...state().validation,
      walkForward: { ...state().validation.walkForward, anchored: true },
    },
  });
  panels();
  expect(screen.getByText('IS (anchored)')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Window failed');
  expect(screen.getAllByText('+7,600')).toHaveLength(2);
});

it('lists the windows as cards on a phone, every figure in view, with the totals last (#10)', () => {
  setViewportWidth(390);
  const hook = installResultsFixture(resultsFixture('flat'));
  panels();
  const cards = screen.getByRole('region', { name: 'Walk-forward window results' });
  expect(within(cards).queryByRole('table')).toBeNull();
  expect(within(cards).getByRole('button', { name: 'Select W1' })).toHaveAccessibleDescription(
    /IS\s*\+9,840\s*OOS\s*\+2,310\s*WFE\s*0\.94\s*Trades\s*41/,
  );
  expect(within(cards).getByRole('button', { name: 'Select W6' })).toHaveTextContent('Part');
  expect(within(cards).getByRole('button', { name: 'Select W4' })).toHaveTextContent(
    'No combination passes; window stays flat',
  );
  expect(within(cards).getByText('4 / 5 profitable, 1 flat')).toBeInTheDocument();
  fireEvent.click(within(cards).getByRole('button', { name: 'Select W2' }));
  expect(hook.calls.at(-1)).toEqual({ action: 'selectWindow', value: 1 });
  fireEvent.click(within(cards).getByRole('button', { name: 'Adjust' }));
  expect(hook.calls.at(-1)).toEqual({ action: 'selectWindow', value: 3 });
  expect(screen.getByRole('combobox', { name: 'Ranking objective' })).toHaveFocus();
});
