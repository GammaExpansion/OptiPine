import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { WorkerCancelledError } from '@pine/workers';
import { getServices } from '../../../state/services.ts';
import { uiStore } from '../../../state/ui.ts';
import {
  loadOptimization,
  optimization,
  renderInEnglish,
  useOptimizeTestServices,
} from '../test-support.tsx';
import { OptimizeSidebar } from './OptimizeSidebar.tsx';

useOptimizeTestServices();

const row = (title: string) =>
  optimization().search.rows.find((item) => item.descriptor.title === title)!;
const block = () => within(screen.getByRole('region', { name: 'Optimization run' }));
const combos = () => block().getByText('combos').previousElementSibling;
const start = () => block().getByRole('button', { name: 'Start' });

test('before a compile the panel says where the inputs will appear, and Start waits', () => {
  renderInEnglish(<OptimizeSidebar />);
  expect(
    screen.getByText('Once the script compiles, its inputs are listed here in declaration order.'),
  ).toBeVisible();
  expect(start()).toBeDisabled();
  // The caption under the count, and the description Start carries.
  expect(block().getAllByText('Open a script and select market data first')).toHaveLength(2);
  expect(start()).toHaveAccessibleDescription('Open a script and select market data first');
});

test('a numeric row edits from, to and step, and a reversed range blocks the run (O1, O6)', async () => {
  await loadOptimization();
  renderInEnglish(<OptimizeSidebar />);
  expect(combos()).toHaveTextContent('9');
  const from = screen.getByRole('spinbutton', { name: 'Length from' });
  fireEvent.change(from, { target: { value: '9' } });
  expect(row('Length').error).not.toBeNull();
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Length: the end must be at least the start.',
  );
  expect(from).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByRole('spinbutton', { name: 'Length step' })).not.toHaveAttribute(
    'aria-invalid',
  );
  expect(combos()).toHaveTextContent('—');
  expect(block().getAllByText('Fix the 1 errors above first')).toHaveLength(2);
  expect(start()).toBeDisabled();
  fireEvent.change(from, { target: { value: '3' } });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Length step' }), {
    target: { value: '1' },
  });
  expect(row('Length').values).toEqual([3, 4]);
  expect(combos()).toHaveTextContent('6');
  expect(start()).toBeEnabled();
});

test('the checkbox fixes an input at a value of its own, and searches it again', async () => {
  const user = userEvent.setup();
  await loadOptimization();
  renderInEnglish(<OptimizeSidebar />);
  await user.click(screen.getByRole('checkbox', { name: 'Search Length' }));
  expect(row('Length').status).toBe('fixed');
  const fixed = screen.getByRole('spinbutton', { name: 'Length fixed value' });
  expect(fixed).toHaveValue('5');
  fireEvent.change(fixed, { target: { value: '7' } });
  expect(row('Length').values).toEqual([7]);
  expect(combos()).toHaveTextContent('3');
  await user.click(screen.getByRole('checkbox', { name: 'Search Length' }));
  expect(row('Length').values).toEqual([2, 3, 4]);
});

test('value chips keep or drop values, with the full list behind N more (O4)', async () => {
  const user = userEvent.setup();
  await loadOptimization();
  renderInEnglish(<OptimizeSidebar />);
  const chips = screen.getByRole('group', { name: 'Source values' });
  expect(
    within(chips)
      .getAllByRole('button')
      .map((chip) => chip.textContent),
  ).toEqual(['close', 'hl2', 'ohlc4', '5 more']);
  await user.click(within(chips).getByRole('button', { name: 'hl2' }));
  expect(row('Source').values).toEqual(['close', 'ohlc4']);
  expect(within(chips).getByRole('button', { name: 'hl2' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await user.click(within(chips).getByRole('button', { name: '5 more' }));
  const list = screen.getByRole('dialog', { name: 'Source values' });
  expect(within(list).getByText('2 / 8 selected')).toBeVisible();
  expect(
    within(list).getByText('With only one value kept, the input is fixed to it.'),
  ).toBeVisible();
  await user.click(within(list).getByRole('checkbox', { name: 'open' }));
  expect(row('Source').values).toEqual(['open', 'close', 'ohlc4']);
  expect(combos()).toHaveTextContent('9');
});

test('random sampling takes a sample count and a seed (O5)', async () => {
  const user = userEvent.setup();
  await loadOptimization();
  renderInEnglish(<OptimizeSidebar />);
  expect(screen.queryByRole('spinbutton', { name: 'Random sample size' })).toBeNull();
  await user.click(screen.getByRole('radio', { name: 'Random' }));
  const count = screen.getByRole('spinbutton', { name: 'Random sample size' });
  expect(count).toHaveValue('2000');
  fireEvent.change(count, { target: { value: '4' } });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Random seed' }), {
    target: { value: '7' },
  });
  expect(optimization().sampling).toEqual({ method: 'random', count: 4, seed: 7 });
  expect(combos()).toHaveTextContent('4');
  fireEvent.change(count, { target: { value: '0' } });
  expect(screen.getByRole('alert')).toHaveTextContent('Sample count must be at least 1');
});

test('validation switches between None, IS / OOS and walk-forward (O1–O3)', async () => {
  const user = userEvent.setup();
  await loadOptimization();
  renderInEnglish(<OptimizeSidebar />);
  const share = screen.getByRole('slider', { name: 'OOS share' });
  expect(share).toHaveAttribute('aria-valuetext', 'IS 70%, OOS 30%');
  fireEvent.change(share, { target: { value: '60' } });
  expect(optimization().validation.outOfSamplePercent).toBe(40);
  expect(screen.getByText('40%')).toBeVisible();
  await user.click(screen.getByRole('radio', { name: 'None' }));
  expect(screen.getByText(/ranks only measure fit/)).toBeVisible();
  expect(screen.getByRole('button', { name: /^By Net profit ?, max/ })).toBeVisible();
  await user.click(screen.getByRole('radio', { name: 'Walk-forward' }));
  expect(screen.getByRole('heading', { name: 'Per-window selection and filters' })).toBeVisible();
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Out-of-sample months' }), {
    target: { value: '6' },
  });
  await user.click(screen.getByRole('radio', { name: 'Anchored' }));
  expect(optimization().validation.walkForward).toEqual({
    inSampleMonths: 12,
    outOfSampleMonths: 6,
    stepMonths: 3,
    anchored: true,
  });
  // The step is shorter than the OOS range, which the plan refuses.
  await waitFor(() => expect(optimization().plan.status).toBe('failed'));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'The step must be at least the OOS length to avoid overlapping windows.',
  );
  expect(start()).toBeDisabled();
});

