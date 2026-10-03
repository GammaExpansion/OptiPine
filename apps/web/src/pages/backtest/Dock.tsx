import { useRef, useState, type ReactNode } from 'react';
import { Group, Panel, usePanelRef } from 'react-resizable-panels';
import { DockTabs } from '../../components/DockTabs.tsx';
import { IconButton } from '../../components/IconButton.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useBacktestStore } from '../../state/backtest.ts';
import { defaultPaneSizes, useUiStore, type DockTab } from '../../state/ui.ts';
import { backtestIssues } from '../../workflows/backtest.ts';
import { ResizeHandle } from '../../shell/ResizeHandle.tsx';
import styles from '../../shell/Workbench.module.css';
import { ReportTab } from './dock/ReportTab.tsx';
import { EquityTab } from './dock/EquityTab.tsx';
import { TradesTab } from './dock/TradesTab.tsx';
import { CodeTab } from './dock/CodeTab.tsx';
import { IssuesTab } from './dock/IssuesTab.tsx';

const dockTabs: DockTab[] = ['report', 'equity', 'trades', 'code', 'issues'];

export function Dock({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const issueCount = useBacktestStore((state) => backtestIssues(state).length);
  const tab = useUiStore((state) => state.dockTab);
  const setTab = useUiStore((state) => state.setDockTab);
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
          options={dockTabs.map((value) => ({
            value,
            label: t(`dock.${value}`),
            ...(value === 'issues' ? { count: issueCount, bad: issueCount > 0 } : {}),
          }))}
          onChange={(value) => {
            setTab(value as DockTab);
            if (dockCollapsed) restore();
          }}
          collapsed={dockCollapsed}
          actions={
            maximized || dockCollapsed ? (
              <IconButton
                icon={maximized ? 'chevron' : 'up'}
                label={t(maximized ? 'dock.restore' : 'dock.expand')}
                onClick={restore}
              />
            ) : (
              <>
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
          {tab === 'report' && <ReportTab />}
          {tab === 'equity' && <EquityTab />}
          {tab === 'trades' && <TradesTab />}
          {tab === 'code' && <CodeTab />}
          {tab === 'issues' && <IssuesTab />}
        </DockTabs>
      </Panel>
    </Group>
  );
}
