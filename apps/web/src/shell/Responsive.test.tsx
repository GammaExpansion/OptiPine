import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nProvider.tsx';
import { loadScript, useBacktestTestServices } from '../pages/backtest/states/test-support.tsx';
import { loadOptimization } from '../pages/optimize/test-support.tsx';
import { uiStore } from '../state/ui.ts';
import { setViewportWidth } from '../test/viewport.ts';
import { Shell } from './Shell.tsx';

// The layouts place the chart area; what it draws has tests of its own, in a real browser too.
vi.mock('../pages/backtest/ChartArea.tsx', () => ({ ChartArea: () => null }));

useBacktestTestServices();

function renderShell() {
  return render(
    <I18nProvider>
      <Shell />
    </I18nProvider>,
  );
}

test('a tablet opens the right panel as a drawer that traps the focus and gives it back (G2)', async () => {
  const user = userEvent.setup();
  setViewportWidth(1024);
  await loadScript();
  renderShell();
  expect(screen.queryByRole('complementary', { name: 'Right panel' })).toBeNull();
  expect(screen.queryByRole('separator', { name: 'Resize right panel' })).toBeNull();
  const toggle = screen.getByRole('button', { name: 'Right panel' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');

  await user.click(toggle);
  const drawer = await screen.findByRole('dialog', { name: 'Right panel' });
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(within(drawer).getByRole('spinbutton', { name: 'Length' })).toBeVisible();
  expect(drawer).toContainElement(document.activeElement as HTMLElement);
  for (let step = 0; step < 12; step++) {
    await user.tab();
    expect(drawer).toContainElement(document.activeElement as HTMLElement);
  }
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(toggle).toHaveFocus();

  // A press outside closes it too.
  await user.click(toggle);
  await screen.findByRole('dialog', { name: 'Right panel' });
  // The modal drawer hides the rest of the page from assistive technology while it is open.
  fireEvent.pointerDown(screen.getByRole('tab', { name: 'Report', hidden: true }));
  expect(screen.queryByRole('dialog')).toBeNull();
  // Switching pages leaves the drawer behind.
  act(() => uiStore.getState().setDrawerOpen(true));
  act(() => uiStore.getState().setPage('optimize'));
  expect(uiStore.getState().drawerOpen).toBe(false);
});

test('the right panel follows the window from the desktop panes into the drawer and back', async () => {
  setViewportWidth(1440);
  await loadScript();
  renderShell();
  expect(screen.getByRole('complementary', { name: 'Right panel' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Right panel' })).toBeNull();
  expect(screen.getByText('OptiPine')).toBeInTheDocument();
  act(() => setViewportWidth(900));
  expect(screen.queryByRole('complementary', { name: 'Right panel' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Right panel' })).toBeInTheDocument();
  expect(screen.queryByText('OptiPine')).toBeNull();
  act(() => setViewportWidth(1280));
  expect(screen.getByRole('complementary', { name: 'Right panel' })).toBeInTheDocument();
});

test('a phone shows the Backtest page in one column with an Inputs tab (G3)', async () => {
  const user = userEvent.setup();
  setViewportWidth(390);
  await loadScript();
  renderShell();
  expect(screen.queryAllByRole('separator')).toEqual([]);
  expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument();
  const tabs = screen.getByRole('tablist', { name: 'Backtest results' });
  expect(
    within(tabs)
      .getAllByRole('tab')
      .map((tab) => tab.textContent),
  ).toEqual(['Report', 'Equity', 'Trades', 'Inputs', 'Code', 'Issues0']);
  await user.click(within(tabs).getByRole('tab', { name: 'Inputs' }));
  expect(uiStore.getState().dockTab).toBe('inputs');
  expect(screen.getByRole('spinbutton', { name: 'Length' })).toBeVisible();
  // The timeframe is the phone's own picker; CSV data keeps its timeframe.
  expect(screen.getByRole('combobox', { name: 'Timeframe' })).toBeDisabled();
});

test('a phone shows the Optimize page as tabs, the setup under Settings (G4)', async () => {
  const user = userEvent.setup();
  setViewportWidth(390);
  await loadOptimization();
  act(() => uiStore.setState({ page: 'optimize' }));
  renderShell();
  const tabs = await screen.findByRole('tablist', { name: 'Page sections' });
  expect(
    within(tabs)
      .getAllByRole('tab')
      .map((tab) => tab.textContent),
  ).toEqual(['Leaderboard', 'Parameter map', 'Sensitivity', 'Settings']);
  expect(screen.getByRole('heading', { name: 'No optimization has run yet' })).toBeVisible();
  expect(screen.getByText(/under Settings/)).toBeVisible();
  await user.click(within(tabs).getByRole('tab', { name: 'Settings' }));
  expect(uiStore.getState().optimizeTab).toBe('settings');
  expect(screen.getByRole('region', { name: 'Optimization run' })).toBeVisible();
  expect(screen.getByText('Search ranges')).toBeVisible();
});
