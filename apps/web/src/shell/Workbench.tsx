import { lazy, Suspense, useRef, useState, type ReactNode } from 'react';
import { Group, Panel, usePanelRef } from 'react-resizable-panels';
import { IconButton } from '../components/IconButton.tsx';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { defaultPaneSizes, useUiStore, type Page } from '../state/ui.ts';
import { ResizeHandle } from './ResizeHandle.tsx';
import { useLayout } from './useLayout.ts';
import styles from './Workbench.module.css';

// A desktop never needs the drawer or the modal layer behind it.
const RightDrawer = lazy(() =>
  import('./RightDrawer.tsx').then((module) => ({ default: module.RightDrawer })),
);

interface WorkbenchProps {
  page: Page;
  main: ReactNode;
  sidebar: ReactNode;
}

/**
 * A page's main column and right panel: side by side with a drag handle on a desktop (G1), the
 * panel as a drawer over the page on a tablet (G2). Pages lay out a phone's single column
 * themselves (G3, G4).
 */
export function Workbench(props: WorkbenchProps) {
  const layout = useLayout();
  if (layout === 'desktop') return <Panes {...props} />;
  return (
    <div className={styles.single}>
      <main className={styles.main}>{props.main}</main>
      <Suspense fallback={null}>
        <RightDrawer>{props.sidebar}</RightDrawer>
      </Suspense>
    </div>
  );
}

function Panes({ page, main, sidebar }: WorkbenchProps) {
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
        <main className={styles.main}>{main}</main>
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
          {!collapsed && sidebar}
        </aside>
      </Panel>
    </Group>
  );
}
