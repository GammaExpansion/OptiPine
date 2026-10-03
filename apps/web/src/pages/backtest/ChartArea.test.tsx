import { act, fireEvent, screen } from '@testing-library/react';
import { forwardRef, useImperativeHandle } from 'react';
import { beforeEach, expect, test, vi } from 'vitest';
import type { PriceChartHandle, PriceChartProps } from '../../charts/PriceChart.tsx';
import { getBacktestStore } from '../../state/backtest.ts';
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

test('the first-launch steps show until there are a script and data', async () => {
  renderInEnglish(<ChartArea />);
  expect(screen.getByRole('heading', { name: 'Run backtest' })).toBeInTheDocument();
  expect(chart.props).toBeNull();
  await loadScript();
  expect(chart.props).toMatchObject({ symbol: 'BTCUSDT 1h', plots: [], trades: [] });
  expect(chart.props!.bars).toHaveLength(120);
  expect(screen.queryByRole('button', { name: 'Reset zoom' })).not.toBeInTheDocument();
});

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
