import { act, screen, waitFor, within } from '@testing-library/react';
import { expect, test } from 'vitest';
import { getMarketDataStore } from '../../../state/marketData.ts';
import { testInput } from '../../../state/test-support.ts';
import { syntheticBars } from '../../../workflows/test-support.ts';
import { loadScript } from '../../backtest/states/test-support.tsx';
import { optimization, renderInEnglish, useOptimizeTestServices } from '../test-support.tsx';
import { DataRangeBar } from './DataRangeBar.tsx';
import { WindowPlan } from './WindowPlan.tsx';

useOptimizeTestServices();

/** The bar's texts in order, each in its own element. */
const reads = (element: HTMLElement, ...parts: string[]) =>
  expect(element.textContent).toBe(parts.join(''));

test('the bar shows the IS and OOS ranges, or all of the data for None (O1, O2)', async () => {
  const view = renderInEnglish(<DataRangeBar />);
  reads(view.container, 'Data range', 'No market data selected');
  await loadScript();
  reads(
    view.container,
    'Data range',
    'IS',
    '2026-09-01 – 2026-09-04',
    'OOS',
    '2026-09-04 – 2026-09-05',
  );
  act(() => optimization().actions.setValidation({ mode: 'none' }));
  reads(
    view.container,
    'Data range',
    'All used for optimization',
    '2026-09-01 – 2026-09-05',
    'No OOS range',
  );
});

test('walk-forward shows the planned windows in the bar and as lanes (O3)', async () => {
  const view = renderInEnglish(
    <>
      <DataRangeBar />
      <WindowPlan />
    </>,
  );
  act(() =>
    getMarketDataStore()
      .getState()
      .actions.useCsv(
        { ...testInput, bars: syntheticBars(24 * 730, Date.UTC(2023, 0, 1) / 1000) },
        'two-years.csv',
      ),
  );
  act(() => optimization().actions.setValidation({ mode: 'walk-forward' }));
  await waitFor(() => expect(optimization().plan.status).toBe('planned'));
  const plan = optimization().plan;
  const count = plan.status === 'planned' ? plan.windows.length : 0;
  expect(count).toBeGreaterThan(1);
  const bar = view.container.firstElementChild as HTMLElement;
  reads(
    bar,
    'Data range',
    `${count} windows`,
    'IS 12 months',
    'OOS 3 months',
    'Step 3 months, IS rolls forward',
  );
  const lanes = within(screen.getByRole('list'));
  expect(lanes.getAllByRole('listitem')).toHaveLength(count);
  expect(
    lanes.getByRole('listitem', { name: /^W1: IS 2023-01-01 – 2023-12-31, OOS 2024-01-01/ }),
  ).toHaveTextContent('W1');
  expect(
    screen.getByRole('img', { name: 'IS and OOS ranges of the planned windows' }),
  ).toBeVisible();
  act(() => optimization().actions.setValidation({ walkForward: { outOfSampleMonths: 6 } }));
  await waitFor(() => expect(optimization().plan.status).toBe('failed'));
  reads(
    bar,
    'Data range',
    'The step must be at least the OOS length to avoid overlapping windows.',
  );
  expect(screen.queryByRole('list')).toBeNull();
});
