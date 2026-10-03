import { useRef, useState } from 'react';
import { Group, Panel, usePanelRef } from 'react-resizable-panels';
import { DockTabs } from '../components/DockTabs.tsx';
import { IconButton } from '../components/IconButton.tsx';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { BacktestSidebar } from '../pages/backtest/BacktestSidebar.tsx';
import { EmptyChart } from '../pages/backtest/EmptyChart.tsx';
import { EmptyDock } from '../pages/backtest/EmptyDock.tsx';
import { OptimizeEmpty } from '../pages/optimize/OptimizeEmpty.tsx';
import { OptimizeSidebar } from '../pages/optimize/OptimizeSidebar.tsx';
import { defaultPaneSizes, useUiStore, type DockTab, type Page } from '../state/ui.ts';
import { ResizeHandle } from './ResizeHandle.tsx';
import styles from './Workbench.module.css';

const dockTabs: DockTab[] = ['report', 'equity', 'trades', 'code', 'issues'];

function BacktestColumn() {
  const { t } = useI18n();
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
        <EmptyChart />
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
            ...(value === 'issues' ? { count: 0 } : {}),
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
          <EmptyDock tab={tab} />
        </DockTabs>
      </Panel>
    </Group>
  );
}

export function Workbench({ page }: { page: Page }) {
  const { t } = useI18n();
  const saved = useUiStore((state) => state.paneSizes[page].right);
  const setSizes = useUiStore((state) => state.setPaneSizes);
  const [initialSize] = useState(saved);
  const [rightSize, setRightSize] = useState(saved);
  const [collapsed, setCollapsed] = useState(saved <= 33);
  const groupElement = useRef<HTMLDivElement>(null);
  const right = usePanelRef();
  const persist = (size: number) => setSizes(page, { right: size });
  return (
    <Group
      orientation="horizontal"
      className={styles.workbench}
      elementRef={groupElement}
      onLayoutChanged={(layout, meta) => {
        if (meta.isUserInteraction && groupElement.current)
          persist((layout[`${page}-right`] * groupElement.current.clientWidth) / 100);
      }}
    >
      <Panel id={`${page}-main`} minSize={600}>
        <main className={styles.main}>
          {page === 'backtest' ? <BacktestColumn /> : <OptimizeEmpty />}
        </main>
      </Panel>
      <ResizeHandle
        axis="right"
        size={rightSize}
        onReset={() => {
          right.current?.resize(defaultPaneSizes.right);
          persist(defaultPaneSizes.right);
        }}
      />
      <Panel
        id={`${page}-right`}
        panelRef={right}
        defaultSize={initialSize}
        minSize={280}
        maxSize="45%"
        collapsible
        collapsedSize={32}
        groupResizeBehavior="preserve-pixel-size"
        onResize={(size) => {
          setRightSize(size.inPixels);
          setCollapsed(size.inPixels <= 33);
        }}
      >
        <aside className={styles.sidebar} aria-label={t('layout.rightPanel')}>
          <IconButton
            className={`${styles.collapse} ${collapsed ? styles.edge : ''}`}
            icon={collapsed ? 'left' : 'right'}
            label={t(collapsed ? 'layout.expandRight' : 'layout.collapseRight')}
            aria-expanded={!collapsed}
            onClick={() => {
              if (collapsed) right.current?.resize(defaultPaneSizes.right);
              else right.current?.collapse();
              persist(collapsed ? defaultPaneSizes.right : 32);
            }}
          />
          {!collapsed && (page === 'backtest' ? <BacktestSidebar /> : <OptimizeSidebar />)}
        </aside>
      </Panel>
    </Group>
  );
}
