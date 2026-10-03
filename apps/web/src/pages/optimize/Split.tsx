import { useRef, useState, type ReactNode } from 'react';
import { Group, Panel, usePanelRef } from 'react-resizable-panels';
import { ResizeHandle } from '../../shell/ResizeHandle.tsx';
import { defaultPaneSizes, useUiStore } from '../../state/ui.ts';
import styles from './OptimizePage.module.css';

/** The Optimize page's splits, each named by the pane before its handle; `wf` ones for W1. */
export type SplitName = 'summary' | 'leaderboard' | 'map' | 'wfSummary' | 'wfTable';

const labels = {
  summary: { resize: 'optimize.setup.resizeSummary', size: 'optimize.setup.summarySize' },
  leaderboard: {
    resize: 'optimize.setup.resizeLeaderboard',
    size: 'optimize.setup.leaderboardSize',
  },
  map: { resize: 'optimize.setup.resizeMap', size: 'optimize.setup.mapSize' },
  wfSummary: { resize: 'optimize.setup.resizeWfSummary', size: 'optimize.setup.wfSummarySize' },
  wfTable: { resize: 'optimize.setup.resizeWfTable', size: 'optimize.setup.wfTableSize' },
} as const;

/**
 * Two panes with a drag handle between them (G1): `stacked` puts `first` above `second`,
 * otherwise beside it. The first pane's size is remembered for the Optimize page in pixels, and
 * double-clicking the handle restores its default.
 */
export function Split({
  name,
  stacked,
  minSize,
  restMinSize,
  first,
  second,
}: {
  name: SplitName;
  stacked: boolean;
  minSize: number;
  restMinSize: number;
  first: ReactNode;
  second: ReactNode;
}) {
  const saved = useUiStore((state) => state.paneSizes.optimize[name]);
  const setSizes = useUiStore((state) => state.setPaneSizes);
  // Keep the mount default stable: changing it while dragging resets the library's layout.
  const [initialSize] = useState(saved);
  const [size, setSize] = useState(saved);
  const group = useRef<HTMLDivElement>(null);
  const panel = usePanelRef();
  const id = `optimize-${name}`;
  const persist = (pixels: number) => setSizes('optimize', { [name]: pixels });
  return (
    <Group
      orientation={stacked ? 'vertical' : 'horizontal'}
      className={styles.split}
      elementRef={group}
      onLayoutChanged={(layout, meta) => {
        const element = group.current;
        if (meta.isUserInteraction && element)
          persist((layout[id] * (stacked ? element.clientHeight : element.clientWidth)) / 100);
      }}
    >
      <Panel
        id={id}
        panelRef={panel}
        defaultSize={initialSize}
        minSize={minSize}
        className={styles[name]}
        onResize={(next) => setSize(next.inPixels)}
      >
        {first}
      </Panel>
      <ResizeHandle
        axis={stacked ? 'chart' : 'right'}
        size={size}
        labels={labels[name]}
        onReset={() => {
          panel.current?.resize(defaultPaneSizes[name]);
          persist(defaultPaneSizes[name]);
        }}
      />
      <Panel id={`${id}-rest`} minSize={restMinSize}>
        {second}
      </Panel>
    </Group>
  );
}
