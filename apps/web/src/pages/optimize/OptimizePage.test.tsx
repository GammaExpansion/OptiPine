import { act, fireEvent, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
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
