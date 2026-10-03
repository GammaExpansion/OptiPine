import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { message } from '@pine/messages';
import { getOptimizationStore } from '../../../../state/optimization.ts';
import { uiStore } from '../../../../state/ui.ts';
import { renderInEnglish, useOptimizeTestServices } from '../../test-support.tsx';
import { WfStability } from '../WfStability.tsx';
import { installStabilityFixture } from './fixture-store.ts';
import { stabilityFixture } from './fixture.ts';

useOptimizeTestServices();
beforeEach(() => vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null));
beforeEach(() => {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
  HTMLElement.prototype.scrollIntoView = () => {};
});
const state = () => getOptimizationStore().getState();

it('renders the six-window bands, common and fixed values, and selected column in both languages', () => {
  installStabilityFixture();
  const { container } = renderInEnglish(<WfStability />);
  expect(screen.getByText('Common 26–28')).toBeInTheDocument();
  expect(screen.getByText('Fixed at 27, mean loss 1.6%')).toBeInTheDocument();
  expect(screen.getAllByText('All near-optimal')).toHaveLength(2);
  expect(screen.getByRole('combobox', { name: 'Tolerance' })).toHaveTextContent('10%');
  expect(screen.getAllByRole('img')).toHaveLength(4);
  expect(container.querySelectorAll('circle')).toHaveLength(24);
  expect(container.querySelectorAll('g[data-selected]')).toHaveLength(4);
  expect(screen.getByText('W3')).toHaveAttribute('data-selected', 'true');
  act(() => uiStore.getState().setLanguage('zh'));
  expect(screen.getByText('共同区间 26–28')).toBeInTheDocument();
  expect(screen.getByText('固定 27，平均损失 1.6%')).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: '容差' })).toHaveTextContent('10%');
});

it('calls only the tolerance action, keeps result identity, and renders the returned stability', async () => {
  const hook = installStabilityFixture();
  const start = vi.spyOn(state().actions, 'start');
  const windows = state().walkForward!.windows;
  const map = state().walkForward!.map;
  renderInEnglish(<WfStability />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: 'Tolerance' }));
  await user.click(screen.getByRole('option', { name: '5%' }));
  expect(hook.calls).toEqual([{ action: 'tolerance', value: 0.05 }]);
  expect(screen.getByText('No common range')).toBeInTheDocument();
  expect(state().walkForward!.windows).toBe(windows);
  expect(state().walkForward!.map).toBe(map);
  expect(start).not.toHaveBeenCalled();
});

it('switches surface and window through actions, exposes hover, axes and slices without a run', async () => {
  const hook = installStabilityFixture();
  renderInEnglish(<WfStability />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('radio', { name: 'Window map' }));
  await user.click(screen.getByRole('radio', { name: '6-win mean' }));
  expect(state().walkForward!.map?.surface).toBe('mean');
  await user.click(screen.getByRole('combobox', { name: 'Window' }));
  await user.click(screen.getByRole('option', { name: 'W5' }));
  expect(state().walkForward!.selection?.window.plan.index).toBe(4);
  expect(screen.getByText(/orange is W5/)).toBeInTheDocument();
  await user.click(screen.getByRole('combobox', { name: 'X axis' }));
  await user.click(screen.getByRole('option', { name: 'Source' }));
  expect(state().walkForward!.map?.x).toBe('Source');
  await user.click(screen.getByRole('combobox', { name: 'Use trailing stop slice' }));
  await user.click(screen.getByRole('option', { name: 'off' }));
  expect(hook.calls.at(-1)).toEqual({
    action: 'slice',
    value: { title: 'Use trailing stop', slice: { mode: 'fixed', value: false, pinned: true } },
  });
  fireEvent.keyDown(screen.getByTestId('parameter-map'), { key: 'Home' });
  expect(screen.getAllByRole('status').some((element) => element.textContent?.includes('IS'))).toBe(
    true,
  );
  const current = state().walkForward!;
  act(() =>
    hook.publish({ ...current, map: { ...current.map!, panel: { ...current.map!.panel } } }),
  );
  expect(screen.queryByText(/Source close ·/)).not.toBeInTheDocument();
});

it('keeps old bands while pending and handles waiting, empty rows, missing picks and map failures', async () => {
  const fixture = stabilityFixture();
  const hook = installStabilityFixture({
    ...fixture,
    stability: { ...fixture.stability!, pending: true },
  });
  const { container } = renderInEnglish(<WfStability />);
  expect(screen.getByText('Updating stability…')).toBeInTheDocument();
  expect(screen.getByText('Common 26–28')).toBeInTheDocument();
  expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  act(() => hook.publish({ ...fixture, stability: { ...fixture.stability!, rows: [] } }));
  expect(screen.getByText('No searched inputs to compare.')).toBeInTheDocument();
  const row = {
    ...fixture.stability!.rows[0],
    common: [],
    fixed: null,
    meanLoss: null,
    bands: fixture.windows.map(() => ({ near: [], chosen: null })),
  };
  act(() => hook.publish({ ...fixture, stability: { ...fixture.stability!, rows: [row] } }));
  expect(container.querySelectorAll('circle')).toHaveLength(0);
  expect(screen.getByText('Fixed at —, mean loss —')).toBeInTheDocument();
  act(() => hook.publish({ ...fixture, inProgress: true, stability: null, map: null }));
  expect(screen.getByRole('combobox', { name: 'Tolerance' })).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent('when every window is done');
  fireEvent.click(screen.getByRole('radio', { name: 'Window map' }));
  expect(screen.getByRole('status')).toHaveTextContent('when every window is done');
  act(() => hook.publish({ ...fixture, mapError: message('optimize.wfStability.mapWaiting') }));
  expect(screen.getByRole('status')).toHaveTextContent('No window map is available yet.');
});

it('disables unavailable session actions and restores a fixture without leaking its actions', () => {
  const original = state();
  const hook = installStabilityFixture();
  hook.restore();
  expect(state().actions).toBe(original.actions);
  getOptimizationStore().setState({ walkForward: stabilityFixture() });
  renderInEnglish(<WfStability />);
  expect(screen.getByRole('combobox', { name: 'Tolerance' })).toBeDisabled();
  fireEvent.click(screen.getByRole('radio', { name: 'Window map' }));
  expect(screen.getByRole('combobox', { name: 'Window' })).toBeDisabled();
  expect(
    within(screen.getByRole('radiogroup', { name: 'Map scope' }))
      .getAllByRole('radio')
      .every((button) => button.hasAttribute('disabled')),
  ).toBe(true);
});