test('the objective menu ranks by a grouped objective and direction; chips remove filters (O7)', async () => {
  const user = userEvent.setup();
  await loadOptimization();
  renderInEnglish(<OptimizeSidebar />);
  await user.click(screen.getByRole('button', { name: /^By IS net profit ?, max/ }));
  const menu = screen.getByRole('dialog', { name: 'Ranking objective' });
  expect(within(menu).getByRole('radio', { name: 'IS net profit' })).toHaveFocus();
  expect(within(menu).getByRole('group', { name: 'Risk' })).toBeVisible();
  await user.keyboard('{ArrowDown}');
  expect(within(menu).getByRole('radio', { name: 'Annualized return' })).toHaveFocus();
  await user.click(within(menu).getByRole('radio', { name: 'Min' }));
  expect(optimization().viewSettings.direction).toBe('minimize');
  await user.click(within(menu).getByRole('radio', { name: 'Max drawdown' }));
  expect(optimization().viewSettings).toMatchObject({
    objective: 'maxDrawdown',
    direction: 'minimize',
  });
  expect(screen.queryByRole('dialog', { name: 'Ranking objective' })).toBeNull();
  expect(screen.getByRole('button', { name: /^By Max drawdown ?, min/ })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Remove Trades ≥ 30' }));
  expect(optimization().viewSettings.filters).toEqual([
    { metric: 'maxDrawdown', operator: '<=', value: 15 },
  ]);
  expect(screen.getByRole('button', { name: '+ Condition' })).toBeVisible();
});

test('properties sum up commission, slippage and order size, and Edit opens B13', async () => {
  const user = userEvent.setup();
  await loadOptimization();
  renderInEnglish(<OptimizeSidebar />);
  expect(screen.getByText('Commission 0.1%')).toBeVisible();
  expect(screen.getByText('Slippage 0 ticks')).toBeVisible();
  expect(screen.getByText('50% of equity')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Edit' }));
  expect(uiStore.getState().openDialogs).toEqual(['properties']);
});

test('run setup rests while objective, direction and filters stay usable (O8, WEB.md 3.1)', async () => {
  const user = userEvent.setup();
  await loadOptimization();
  const pool = getServices().optimization!.pool;
  let reject!: (error: Error) => void;
  const held = new Promise<Awaited<ReturnType<typeof pool.optimize>>>((_resolve, fail) => {
    reject = fail;
  });
  const optimize = vi.spyOn(pool, 'optimize').mockReturnValue(held);
  const { container } = renderInEnglish(<OptimizeSidebar />);
  let run!: Promise<void>;
  act(() => {
    run = optimization().actions.start();
  });
  for (const element of [
    screen.getByRole('checkbox', { name: 'Search Length' }),
    screen.getByRole('radio', { name: 'IS / OOS' }),
    screen.getByRole('button', { name: 'Edit' }),
  ]) {
    expect(element.closest('[inert]')).not.toBeNull();
    expect(element.closest('[inert]')).toHaveAttribute('data-running', 'true');
  }
  const objective = screen.getByRole('button', { name: /^By IS net profit ?, max/ });
  expect(objective.closest('[inert]')).toBeNull();
  await user.click(objective);
  const menu = screen.getByRole('dialog', { name: 'Ranking objective' });
  await user.click(within(menu).getByRole('radio', { name: 'Min' }));
  expect(optimization().viewSettings.direction).toBe('minimize');
  await user.click(within(menu).getByRole('radio', { name: 'Profit factor' }));
  expect(optimization().viewSettings.objective).toBe('profitFactor');
  const filters = screen.getByRole('group', { name: 'Filters' });
  const count = optimization().viewSettings.filters.length;
  await user.click(within(filters).getAllByRole('button', { name: /^Remove / })[0]);
  expect(optimization().viewSettings.filters).toHaveLength(count - 1);
  expect(optimization().run.status).toBe('running');
  act(() => optimization().actions.cancel());
  reject(new WorkerCancelledError());
  await act(() => run);
  optimize.mockRestore();
  expect(container.querySelector('[inert]')).toBeNull();
});
