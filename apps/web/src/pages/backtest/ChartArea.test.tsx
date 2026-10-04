import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { forwardRef, useImperativeHandle } from 'react';
import { beforeEach, expect, test, vi } from 'vitest';
import type { PriceChartHandle, PriceChartProps } from '../../charts/PriceChart.tsx';
import { getBacktestStore } from '../../state/backtest.ts';
import { getMarketDataStore } from '../../state/marketData.ts';
import { testInput } from '../../state/test-support.ts';
import { getSelectionStore } from '../../state/selection.ts';
import { uiStore } from '../../state/ui.ts';
import { ChartArea } from './ChartArea.tsx';
import {
  failingSource,
  loadScript,
  quietSource,
  renderInEnglish,
  runBacktest,
  useBacktestTestServices,
} from './states/test-support.tsx';

const chart = vi.hoisted(() => ({
  props: null as PriceChartProps | null,
  focusTrade: vi.fn(),
  resetView: vi.fn(),
}));
vi.mock('../../charts/PriceChart.tsx', () => ({
  PriceChart: forwardRef<PriceChartHandle, PriceChartProps>(function PriceChart(props, ref) {
    chart.props = props;
    useImperativeHandle(ref, () => ({
      focusTrade: chart.focusTrade,
      resetView: chart.resetView,
    }));
    return null;
  }),
}));

useBacktestTestServices();
beforeEach(() => {
  chart.props = null;
});

test('the focus on the first-launch steps moves to the page heading when they leave', async () => {
  renderInEnglish(<ChartArea />);
  const example = screen.getByRole('button', { name: /Load example/ });
  example.focus();
  fireEvent.click(example);
  const heading = await screen.findByRole('heading', { name: 'Backtest', level: 1 });
  await waitFor(() => expect(heading).toHaveFocus());
});

test('steps that leave without the focus leave it where it is', async () => {
  const elsewhere = document.createElement('button');
  document.body.append(elsewhere);
  renderInEnglish(<ChartArea />);
  elsewhere.focus();
  await loadScript();
  expect(await screen.findByRole('heading', { name: 'Backtest', level: 1 })).toBeInTheDocument();
  expect(elsewhere).toHaveFocus();
  elsewhere.remove();
});

test.each(['script', 'data'] as const)(
  'the first-launch steps show until there are a script and data (%s first)',
  async (first) => {
    renderInEnglish(<ChartArea />);
    const steps = () => {
      const region = screen.getByRole('region', { name: 'Run backtest' });
      expect(within(region).getByRole('button', { name: 'Paste code' })).toBeVisible();
      expect(within(region).getByRole('button', { name: 'Open file' })).toBeVisible();
      expect(within(region).getByRole('button', { name: 'Select market data' })).toBeVisible();
      expect(within(region).getByRole('button', { name: 'Run backtest' })).toBeDisabled();
    };
    steps();
    expect(chart.props).toBeNull();
    const load = {
      script: () => getBacktestStore().getState().actions.setSource(quietSource),
      data: () => getMarketDataStore().getState().actions.useCsv(testInput, 'prices.csv'),
    };
    act(load[first]);
    steps();
    expect(chart.props).toBeNull();
    act(load[first === 'script' ? 'data' : 'script']);
    // ResultChart loads lazily; compilation can finish before that chunk renders.
    await waitFor(() =>
      expect(chart.props).toMatchObject({
        symbol: 'BTCUSDT',
        timeframe: '1h',
        plots: [],
        trades: [],
      }),
    );
    expect(chart.props!.bars).toHaveLength(120);
    expect(screen.queryByRole('heading', { name: 'Run backtest' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Backtest' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset zoom' })).not.toBeInTheDocument();
    await waitFor(() => expect(getBacktestStore().getState().readiness.ok).toBe(true));
    await runBacktest();
    expect(getBacktestStore().getState().result).not.toBeNull();
    act(() => getBacktestStore().getState().actions.setSource(''));
    steps();
  },
);

