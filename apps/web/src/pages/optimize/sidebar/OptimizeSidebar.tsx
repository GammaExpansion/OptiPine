import { useOptimizationStore } from '../../../state/optimization.ts';
import { Properties } from './Properties.tsx';
import { Ranking } from './Ranking.tsx';
import { RunBlock } from './RunBlock.tsx';
import { SearchRanges } from './SearchRanges.tsx';
import { Validation } from './Validation.tsx';
import styles from './OptimizeSidebar.module.css';

/**
 * The Optimize page's right panel (O1–O8): search ranges, validation, ranking and filters and
 * properties over the run block. While a run goes the settings rest, dimmed (O8); the run took a
 * snapshot of them, and the next run takes what they are then.
 */
export function OptimizeSidebar() {
  const running = useOptimizationStore((state) => state.run.status === 'running');
  return (
    <div className={styles.sidebar}>
      <div className={styles.scroll}>
        <div className={styles.sections} data-running={running || undefined} inert={running}>
          <SearchRanges />
          <Validation />
          <Ranking />
          <Properties />
        </div>
      </div>
      <RunBlock />
    </div>
  );
}
