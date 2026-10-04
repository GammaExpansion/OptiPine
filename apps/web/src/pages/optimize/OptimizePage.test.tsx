import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { defaultPaneSizes, uiStore } from '../../state/ui.ts';
import { setViewportWidth } from '../../test/viewport.ts';
import { OptimizePage } from './OptimizePage.tsx';
import { installResultsFixture } from './walkforward/results/fixture-store.ts';
import {
  loadOptimization,
  loadWalkForward,
  optimization,
  renderInEnglish,
  runOptimization,
  useOptimizeTestServices,
} from './test-support.tsx';

useOptimizeTestServices();

const separators = () =>
  screen.queryAllByRole('separator').map((separator) => separator.getAttribute('aria-label'));

test('before a run the results area explains what will appear there (O1)', async () => {
  await loadOptimization();
  renderInEnglish(<OptimizePage />);
  expect(screen.getByRole('heading', { name: 'No optimization has run yet' })).toBeVisible();
  expect(separators()).toEqual(['Resize right panel']);
});

test('results lay out R1 in remembered splits, and dim when settings change (R5)', async () => {
  await loadOptimization();
  uiStore.getState().setPaneSizes('optimize', { summary: 300 });
  renderInEnglish(<OptimizePage />);
  await runOptimization();
  expect(screen.queryByRole('heading', { name: 'No optimization has run yet' })).toBeNull();
  expect(separators()).toEqual([
    'Resize summary and results',
    'Resize leaderboard and parameter map',
    'Resize parameter map and sensitivity',
    'Resize right panel',
  ]);
  expect(document.getElementById('optimize-summary')).toBeInTheDocument();
  const results = document.querySelector('[data-results]')!;
  expect(results).not.toHaveAttribute('data-outdated');
  act(() => optimization().actions.setRange('Length', { to: 5 }));
  expect(results).toHaveAttribute('data-outdated');
  fireEvent.doubleClick(screen.getByRole('separator', { name: 'Resize summary and results' }));
  expect(uiStore.getState().paneSizes.optimize.summary).toBe(defaultPaneSizes.summary);
});

