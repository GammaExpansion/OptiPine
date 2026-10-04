import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { I18nProvider } from '../../../../i18n/I18nProvider.tsx';
import { getBacktestStore, openScript } from '../../../../state/backtest.ts';
import { getMarketDataStore } from '../../../../state/marketData.ts';
import { getSelectionStore } from '../../../../state/selection.ts';
import { replaceServices } from '../../../../state/services.ts';
import { fakeServices, testInput } from '../../../../state/test-support.ts';
import { uiStore } from '../../../../state/ui.ts';
import { strategySource } from '../../../../workflows/test-support.ts';
import { filterTrades } from '../../../../workflows/trades.ts';
import { ReportTab } from '../ReportTab.tsx';
import { EquityTab } from '../EquityTab.tsx';
import { TradesTab } from '../TradesTab.tsx';
import { DockActionsHost } from '../DockActions.tsx';
import { displayedResult, equityFor, reportFor, tradesFor } from './model.ts';

vi.mock('../../../../charts/EquityCharts.tsx', () => ({
  EquityCharts: ({ afterToolbar }: { afterToolbar?: ReactNode }) => (
    <div data-testid="equity-chart-stub">{afterToolbar}</div>
  ),
}));
let restore: () => void;
beforeEach(() => {
  restore = replaceServices(() => fakeServices());
  uiStore.setState({ language: 'en', dockTab: 'report' });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(300);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(1100);
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  restore();
});

async function run(source = strategySource) {
  await act(async () => {
    openScript({ source, fileName: 'test.pine', origin: { kind: 'file' } });
    getMarketDataStore().getState().actions.useCsv(testInput, 'prices.csv');
  });
  await expect.poll(() => getBacktestStore().getState().readiness.ok).toBe(true);
  await act(() => getBacktestStore().getState().actions.run());
  return getBacktestStore().getState().result!;
}

test.each([ReportTab, EquityTab, TradesTab])(
  'empty tabs use the existing dock empty state',
  (Tab) => {
    render(
      <I18nProvider>
        <Tab />
      </I18nProvider>,
    );
    expect(screen.getByText('Run a backtest to see results here.')).toBeVisible();
  },
);

test('result adapters preserve workflow outputs and identities across input changes', async () => {
  const result = await run();
  const trades = tradesFor(result);
  const report = reportFor(result);
  const equity = equityFor(result)!;
  expect(trades[0].number).toBe(result.output.trades.length);
  expect(trades[0].open).toBe(true);
  expect(equity.input.equity).toBe(result.output.equity);
  expect(equity.input.times).toEqual(testInput.bars.map((bar) => bar.time));
  expect(equity.summary.endingEquity).toBe(result.output.equity!.at(-1));
  getBacktestStore().getState().actions.setInput('Length', 7);
  expect(displayedResult(getBacktestStore().getState())).toBe(result);
  expect(
    displayedResult({
      ...getBacktestStore().getState(),
      compile: { status: 'failed', diagnostics: [], error: null },
    }),
  ).toBeNull();
  expect(tradesFor(result)).toBe(trades);
  expect(reportFor(result)).toBe(report);
  expect(equityFor(result)).toBe(equity);
  const indicator = { ...result, initialCapital: null };
  expect(equityFor(indicator)).toBeNull();
  expect(equityFor({ ...result, output: { ...result.output, equity: undefined } })).toBeNull();
});

test('CSV actions belong to the active tab dock host and disappear when collapsed', async () => {
  await run();
  const host = document.createElement('div');
  document.body.append(host);
  const dock = (tab: ReactNode, collapsed = false) => (
    <I18nProvider>
      <DockActionsHost.Provider value={collapsed ? null : host}>{tab}</DockActionsHost.Provider>
    </I18nProvider>
  );
  try {
    const view = render(dock(<ReportTab />));
    expect(within(host).getByRole('button', { name: 'Export report CSV' })).toBeVisible();
    expect(within(view.container).queryByRole('button', { name: /Export/ })).toBeNull();
    view.rerender(dock(<TradesTab />));
    expect(within(host).queryByRole('button', { name: 'Export report CSV' })).toBeNull();
    expect(within(host).getByRole('button', { name: 'Export trades CSV' })).toBeVisible();
    expect(within(view.container).queryByRole('button', { name: /Export/ })).toBeNull();
    view.rerender(dock(<TradesTab />, true));
    expect(host).toBeEmptyDOMElement();
    view.unmount();
  } finally {
    host.remove();
  }
});

