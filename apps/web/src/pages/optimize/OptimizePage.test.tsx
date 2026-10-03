import { act, fireEvent, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { setViewportWidth } from '../../test/viewport.ts';
import { defaultPaneSizes, uiStore } from '../../state/ui.ts';
import { OptimizePage } from './OptimizePage.tsx';
import {
  loadOptimization,
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
