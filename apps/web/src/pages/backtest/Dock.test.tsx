import { act, screen, waitFor, within } from '@testing-library/react';
import { expect, test } from 'vitest';
import { getBacktestStore } from '../../state/backtest.ts';
import { uiStore } from '../../state/ui.ts';
import { Dock } from './Dock.tsx';
import { DockActions, DockActionsHost } from './dock/DockActions.tsx';
import {
  loadScript,
  renderInEnglish,
  runBacktest,
  useBacktestTestServices,
} from './states/test-support.tsx';

useBacktestTestServices();
const bar = () => screen.getByRole('tablist').parentElement!;

test('Trades counts the shown result’s closed trades (B1), and nothing without a result', async () => {
  await loadScript();
  renderInEnglish(<Dock>{null}</Dock>);
  expect(screen.getByRole('tab', { name: 'Trades' })).toBeInTheDocument();
  await runBacktest();
  const trades = getBacktestStore().getState().result!.output.trades;
  const closed = trades.filter((trade) => trade.exitBar !== null).length;
  expect(trades.length).toBe(closed + 1);
  expect(screen.getByRole('tab', { name: `Trades ${closed}` })).toBeInTheDocument();
  act(() => getBacktestStore().getState().actions.setSource('//@version=6\nplot(missing)'));
  await waitFor(() => expect(screen.getByRole('tab', { name: 'Trades' })).toBeInTheDocument());
});

test('the Pine code tab states its compile in the dock bar (B3)', async () => {
  await loadScript();
  act(() => uiStore.getState().setDockTab('code'));
  renderInEnglish(<Dock>{null}</Dock>);
  expect(await within(bar()).findByText('v6 compiled')).toBeInTheDocument();
  act(() => getBacktestStore().getState().actions.setSource('//@version=6\nplot(missing)'));
  await waitFor(() => expect(within(bar()).getByText('Compile failed')).toBeInTheDocument());
  act(() => uiStore.getState().setDockTab('report'));
  expect(within(bar()).queryByText('Compile failed')).not.toBeInTheDocument();
});

test('DockActions renders into the dock bar’s host, and nowhere without one', () => {
  const host = document.createElement('div');
  const view = renderInEnglish(
    <DockActionsHost.Provider value={host}>
      <DockActions>
        <button type="button">{host.tagName}</button>
      </DockActions>
    </DockActionsHost.Provider>,
  );
  expect(host.querySelector('button')).not.toBeNull();
  expect(view.container.querySelector('button')).toBeNull();
  view.rerender(
    <DockActionsHost.Provider value={null}>
      <DockActions>
        <button type="button">{host.tagName}</button>
      </DockActions>
    </DockActionsHost.Provider>,
  );
  expect(host.querySelector('button')).toBeNull();
});
