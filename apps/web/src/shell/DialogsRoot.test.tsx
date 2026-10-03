import { act, render } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { uiStore } from '../state/ui.ts';
import { DialogsRoot } from './DialogsRoot.tsx';

test('only registered open dialogs mount and close with the UI store', () => {
  uiStore.setState({ openDialogs: [] });
  const script = vi.fn(() => null);
  const marketData = vi.fn(() => null);
  const view = render(<DialogsRoot slots={{ script, marketData }} />);
  expect(script).not.toHaveBeenCalled();
  act(() => uiStore.getState().setDialogOpen('script', true));
  expect(script).toHaveBeenCalledTimes(1);
  expect(marketData).not.toHaveBeenCalled();
  act(() => uiStore.getState().setDialogOpen('marketData', true));
  expect(marketData).toHaveBeenCalledTimes(1);
  act(() => uiStore.getState().setDialogOpen('script', false));
  const calls = script.mock.calls.length;
  act(() => uiStore.getState().setDialogOpen('properties', true));
  expect(script).toHaveBeenCalledTimes(calls);
  view.unmount();
  uiStore.setState({ openDialogs: [] });
});
