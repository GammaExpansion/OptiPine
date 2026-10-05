import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { getOptimizationStore } from '../../../state/optimization.ts';
import { getServices } from '../../../state/services.ts';
import { uiStore } from '../../../state/ui.ts';
import { cellValues } from '../../../workflows/optimize-views.ts';
import {
  loadOptimization,
  optimization,
  renderInEnglish,
  runOptimization,
  useOptimizeTestServices,
} from '../test-support.tsx';
import { MapPanel } from './MapPanel.tsx';
import { SensitivityPanel } from '../sensitivity/SensitivityPanel.tsx';
import { CellValuesTable } from './CellValuesTable.tsx';

useOptimizeTestServices();
beforeEach(() => vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null));

it('renders a real nine-set snapshot, switches surfaces and smoothing without running the pool', async () => {
  await loadOptimization();
  await runOptimization();
  const start = vi.spyOn(getServices().optimization!.session, 'start');
  const result = optimization().results;
  renderInEnglish(
    <>
      <MapPanel />
      <SensitivityPanel />
    </>,
  );
  expect(screen.getByTestId('parameter-map')).toBeInTheDocument();
  expect(screen.getByRole('switch')).toBeChecked();
  expect(screen.getByText('Net profit · smoothed')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('radio', { name: 'OOS' }));
  expect(optimization().views?.map?.surface).toBe('out');
  fireEvent.click(screen.getByRole('switch'));
  await waitFor(() => expect(optimization().views?.pending).toBe(false));
  expect(optimization().viewSettings.smooth).toBe(false);
  expect(screen.queryByText('Net profit · smoothed')).not.toBeInTheDocument();
  expect(optimization().results).toBe(result);
  expect(start).not.toHaveBeenCalled();
  act(() => uiStore.getState().setLanguage('zh'));
  expect(screen.getByRole('heading', { name: '参数图' })).toBeInTheDocument();
});

it('renders the workflow hover list including null results and its mean', async () => {
  await loadOptimization();
  act(() => optimization().actions.setRange('Length', { from: 2, to: 28, step: 1 }));
  await runOptimization();
  const views = optimization().views!;
  const cell = views.map!.panel.cells[0];
  const values = cellValues(views.summary, cell);
  expect(values.values.length).toBe(2);
  renderInEnglish(<CellValuesTable values={values} x="Length" y="Source" validated />);
  const table = screen.getByRole('table');
  expect(within(table).getAllByRole('row')).toHaveLength(3);
  expect(screen.getByText('Mean')).toBeInTheDocument();
  expect(within(table).getByText('IS')).toBeInTheDocument();
  expect(within(table).getByText('OOS')).toBeInTheDocument();
  expect(screen.getByText('Neighbourhood mean (±1 step)')).toBeInTheDocument();
});

it('scrolls a large hover list without mounting every value and keeps the full mean', () => {
  const values = {
    values: Array.from({ length: 200 }, (_, x) => ({
      x,
      y: x % 2,
      inSample: x,
      outOfSample: null,
    })),
    mean: { inSample: 99.5, outOfSample: null },
  };
  const { container } = renderInEnglish(
    <CellValuesTable values={values} x="Length" y="Multiplier" validated={false} />,
  );
  expect(screen.queryByText('OOS')).not.toBeInTheDocument();
  // Net profit, the default objective, reads in whole amounts as R1 writes them.
  expect(screen.getByText('+100')).toBeInTheDocument();
  expect(screen.getByText('200 values; scroll for the rest')).toBeInTheDocument();
  const table = screen.getByRole('table');
  expect(within(table).getAllByRole('row').length).toBeLessThan(14);
  fireEvent.scroll(table.parentElement!, { target: { scrollTop: 2400 } });
  expect(within(table).getByText('100 / 0')).toBeInTheDocument();
  expect(container.querySelectorAll('tbody tr').length).toBeLessThan(13);
});

