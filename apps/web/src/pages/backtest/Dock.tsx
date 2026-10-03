import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Group, Panel, usePanelRef } from 'react-resizable-panels';
import { DockTabs } from '../../components/DockTabs.tsx';
import { IconButton } from '../../components/IconButton.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useBacktestStore } from '../../state/backtest.ts';
import { useSelectionStore } from '../../state/selection.ts';
import { defaultPaneSizes, useUiStore, type DockTab } from '../../state/ui.ts';
import { backtestIssues } from '../../workflows/backtest.ts';
import { ResizeHandle } from '../../shell/ResizeHandle.tsx';
import styles from '../../shell/Workbench.module.css';
import { EmptyResults } from './dock/results/EmptyResults.tsx';
import { DockActionsHost } from './dock/DockActions.tsx';
import actionStyles from './dock/DockActions.module.css';
import { Sidebar } from './Sidebar.tsx';
import { closedTradeCount, shownResult } from './states/chart-view.ts';
import phone from '../../shell/PhoneTabs.module.css';

const ReportTab = lazy(() =>
  import('./dock/ReportTab.tsx').then((m) => ({ default: m.ReportTab })),
);
const EquityTab = lazy(() =>
  import('./dock/EquityTab.tsx').then((m) => ({ default: m.EquityTab })),
);
const TradesTab = lazy(() =>
  import('./dock/TradesTab.tsx').then((m) => ({ default: m.TradesTab })),
);
const CodeTab = lazy(() => import('./dock/CodeTab.tsx').then((m) => ({ default: m.CodeTab })));
const IssuesTab = lazy(() =>
  import('./dock/IssuesTab.tsx').then((m) => ({ default: m.IssuesTab })),
);

const dockTabs: DockTab[] = ['report', 'equity', 'trades', 'code', 'issues'];
/** A phone has the right panel's inputs as a tab of their own, and shorter labels (G3). */
const phoneTabs: DockTab[] = ['report', 'equity', 'trades', 'inputs', 'code', 'issues'];

/** The tabs with their labels and the trade and issue counts. */
function useTabOptions(tabs: readonly DockTab[], short: boolean) {
  const { t } = useI18n();
  const issueCount = useBacktestStore((state) => backtestIssues(state).length);
  const tradeCount = useBacktestStore(closedTradeCount);
  return tabs.map((value) => ({
    value,
    label: t(short && value === 'code' ? 'dock.codeShort' : `dock.${value}`),
    ...(value === 'issues' ? { count: issueCount, bad: issueCount > 0 } : {}),
    ...(value === 'trades' && tradeCount !== null ? { count: tradeCount } : {}),
  }));
}

/** What a tab shows; S1 shows the empty dock without importing charts, tables or reporting. */
function TabContent({ tab }: { tab: DockTab }) {
  const hasResult = useBacktestStore((state) => shownResult(state) !== null);
  return (
    <>
      <Suspense fallback={<EmptyResults />}>
        {tab === 'report' && (hasResult ? <ReportTab /> : <EmptyResults />)}
        {tab === 'equity' && (hasResult ? <EquityTab /> : <EmptyResults />)}
        {tab === 'trades' && (hasResult ? <TradesTab /> : <EmptyResults />)}
      </Suspense>
      {tab === 'inputs' && <Sidebar />}
      <Suspense fallback={null}>
        {tab === 'code' && <CodeTab />}
        {tab === 'issues' && <IssuesTab />}
      </Suspense>
    </>
  );
}

/**
 * The phone's tab row under the chart (G3): Report, Equity, Trades, Inputs, Code and Issues, with
 * no dock actions or sizing.
 */
export function PhoneDock() {
  const { t } = useI18n();
  const tab = useUiStore((state) => state.dockTab);
  const setTab = useUiStore((state) => state.setDockTab);
  const options = useTabOptions(phoneTabs, true);
  return (
    <div className={phone.tabs}>
      <DockTabs
        label={t('dock.tabs')}
        value={tab}
        options={options}
        onChange={(value) => setTab(value as DockTab)}
      >
        <DockActionsHost.Provider value={null}>
          <TabContent tab={tab} />
        </DockActionsHost.Provider>
      </DockTabs>
    </div>
  );
}

