import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { getOptimizationStore } from '../../../state/optimization.ts';
import { uiStore } from '../../../state/ui.ts';
import { AddConditionTrigger } from '../filters/AddConditionTrigger.tsx';
import {
  loadOptimization,
  optimization,
  renderInEnglish,
  runOptimization,
  useOptimizeTestServices,
} from '../test-support.tsx';
import { LeaderboardPanel } from './LeaderboardPanel.tsx';

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

test('shows nine ranked rows; adding a draft previews without changing the ranking, then R9 recovers', async () => {
  await results();
  const user = userEvent.setup();
  renderInEnglish(<LeaderboardPanel />);
  expect(screen.getByText('9 / 9 pass')).toBeVisible();
  const resultId = optimization().results!.id;
  await user.click(screen.getByRole('button', { name: '+ Condition' }));
  const popover = screen.getByRole('dialog', { name: 'Add condition' });
  const input = within(popover).getByRole('spinbutton', { name: 'Value' });
  await user.clear(input);
  await user.type(input, '999999');
  await waitFor(() =>
    expect(within(popover).getByText('Would exclude 9 more sets.')).toBeVisible(),
  );
  expect(screen.getByText('9 / 9 pass')).toBeVisible();
  expect(optimization().viewSettings.filters).toHaveLength(0);
  await user.click(within(popover).getByRole('button', { name: 'Add' }));
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'No combination passes' })).toBeVisible(),
  );
  expect(screen.getByText('0 pass this condition alone')).toBeVisible();
  expect(screen.getByText(/Best reached:/)).toBeVisible();
  expect(optimization().viewSettings.draft).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Remove' }));
  await waitFor(() => expect(screen.getByText('9 / 9 pass')).toBeVisible());
  expect(optimization().results!.id).toBe(resultId);
});

test('invalid drafts cannot be added; presets work before any results and cancel clears them', async () => {
  const user = userEvent.setup();
  renderInEnglish(<AddConditionTrigger />);
  await user.click(screen.getByRole('button', { name: '+ Condition' }));
  await user.clear(screen.getByRole('spinbutton', { name: 'Value' }));
  expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Consecutive losses ≤ 6' }));
  expect(optimization().viewSettings.draft).toEqual({
    metric: 'consecutiveLosses',
    operator: '<=',
    value: 6,
  });
  await user.click(screen.getByRole('button', { name: 'Add' }));
  expect(optimization().viewSettings.filters.at(-1)?.metric).toBe('consecutiveLosses');
  await user.click(screen.getByRole('button', { name: '+ Condition' }));
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(optimization().viewSettings.draft).toBeNull();
});

test('13-row pages select the correct set; changing filters clamps pagination', async () => {
  await loadOptimization();
  act(() => {
    optimization().actions.removeFilter(1);
    optimization().actions.removeFilter(0);
    optimization().actions.setRange('Length', { from: 2, to: 7, step: 1 });
  });
  await runOptimization();
  const user = userEvent.setup();
  renderInEnglish(<LeaderboardPanel />);
  expect(screen.getByRole('table')).toBeVisible();
  expect(screen.getAllByRole('button', { name: /Select set/ })).toHaveLength(13);
  await user.click(screen.getByRole('button', { name: 'Next page' }));
  expect(screen.getAllByRole('button', { name: /Select set/ })).toHaveLength(5);
  await user.click(screen.getByRole('button', { name: 'Select set #14' }));
  await waitFor(() => expect(optimization().views?.selection?.row.rank).toBe(14));
  expect(screen.getByRole('button', { name: 'Select set #14' }).closest('tr')).toHaveAttribute(
    'data-selected',
    'true',
  );
  act(() => optimization().actions.addFilter({ metric: 'trades', operator: '>=', value: 10000 }));
  await waitFor(() => expect(optimization().views?.leaderboard.passing).toBe(0));
  expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
});

test('collapsed input values remain inspectable, and Chinese labels are rendered from the catalog', async () => {
  await results();
  const store = getOptimizationStore();
  const views = optimization().views!;
  act(() => {
    // Width behavior uses the same view contract, including inputs supplied by other map axes.
    store.setState({
      views: {
        ...views,
        leaderboard: {
          ...views.leaderboard,
          columns: ['Length', 'Source', 'Multiplier', 'Fourth', 'Fifth'],
        },
      },
    });
    uiStore.getState().setLanguage('zh');
  });
  const user = userEvent.setup();
  renderInEnglish(<LeaderboardPanel />);
  expect(screen.getByText('9 / 9 符合')).toBeVisible();
  await user.click(screen.getAllByRole('button', { name: '+3' })[0]);
  expect(screen.getByRole('dialog', { name: '参数' })).toHaveTextContent('Multiplier');
});