it('shows the available binned mean during streaming and hides obsolete hover after a new map', async () => {
  await loadOptimization();
  act(() => optimization().actions.setRange('Length', { from: 2, to: 28, step: 1 }));
  await runOptimization();
  const views = optimization().views!;
  act(() =>
    getOptimizationStore().setState({
      views: { ...views, inProgress: true, map: { ...views.map!, map: null } },
    }),
  );
  renderInEnglish(
    <>
      <MapPanel />
      <SensitivityPanel />
    </>,
  );
  fireEvent.pointerMove(screen.getByTestId('parameter-map'), { clientX: 72, clientY: 16 });
  // jsdom has no pointer coordinates; keyboard inspection exercises the same hover path.
  fireEvent.keyDown(screen.getByTestId('parameter-map'), { key: 'Home' });
  expect(screen.getByRole('tooltip')).toHaveTextContent('Available mean:');
  expect(screen.getByRole('tooltip')).toHaveTextContent(
    'Individual values are available when the run completes.',
  );
  act(() =>
    getOptimizationStore().setState({
      views: { ...views, map: { ...views.map!, panel: { ...views.map!.panel } } },
    }),
  );
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});

it('opens R7 at original resolution with a framed bin, then closes it', async () => {
  await loadOptimization();
  act(() => optimization().actions.setRange('Length', { from: 2, to: 28, step: 1 }));
  await runOptimization();
  renderInEnglish(
    <>
      <MapPanel />
      <SensitivityPanel />
    </>,
  );
  const canvas = screen.getByTestId('parameter-map');
  fireEvent.keyDown(canvas, { key: 'Home' });
  fireEvent.keyDown(canvas, { key: 'Enter' });
  expect(screen.getByRole('region', { name: 'Bin detail' })).toBeInTheDocument();
  expect(
    within(screen.getByRole('region', { name: 'Bin detail' })).getByText(
      'Neighbourhood mean (±1 step)',
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByText('Original resolution. White frames mark the 2 values in this cell.'),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Close detail' }));
  expect(screen.queryByRole('region', { name: 'Bin detail' })).not.toBeInTheDocument();
});

it('renders R8 from the one-input view and inspects values with the keyboard', async () => {
  await loadOptimization();
  act(() => optimization().actions.setSearched('Source', false));
  await runOptimization();
  renderInEnglish(
    <>
      <MapPanel />
      <SensitivityPanel />
    </>,
  );
  expect(screen.queryByTestId('parameter-map')).not.toBeInTheDocument();
  const canvas = screen.getByTestId('objective-curve');
  fireEvent.keyDown(canvas, { key: 'End' });
  expect(screen.getByText('Neighbourhood mean (±1 step)', { selector: 'dt' })).toBeInTheDocument();
  expect(screen.getByText('IS range within 90% of peak')).toBeInTheDocument();
});

it('says once, in the tooltip, what an excluded cell fails, with no box over the map', async () => {
  await loadOptimization();
  act(() => optimization().actions.setRange('Length', { from: 2, to: 28, step: 1 }));
  await runOptimization();
  act(() => optimization().actions.addFilter({ metric: 'trades', operator: '>=', value: 100_000 }));
  await waitFor(() => expect(optimization().views?.pending).toBe(false));
  renderInEnglish(<MapPanel />);
  const canvas = screen.getByTestId('parameter-map');
  fireEvent.keyDown(canvas, { key: 'Home' });
  const tooltip = screen.getByRole('tooltip');
  expect(within(tooltip).getAllByText('Excluded by filters')).toHaveLength(1);
  expect(tooltip).toHaveTextContent('Trades ≥ 100,000');
  // Every set is excluded, so the legend explains the corner mark; nothing else repeats it.
  const legend = screen.getByLabelText('Rank colours from the worst value to the best');
  expect(within(legend).getByText('Excluded by filters')).toBeInTheDocument();
  expect(screen.getAllByText('Excluded by filters')).toHaveLength(2);
  // Keyboard and screen reader users hear the same, with the value in the objective's format.
  const status = within(canvas.parentElement!.parentElement!).getByRole('status');
  expect(status.textContent).toBe(
    '2–3, ohlc4: +2,309. Excluded by filters. Trades ≥ 5. Trades ≥ 100,000',
  );
});