export function Dock({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const codeLine = useSelectionStore((state) => state.codeLine);
  const [actionsHost, setActionsHost] = useState<HTMLElement | null>(null);
  // The phone's Inputs tab is the right panel here (G3).
  const tab = useUiStore((state) => (state.dockTab === 'inputs' ? 'report' : state.dockTab));
  const setTab = useUiStore((state) => state.setDockTab);
  const options = useTabOptions(dockTabs, false);
  const setSizes = useUiStore((state) => state.setPaneSizes);
  const saved = useUiStore((state) => state.paneSizes.backtest.chart);
  // Keep the mount default stable: changing it while dragging resets the library's layout.
  const [initialSize] = useState(saved);
  const [chartSize, setChartSize] = useState(saved);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [maximized, setMaximized] = useState(saved === 0);
  const previousSize = useRef(saved || defaultPaneSizes.chart);
  const groupElement = useRef<HTMLDivElement>(null);
  const chart = usePanelRef();
  const dock = usePanelRef();
  const persist = (size: number) => setSizes('backtest', { chart: size });
  const restore = () => {
    if (groupElement.current && groupElement.current.clientHeight - previousSize.current <= 37)
      previousSize.current = defaultPaneSizes.chart;
    dock.current?.expand();
    chart.current?.resize(previousSize.current);
    persist(previousSize.current);
  };
  // Choosing a tab, by its label or from elsewhere (Go to line, View issues), opens a collapsed
  // dock; what the dock showed when it mounted does not.
  const shown = useRef({ tab, line: codeLine?.seq });
  useEffect(() => {
    const previous = shown.current;
    shown.current = { tab, line: codeLine?.seq };
    if (dockCollapsed && (previous.tab !== tab || previous.line !== codeLine?.seq)) restore();
  });
  return (
    <Group
      orientation="vertical"
      className={styles.column}
      elementRef={groupElement}
      onLayoutChanged={(layout, meta) => {
        if (meta.isUserInteraction && groupElement.current)
          persist((layout.chart * groupElement.current.clientHeight) / 100);
      }}
    >
      <Panel
        id="chart"
        panelRef={chart}
        defaultSize={initialSize}
        minSize={240}
        collapsible
        collapsedSize={0}
        inert={maximized}
        aria-hidden={maximized || undefined}
        onResize={(size) => {
          setChartSize(size.inPixels);
          setMaximized(size.inPixels < 1);
        }}
      >
        {children}
      </Panel>
      <ResizeHandle
        axis="chart"
        size={chartSize}
        onReset={() => {
          dock.current?.expand();
          chart.current?.resize(defaultPaneSizes.chart);
          persist(defaultPaneSizes.chart);
        }}
      />
      <Panel
        id="dock"
        panelRef={dock}
        minSize={160}
        collapsible
        collapsedSize={36}
        onResize={(size) => setDockCollapsed(size.inPixels <= 37)}
      >
        <DockTabs
          label={t('dock.tabs')}
          value={tab}
          options={options}
          onChange={(value) => setTab(value as DockTab)}
          collapsed={dockCollapsed}
          actions={
            dockCollapsed ? (
              <IconButton icon="up" label={t('dock.expand')} onClick={restore} />
            ) : maximized ? (
              <>
                <span ref={setActionsHost} className={actionStyles.host} />
                <IconButton icon="chevron" label={t('dock.restore')} onClick={restore} />
              </>
            ) : (
              <>
                <span ref={setActionsHost} className={actionStyles.host} />
                <IconButton
                  icon="maximize"
                  label={t('dock.maximize')}
                  onClick={() => {
                    previousSize.current = chartSize;
                    chart.current?.collapse();
                    persist(0);
                  }}
                />
                <IconButton
                  icon="chevron"
                  label={t('dock.collapse')}
                  onClick={() => {
                    previousSize.current = chartSize;
                    dock.current?.collapse();
                    persist((groupElement.current?.clientHeight ?? 852) - 36);
                  }}
                />
              </>
            )
          }
        >
          <DockActionsHost.Provider value={dockCollapsed ? null : actionsHost}>
            <TabContent tab={tab} />
          </DockActionsHost.Provider>
        </DockTabs>
      </Panel>
    </Group>
  );
}
