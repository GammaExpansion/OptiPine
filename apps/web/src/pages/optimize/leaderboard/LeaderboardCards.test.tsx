import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { getOptimizationStore } from '../../../state/optimization.ts';
import { uiStore } from '../../../state/ui.ts';
import { setViewportWidth } from '../../../test/viewport.ts';
import { loadScript } from '../../backtest/states/test-support.tsx';
import {
  optimization,
  renderInEnglish,
  runOptimization,
  useOptimizeTestServices,
} from '../test-support.tsx';
import { LeaderboardPanel } from './LeaderboardPanel.tsx';

useOptimizeTestServices();

const source = `//@version=6
strategy("Cards", initial_capital=100000)
length = input.int(3, "Length", minval=2, maxval=4)
mult = input.float(1.5, "Multiplier", minval=1.5, maxval=2, step=0.25)
enabled = input.bool(true, "Enabled")
fixed = input.string("close", "Fixed", options=["close", "open"])
if bar_index % (length * 2) == 0
    strategy.entry("L", strategy.long, qty=mult)
if bar_index % (length * 2) == length
    strategy.close("L")
`;

async function results(none = false) {
  setViewportWidth(390);
  await loadScript(source);
  act(() => {
    const { actions } = optimization();
    actions.removeFilter(1);
    actions.removeFilter(0);
    actions.setRange('Length', { from: 2, to: 4, step: 1 });
    actions.setRange('Multiplier', { from: 1.5, to: 2, step: 0.25 });
    actions.setSearched('Fixed', false);
    actions.setPageSize(6);
    actions.setValidation({ mode: none ? 'none' : 'in-out' });
  });
  await runOptimization();
}

for (const language of ['en', 'zh'] as const) {
  test(`phone cards show declaration order and step precision, select by click and keyboard, and page (${language})`, async () => {
    await results();
    act(() => uiStore.getState().setLanguage(language));
    const en = language === 'en';
    const user = userEvent.setup();
    renderInEnglish(<LeaderboardPanel />);
    const list = screen.getByRole('list', { name: en ? 'Leaderboard' : '排行' });
    expect(within(list).getAllByRole('button')).toHaveLength(6);
    expect(screen.queryByRole('table')).toBeNull();
    const row = optimization().views!.leaderboard.rows[1];
    const card = within(list).getAllByRole('button')[1];
    const multiplier = Number(row.parameters.Multiplier).toFixed(2);
    const enabled = row.parameters.Enabled ? (en ? 'on' : '开') : en ? 'off' : '关';
    expect(card).toHaveTextContent(
      `Length ${row.parameters.Length}Multiplier ${multiplier}Enabled ${enabled}`,
    );
    expect(card).not.toHaveTextContent('Fixed');
    expect(card).toHaveTextContent(en ? 'IS' : '样本内');
    expect(card).toHaveTextContent(en ? 'OOS' : '样本外');
    await user.click(card);
    await waitFor(() => expect(card).toHaveAttribute('aria-pressed', 'true'));
    expect(optimization().views?.selection?.row.trialId).toBe(row.trialId);
    await user.click(screen.getByRole('button', { name: en ? 'Next page' : '下一页' }));
    expect(within(list).getAllByRole('button')).toHaveLength(6);
    const lastPageCard = within(list).getAllByRole('button')[0];
    lastPageCard.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(optimization().views?.selection?.row.rank).toBe(7));
    expect(lastPageCard).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: en ? 'Previous page' : '上一页' }));
    expect(within(list).getAllByRole('button')).toHaveLength(6);
    expect(optimization().views?.selection?.row.rank).toBe(7);
  });
}

test('cards preserve missing net values and validation None never invents OOS', async () => {
  await results(true);
  const store = getOptimizationStore();
  const views = optimization().views!;
  act(() =>
    store.setState({
      views: {
        ...views,
        leaderboard: {
          ...views.leaderboard,
          rows: views.leaderboard.rows.map((row) => ({
            ...row,
            inSample: { ...row.inSample, netProfit: null },
          })),
        },
      },
    }),
  );
  renderInEnglish(<LeaderboardPanel />);
  const card = screen.getByRole('button', { name: 'Select set #1' });
  expect(card).toHaveTextContent('Net profit—');
  expect(card).not.toHaveTextContent('OOS');
  expect(card.querySelector('[data-profit]')).toBeNull();
});

test('cards write whole amounts, as the desktop table and the selection bar do (#14)', async () => {
  await results();
  const store = getOptimizationStore();
  const views = optimization().views!;
  const [first] = views.leaderboard.rows;
  act(() =>
    store.setState({
      views: {
        ...views,
        leaderboard: {
          ...views.leaderboard,
          rows: [
            {
              ...first,
              inSample: { ...first.inSample, netProfit: 25_412.82 },
              outOfSample: { ...first.outOfSample!, netProfit: -1_147.8 },
            },
          ],
        },
      },
    }),
  );
  renderInEnglish(<LeaderboardPanel />);
  const card = screen.getByRole('button', { name: 'Select set #1' });
  expect(card).toHaveTextContent('IS+25,413');
  expect(card).toHaveTextContent('OOS−1,148');
});
