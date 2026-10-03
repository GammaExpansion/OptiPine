import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider.tsx';
import { getBacktestStore, openScript } from '../../state/backtest.ts';
import { getMarketDataStore } from '../../state/marketData.ts';
import { replaceServices } from '../../state/services.ts';
import { fakeServices, testInput } from '../../state/test-support.ts';
import { strategySource } from '../../workflows/test-support.ts';
import { defaultPaneSizes, uiStore, type DockTab } from '../../state/ui.ts';
import { BacktestPage } from './BacktestPage.tsx';
import { ChartArea } from './ChartArea.tsx';
import { Sidebar } from './Sidebar.tsx';
import { ReportTab } from './dock/ReportTab.tsx';
import { EquityTab } from './dock/EquityTab.tsx';
import { TradesTab } from './dock/TradesTab.tsx';
import { CodeTab } from './dock/CodeTab.tsx';
import { IssuesTab } from './dock/IssuesTab.tsx';

vi.mock('./ChartArea.tsx', () => ({ ChartArea: vi.fn(() => null) }));
vi.mock('./Sidebar.tsx', () => ({ Sidebar: vi.fn(() => null) }));
vi.mock('./dock/ReportTab.tsx', () => ({ ReportTab: vi.fn(() => null) }));
vi.mock('./dock/EquityTab.tsx', () => ({ EquityTab: vi.fn(() => null) }));
vi.mock('./dock/TradesTab.tsx', () => ({ TradesTab: vi.fn(() => null) }));
vi.mock('./dock/CodeTab.tsx', () => ({ CodeTab: vi.fn(() => null) }));
vi.mock('./dock/IssuesTab.tsx', () => ({ IssuesTab: vi.fn(() => null) }));

let restore: () => void;
beforeEach(() => {
  restore = replaceServices(() => fakeServices());
  vi.clearAllMocks();
  uiStore.setState({
    language: 'en',
    dockTab: 'code',
    paneSizes: { backtest: { ...defaultPaneSizes }, optimize: { ...defaultPaneSizes } },
  });
});
afterEach(() => {
  cleanup();
  restore();
});

test('the page composes independent slots and defers result tabs until a result exists', async () => {
  render(
    <I18nProvider>
      <BacktestPage />
    </I18nProvider>,
  );
  expect(ChartArea).toHaveBeenCalled();
  expect(Sidebar).toHaveBeenCalled();
  await waitFor(() => expect(CodeTab).toHaveBeenCalled());
  expect(ReportTab).not.toHaveBeenCalled();
  const results = { report: ReportTab, equity: EquityTab, trades: TradesTab };
  for (const [tab, component] of Object.entries(results)) {
    act(() => uiStore.getState().setDockTab(tab as DockTab));
    expect(component).not.toHaveBeenCalled();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Run a backtest to see results here.');
  }
  act(() => {
    openScript({ source: strategySource, fileName: 'test.pine', origin: { kind: 'file' } });
    getMarketDataStore().getState().actions.useCsv(testInput, 'synthetic.csv');
  });
  await waitFor(() => expect(getBacktestStore().getState().readiness.ok).toBe(true));
  await act(() => getBacktestStore().getState().actions.run());
  const slots = { ...results, issues: IssuesTab };
  for (const [tab, component] of Object.entries(slots)) {
    act(() => uiStore.getState().setDockTab(tab as DockTab));
    await waitFor(() => expect(component).toHaveBeenCalled());
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  }
});

test('the dock issue count follows the session without re-rendering the page slots', async () => {
  render(
    <I18nProvider>
      <BacktestPage />
    </I18nProvider>,
  );
  const chartCalls = vi.mocked(ChartArea).mock.calls.length;
  const sidebarCalls = vi.mocked(Sidebar).mock.calls.length;
  expect(screen.getByRole('tab', { name: 'Issues 0' })).toBeInTheDocument();
  act(() =>
    openScript({
      source: '//@version=6\nstrategy("Broken")\nplot(missing)',
      fileName: 'broken.pine',
      origin: { kind: 'file' },
    }),
  );
  await waitFor(() =>
    expect(screen.getByRole('tab', { name: /Issues [1-9]/ })).toBeInTheDocument(),
  );
  expect(ChartArea).toHaveBeenCalledTimes(chartCalls);
  expect(Sidebar).toHaveBeenCalledTimes(sidebarCalls);
});