test('report renders all groups, keeps English metric names in Chinese, and restores stale inputs', async () => {
  await run();
  render(
    <I18nProvider>
      <ReportTab />
    </I18nProvider>,
  );
  expect(screen.getAllByRole('table')).toHaveLength(3);
  expect(screen.getByRole('region', { name: 'Report' })).toHaveAttribute('tabindex', '0');
  expect(
    within(screen.getByRole('table', { name: 'Returns' })).getByText('Net profit'),
  ).toBeVisible();
  act(() => getBacktestStore().getState().actions.setInput('Length', 7));
  expect(screen.getByRole('status')).toHaveTextContent('Current results use Length 5.');
  expect(document.querySelector('[data-dimmed="true"]')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Reset to 5' }));
  expect(screen.queryByRole('status')).toBeNull();
  act(() => uiStore.getState().setLanguage('zh'));
  expect(
    within(screen.getByRole('table', { name: '收益' })).getByText('Gross profit'),
  ).toBeVisible();
});

test('the outdated banner reads the result values as the inputs show them (B9)', async () => {
  await run(`${strategySource}stop = input.bool(false, "Stop")\n`);
  render(
    <I18nProvider>
      <ReportTab />
    </I18nProvider>,
  );
  act(() => getBacktestStore().getState().actions.setInput('Multiplier', 1.5));
  expect(screen.getByRole('button', { name: 'Reset to 1.00' })).toBeVisible();
  act(() => getBacktestStore().getState().actions.setInput('Stop', true));
  expect(screen.getByRole('status')).toHaveTextContent(
    'Current results use Multiplier 1.00, Stop off.',
  );
});

test.each(['en', 'zh'] as const)(
  'restore uses the run value for one change and generic copy for several (%s)',
  async (language) => {
    await run();
    act(() => getBacktestStore().getState().actions.setInput('Length', 8));
    await act(() => getBacktestStore().getState().actions.run());
    act(() => uiStore.getState().setLanguage(language));
    render(
      <I18nProvider>
        <ReportTab />
      </I18nProvider>,
    );
    act(() => getBacktestStore().getState().actions.setInput('Length', 9));
    expect(
      screen.getByRole('button', { name: language === 'en' ? 'Reset to 8' : '恢复为 8' }),
    ).toBeVisible();
    act(() => getBacktestStore().getState().actions.setInput('Multiplier', 2));
    fireEvent.click(
      screen.getByRole('button', {
        name: language === 'en' ? 'Restore result inputs' : '恢复结果所用参数',
      }),
    );
    expect(screen.queryByRole('status')).toBeNull();
    act(() => getBacktestStore().setState({ run: { status: 'running', startedAt: 0 } }));
    expect(document.querySelector('[data-dimmed="true"]')).toBeTruthy();
  },
);

test('a no-trade report shows engine zeroes and absent ratios as dashes', async () => {
  await run('//@version=6\nstrategy("No trades", initial_capital=10000)\nplot(close)');
  render(
    <I18nProvider>
      <ReportTab />
    </I18nProvider>,
  );
  const row = within(screen.getByRole('table', { name: 'Trades' }))
    .getByText('Total trades')
    .closest('tr')!;
  expect(
    within(row)
      .getAllByRole('cell')
      .map((cell) => cell.textContent),
  ).toEqual(['0', '0', '0']);
  expect(screen.getAllByText('0.00').length).toBeGreaterThan(0);
  expect(screen.getAllByText('—').length).toBeGreaterThan(0);
});

test('preview data replaces main result; an empty preview never falls back to the main result', async () => {
  const result = await run();
  render(
    <I18nProvider>
      <ReportTab />
    </I18nProvider>,
  );
  await act(() =>
    getBacktestStore()
      .getState()
      .actions.preview(
        { Length: 8 },
        { kind: 'rank', rank: 1, optimizationId: 1, trialId: 'trial-1' },
      ),
  );
  expect(displayedResult(getBacktestStore().getState())).not.toBe(result);
  expect(displayedResult(getBacktestStore().getState())?.computedWith.inputs.Length).toBe(8);
  const preview = getBacktestStore().getState().preview!;
  act(() => getBacktestStore().setState({ preview: { ...preview, result: null } }));
  expect(screen.getByText('Run a backtest to see results here.')).toBeVisible();
});

test('equity facts accompany the workflow charts', async () => {
  await run();
  render(
    <I18nProvider>
      <EquityTab />
    </I18nProvider>,
  );
  for (const label of [
    'Ending equity',
    'Annualized return',
    'Max drawdown',
    'Drawdown duration',
    'Return / max drawdown',
    'Winning / losing days',
    'Best / worst day',
  ])
    expect(screen.getByText(label)).toBeVisible();
  expect(screen.getByTestId('equity-chart-stub')).toBeVisible();
});

test('trade hover, click and keyboard Enter call selection actions with workflow trade numbers', async () => {
  const result = await run();
  const rows = tradesFor(result);
  const selection = getSelectionStore();
  const hover = vi.spyOn(selection.getState(), 'hoverTrade');
  const focus = vi.spyOn(selection.getState(), 'focusTrade');
  render(
    <I18nProvider>
      <TradesTab />
    </I18nProvider>,
  );
  const row = document.querySelector(`[data-trade="${rows[0].number}"]`)!;
  expect(row).toBeTruthy();
  fireEvent.mouseEnter(row);
  expect(hover).toHaveBeenLastCalledWith(rows[0].number);
  fireEvent.mouseLeave(row);
  expect(hover).toHaveBeenLastCalledWith(null);
  fireEvent.click(row);
  expect(focus).toHaveBeenLastCalledWith(rows[0].number);
  const grid = screen.getByRole('grid');
  expect(within(grid).getByRole('columnheader', { name: 'Locate' })).toHaveTextContent('Locate');
  fireEvent.keyDown(grid, { key: 'ArrowDown' });
  fireEvent.keyDown(grid, { key: 'Enter' });
  expect(focus).toHaveBeenLastCalledWith(rows[1].number);
  fireEvent.mouseLeave(grid);
  expect(hover).toHaveBeenLastCalledWith(null);
});

test('side and P&L filters apply without running again and leave source rows unchanged', async () => {
  const result = await run();
  const runAction = vi.spyOn(getBacktestStore().getState().actions, 'run');
  const rows = tradesFor(result);
  const user = userEvent.setup();
  render(
    <I18nProvider>
      <TradesTab />
    </I18nProvider>,
  );
  await user.click(screen.getByRole('radio', { name: 'Short' }));
  const shorts = filterTrades(rows, { side: 'short', pnl: 'all' });
  expect(screen.getByRole('grid')).toHaveAttribute('aria-rowcount', String(shorts.rows.length + 1));
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'P&L filter' }), { key: 'ArrowDown' });
  await user.click(screen.getByRole('option', { name: 'Profitable' }));
  const kept = filterTrades(rows, { side: 'short', pnl: 'profit' });
  expect(kept.rows.every((row) => row.side === 'short' && row.pnl > 0)).toBe(true);
  if (kept.rows.length)
    expect(screen.getByRole('grid')).toHaveAttribute('aria-rowcount', String(kept.rows.length + 1));
  else expect(screen.getByText('No trades match the filters')).toBeVisible();
  expect(tradesFor(result)).toBe(rows);
  expect(runAction).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'P&L filter' }), { key: 'ArrowDown' });
  await user.click(screen.getByRole('option', { name: 'Losing' }));
  const losses = filterTrades(rows, { side: 'short', pnl: 'loss' });
  if (losses.rows.length)
    expect(screen.getByRole('grid')).toHaveAttribute(
      'aria-rowcount',
      String(losses.rows.length + 1),
    );
  else expect(screen.getByText('No trades match the filters')).toBeVisible();
});
