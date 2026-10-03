import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { getOptimizationStore } from '../../../state/optimization.ts';
import { uiStore } from '../../../state/ui.ts';
import {
  loadOptimization,
  optimization,
  renderInEnglish,
  runOptimization,
  useOptimizeTestServices,
} from '../test-support.tsx';
import { SummaryPanel } from './SummaryPanel.tsx';
import { selectScatterRank } from './SummaryCanvas.tsx';

useOptimizeTestServices();

async function results() {
  await loadOptimization();
  act(() => {
    optimization().actions.removeFilter(1);
    optimization().actions.removeFilter(0);
  });
  await runOptimization();
  await waitFor(() => expect(optimization().topEquity.status).toBe('ready'));
}

test('switches reproduced equity, scatter and distribution without rerunning', async () => {
  await results();
  const user = userEvent.setup();
  renderInEnglish(<SummaryPanel />);
  expect(screen.getByRole('img', { name: 'Top 20 equity' })).toBeVisible();
  expect(optimization().topEquity.curves).toHaveLength(9);
  await user.click(screen.getByRole('radio', { name: 'IS vs OOS' }));
  const scatter = screen.getByRole('img', { name: 'IS vs OOS' });
  expect(scatter).toBeVisible();
  scatter.focus();
  await user.keyboard('{ArrowRight}{ArrowRight}{Enter}');
  await waitFor(() => expect(optimization().views?.selection?.row.rank).toBe(2));
  await user.click(screen.getByRole('radio', { name: 'Distribution' }));
  expect(
    screen.getByRole('img', { name: 'Distribution' }).querySelectorAll('rect').length,
  ).toBeGreaterThan(0);
  expect(screen.getByText(/IS \(\d+ profitable\)/)).toBeVisible();
  expect(screen.getByText(/OOS \(\d+ profitable\)/)).toBeVisible();
  expect(optimization().results!.id).toBe(1);
});

test('None marks results unvalidated and disables the comparison view in both languages', async () => {
  await loadOptimization();
  act(() => {
    optimization().actions.setValidation({ mode: 'none' });
    optimization().actions.removeFilter(1);
    optimization().actions.removeFilter(0);
  });
  await runOptimization();
  renderInEnglish(<SummaryPanel />);
  expect(screen.getByText('Unvalidated')).toBeVisible();
  expect(screen.getByRole('radio', { name: 'IS vs OOS' })).toBeDisabled();
  expect(screen.getByText('Top 20 (full-range net profit)')).toBeVisible();
  act(() => uiStore.getState().setLanguage('zh'));
  expect(screen.getByText('未验证')).toBeVisible();
});

test('live snapshots are explicitly provisional; reproduction and errors remain visible', async () => {
  await results();
  const store = getOptimizationStore();
  const original = store.getState();
  act(() =>
    store.setState({
      run: {
        status: 'running',
        startedAt: 0,
        progress: {
          phase: 'in',
          completed: 3,
          total: 18,
          combinations: 9,
          failed: 0,
          elapsedMs: 1,
          remainingMs: null,
          workers: 2,
        },
      },
    }),
  );
  renderInEnglish(<SummaryPanel />);
  expect(screen.getByText(/In progress/)).toBeVisible();
  expect(screen.getByText('Equity curves will appear when the run finishes.')).toBeVisible();
  expect(screen.queryByRole('img', { name: 'Top 20 equity' })).toBeNull();
  act(() =>
    store.setState({
      run: original.run,
      topEquity: { ...original.topEquity, status: 'running', curves: [] },
    }),
  );
  expect(screen.getByRole('progressbar', { name: 'Top 20 equity' })).not.toHaveAttribute(
    'aria-valuenow',
  );
  act(() =>
    store.setState({
      topEquity: {
        ...original.topEquity,
        curves: [{ trialId: 'bad', rank: 1, equity: null, error: 'Reproduction failed' }],
      },
    }),
  );
  expect(screen.getByText('1 equity reproductions failed')).toBeVisible();
});

test('scatter resolves ranks on another leaderboard page through store actions', async () => {
  await loadOptimization();
  act(() => {
    optimization().actions.setRange('Length', { from: 2, to: 7, step: 1 });
    optimization().actions.removeFilter(1);
    optimization().actions.removeFilter(0);
  });
  await runOptimization();
  act(() => selectScatterRank(15));
  await waitFor(() => expect(optimization().views?.selection?.row.rank).toBe(15));
  expect(optimization().viewSettings.page).toBe(1);
  act(() => selectScatterRank(0));
  expect(optimization().viewSettings.page).toBe(1);
});
