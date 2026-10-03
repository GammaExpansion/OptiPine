import { useBacktestStore } from '../../state/backtest.ts';
import { InputsSection } from './sidebar/InputsSection.tsx';
import { PropertiesSummary } from './sidebar/PropertiesSummary.tsx';
import { SidebarNotice } from './sidebar/SidebarNotice.tsx';
import styles from './Sidebar.module.css';

/** The right panel: inputs and the properties summary, with the B9 and B10 notes above them. */
export function Sidebar() {
  // After a failed compile the panel keeps the last successful one's inputs, dimmed (B10).
  const stale = useBacktestStore(
    (state) => state.compile.status === 'failed' && state.description !== null,
  );
  return (
    <div className={styles.sidebar}>
      <SidebarNotice />
      <div className={stale ? styles.stale : styles.part}>
        <InputsSection />
      </div>
      <div className={stale ? styles.stale : styles.part}>
        <PropertiesSummary />
      </div>
    </div>
  );
}
