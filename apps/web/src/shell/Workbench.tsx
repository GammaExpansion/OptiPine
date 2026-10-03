import { useRef, useState, type ReactNode } from 'react';
import { Group, Panel, usePanelRef } from 'react-resizable-panels';
import { IconButton } from '../components/IconButton.tsx';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { defaultPaneSizes, useUiStore, type Page } from '../state/ui.ts';
import { ResizeHandle } from './ResizeHandle.tsx';
import styles from './Workbench.module.css';

export function Workbench({
  page,
  main,
  sidebar,
}: {
  page: Page;
  main: ReactNode;
  sidebar: ReactNode;
}) {
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
