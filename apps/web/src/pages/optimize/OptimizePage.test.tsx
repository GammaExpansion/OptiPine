import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { defaultPaneSizes, uiStore } from '../../state/ui.ts';
import { setViewportWidth } from '../../test/viewport.ts';
import { OptimizePage } from './OptimizePage.tsx';
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

test('on a phone W1 takes the tabs Summary, Windows and Stability, then Settings (G4)', async () => {
  const user = userEvent.setup();
  // The charts draw on canvases, which jsdom does not provide; their tests cover the drawing.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  setViewportWidth(390);
  await loadWalkForward();
  // The leaderboard's tab shows the windows, their walk-forward counterpart.
  act(() => uiStore.getState().setOptimizeTab('leaderboard'));
  renderInEnglish(<OptimizePage />);
  await runOptimization();
  const tabs = () => within(screen.getByRole('tablist', { name: 'Page sections' }));
  expect(
    tabs()
      .getAllByRole('tab')
      .map((tab) => tab.textContent),
  ).toEqual(['Summary', 'Windows', 'Stability', 'Settings']);
  expect(tabs().getByRole('tab', { name: 'Windows' })).toHaveAttribute('aria-selected', 'true');
  expect(separators()).toEqual([]);
  expect(screen.getByRole('region', { name: 'Walk-forward window results' })).toBeVisible();
  expect(screen.getByRole('region', { name: 'Fixed parameters for every window' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Select W2' }));
  expect(screen.getByRole('region', { name: 'Selected window' })).toHaveTextContent('W2');
  await user.click(tabs().getByRole('tab', { name: 'Stability' }));
  expect(screen.getByRole('region', { name: 'Walk-forward stability' })).toBeVisible();
  await user.click(tabs().getByRole('tab', { name: 'Summary' }));
  expect(screen.getByRole('region', { name: 'Stitched OOS equity' })).toBeVisible();
  // Back on R1's results, the Stability tab shows the parameter map.
  act(() => uiStore.getState().setOptimizeTab('stability'));
  act(() => optimization().actions.setValidation({ mode: 'in-out' }));
  await runOptimization();
  expect(
    tabs()
      .getAllByRole('tab')
      .map((tab) => [tab.textContent, tab.getAttribute('aria-selected')]),
  ).toEqual([
    ['Summary', 'false'],
    ['Leaderboard', 'false'],
    ['Parameter map', 'true'],
    ['Sensitivity', 'false'],
    ['Settings', 'false'],
  ]);
});