test('the result draws its plots and trades, and follows the Trades tab’s hover and focus (B6)', async () => {
  await loadScript();
  renderInEnglish(<ChartArea />);
  await runBacktest();
  const trades = chart.props!.trades;
  expect(trades.length).toBeGreaterThan(2);
  expect(chart.props!.plots.map((plot) => plot.title)).toEqual(['Basis', 'RSI']);
  act(() => getSelectionStore().getState().hoverTrade(2));
  expect(chart.props!.hoveredTrade).toBe(trades.find((row) => row.number === 2));
  act(() => getSelectionStore().getState().focusTrade(1));
  expect(chart.focusTrade).toHaveBeenLastCalledWith(trades.find((row) => row.number === 1));
  act(() => getSelectionStore().getState().focusTrade(1));
  expect(chart.focusTrade).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button', { name: 'Show trade markers' }));
  expect(chart.props!.trades).toEqual([]);
  expect(chart.props!.hoveredTrade).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Reset zoom' }));
  expect(chart.resetView).toHaveBeenCalled();
});

test('a failed run states the line and the bar counted from one, with its ways out (B11)', async () => {
  await loadScript(failingSource);
  renderInEnglish(<ChartArea />);
  await runBacktest();
  expect(screen.getByRole('heading', { name: 'Run failed, no results' })).toBeInTheDocument();
  expect(
    screen.getByText('Line 14 failed at bar 4. An incomplete run shows no partial results.'),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'View issues' }));
  expect(uiStore.getState().dockTab).toBe('issues');
  fireEvent.click(screen.getByRole('button', { name: 'Go to line 14' }));
  expect(uiStore.getState().dockTab).toBe('code');
  expect(getSelectionStore().getState().codeLine).toMatchObject({ line: 14 });
});

test('a result without trades keeps the chart and points to the code (B12)', async () => {
  await loadScript(quietSource);
  renderInEnglish(<ChartArea />);
  await runBacktest();
  expect(chart.props!.plots).toHaveLength(1);
  expect(screen.getByRole('heading', { name: 'No trades in the selected range' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'View Pine code' }));
  expect(uiStore.getState().dockTab).toBe('code');
});

test('a failed compile shows the data alone (B10)', async () => {
  await loadScript();
  renderInEnglish(<ChartArea />);
  await runBacktest();
  act(() => getBacktestStore().getState().actions.setSource('//@version=6\nplot(missing)'));
  await vi.waitFor(() => expect(getBacktestStore().getState().compile.status).toBe('failed'));
  expect(chart.props).toMatchObject({ plots: [], trades: [] });
});

test('only outdated or running results dim trade overlays, including running previews', async () => {
  await loadScript();
  renderInEnglish(<ChartArea />);
  await runBacktest();
  const store = getBacktestStore();
  const trades = chart.props!.trades;
  expect(chart.props!.dimMarkers).toBe(false);
  act(() => store.getState().actions.setInput('Length', 7));
  expect(chart.props!.dimMarkers).toBe(true);
  expect(chart.props!.trades).toBe(trades);
  act(() => store.getState().actions.restoreResultInputs());
  expect(chart.props!.dimMarkers).toBe(false);
  act(() => store.setState({ run: { status: 'running', startedAt: 0 } }));
  expect(chart.props!.dimMarkers).toBe(true);
  await act(() =>
    store
      .getState()
      .actions.preview(
        { Length: 8 },
        { kind: 'rank', rank: 1, optimizationId: 1, trialId: 'trial-1' },
      ),
  );
  expect(chart.props!.dimMarkers).toBe(false);
  const preview = store.getState().preview!;
  act(() => store.setState({ preview: { ...preview, run: { status: 'running', startedAt: 0 } } }));
  expect(chart.props!.dimMarkers).toBe(true);
});