test('G4 keeps the chosen summary view above four tabs and restores the selected cards', async () => {
  setViewportWidth(390);
  await loadOptimization();
  act(() => {
    optimization().actions.removeFilter(1);
    optimization().actions.removeFilter(0);
  });
  await runOptimization();
  renderInEnglish(<OptimizePage />);
  expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
    'Leaderboard',
    'Parameter map',
    'Sensitivity',
    'Settings',
  ]);
  expect(separators()).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: 'Select set #2' }));
  fireEvent.click(screen.getByRole('radio', { name: 'Distribution' }));
  const chart = screen.getByRole('img', { name: 'Distribution' });
  act(() => uiStore.getState().setOptimizeTab('settings'));
  expect(screen.getByRole('region', { name: 'Optimization run' })).toBeVisible();
  expect(screen.getByRole('img', { name: 'Distribution' })).toBe(chart);
  expect(screen.getByRole('button', { name: 'View backtest' })).toBeVisible();
  act(() => uiStore.getState().setOptimizeTab('leaderboard'));
  expect(screen.getByRole('button', { name: 'Select set #2' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  act(() => optimization().actions.setRange('Length', { to: 5 }));
  expect(chart.closest('[data-results]')).toHaveAttribute('data-outdated');
});

test('walk-forward results lay out W1 and stay so, dimmed, when validation changes (R5)', async () => {
  await loadWalkForward();
  renderInEnglish(<OptimizePage />);
  await runOptimization();
  expect(optimization().walkForward?.windows.map((row) => row.status)).toHaveLength(4);
  expect(separators()).toEqual([
    'Resize stitched equity and windows',
    'Resize window table and stability',
    'Resize right panel',
  ]);
  expect(document.getElementById('optimize-wfSummary')).toBeInTheDocument();
  const results = document.querySelector('[data-results]')!;
  expect(results).not.toHaveAttribute('data-outdated');
  act(() => optimization().actions.setValidation({ mode: 'in-out' }));
  expect(results).toHaveAttribute('data-outdated');
  expect(document.getElementById('optimize-wfSummary')).toBeInTheDocument();
  fireEvent.doubleClick(
    screen.getByRole('separator', { name: 'Resize stitched equity and windows' }),
  );
  expect(uiStore.getState().paneSizes.optimize.wfSummary).toBe(defaultPaneSizes.wfSummary);
});

test('on a tablet W1 keeps its splits, with the right panel left to the drawer (G2)', async () => {
  setViewportWidth(1024);
  await loadWalkForward();
  renderInEnglish(<OptimizePage />);
  await runOptimization();
  expect(separators()).toEqual([
    'Resize stitched equity and windows',
    'Resize window table and stability',
  ]);
  expect(screen.getByRole('region', { name: 'Walk-forward window results' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Walk-forward stability' })).toBeInTheDocument();
});

// A layout test: one small IS / OOS run supplies R1, and the walk-forward fixture W1, so no
// walk-forward runs on Workers here (the walk-forward tests above and the e2e do that).
test('on a phone W1 keeps its stitched equity above Windows, Stability and Settings (G4)', async () => {
  const user = userEvent.setup();
  // The charts draw on canvases, which jsdom does not provide; their tests cover the drawing.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  setViewportWidth(390);
  await loadOptimization();
  // Two sets, and no default filters, so R1 has a selected set to show at the least cost.
  act(() => {
    optimization().actions.setRange('Length', { from: 2, to: 3, step: 1 });
    optimization().actions.setSearched('Source', false);
    optimization().actions.removeFilter(1);
    optimization().actions.removeFilter(0);
  });
  await runOptimization();
  // Nothing of the run may publish over the fixture: its views and Top 20 curves come first.
  await waitFor(() => {
    expect(optimization().views?.pending).toBe(false);
    expect(optimization().topEquity.status).toBe('ready');
  });
  // The leaderboard's tab shows the windows, their walk-forward counterpart.
  act(() => uiStore.getState().setOptimizeTab('leaderboard'));
  let fixture!: ReturnType<typeof installResultsFixture>;
  act(() => {
    fixture = installResultsFixture();
  });
  renderInEnglish(<OptimizePage />);
  const tabs = () => within(screen.getByRole('tablist', { name: 'Page sections' }));
  expect(
    tabs()
      .getAllByRole('tab')
      .map((tab) => tab.textContent),
  ).toEqual(['Windows', 'Stability', 'Settings']);
  expect(tabs().getByRole('tab', { name: 'Windows' })).toHaveAttribute('aria-selected', 'true');
  expect(separators()).toEqual([]);
  const summary = screen.getByRole('region', { name: 'Stitched OOS equity' });
  expect(screen.getByRole('heading', { level: 1, name: 'Optimize' })).toBeInTheDocument();
  const table = screen.getByRole('region', { name: 'Walk-forward window results' });
  expect(table).toBeVisible();
  expect(screen.getByRole('region', { name: 'Fixed parameters for every window' })).toBeVisible();
  await user.click(within(table).getByRole('button', { name: 'Select W2' }));
  expect(screen.getByRole('region', { name: 'Selected window' })).toHaveTextContent('W2');
  await user.click(tabs().getByRole('tab', { name: 'Stability' }));
  expect(screen.getByRole('region', { name: 'Walk-forward stability' })).toBeVisible();
  await user.click(tabs().getByRole('tab', { name: 'Settings' }));
  expect(screen.getByRole('region', { name: 'Optimization run' })).toBeVisible();
  // The summary stays mounted above whichever tab is open.
  expect(screen.getByRole('region', { name: 'Stitched OOS equity' })).toBe(summary);
  // Back on R1's results, the Stability tab shows the parameter map under R1's summary.
  act(() => uiStore.getState().setOptimizeTab('stability'));
  act(() => fixture.restore());
  expect(
    tabs()
      .getAllByRole('tab')
      .map((tab) => [tab.textContent, tab.getAttribute('aria-selected')]),
  ).toEqual([
    ['Leaderboard', 'false'],
    ['Parameter map', 'true'],
    ['Sensitivity', 'false'],
    ['Settings', 'false'],
  ]);
  expect(screen.queryByRole('region', { name: 'Stitched OOS equity' })).toBeNull();
  expect(screen.getByRole('region', { name: 'Selected parameter set' })).toBeVisible();
});
