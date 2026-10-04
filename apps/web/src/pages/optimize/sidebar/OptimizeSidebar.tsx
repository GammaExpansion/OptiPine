import { useOptimizationStore } from '../../../state/optimization.ts';
import { Properties } from './Properties.tsx';
import { Ranking } from './Ranking.tsx';
import { RunBlock } from './RunBlock.tsx';
import { SearchRanges } from './SearchRanges.tsx';
import { Validation } from './Validation.tsx';
import styles from './OptimizeSidebar.module.css';

/**
 * The Optimize page's right panel (O1–O8): search ranges, validation, ranking and filters and
 * properties over the run block. Run setup rests, dimmed (O8); ranking and filters keep applying
 * to the streamed results immediately (WEB.md 3.1).
 */
export function OptimizeSidebar() {
  const running = useOptimizationStore((state) => state.run.status === 'running');
  return (
    <div className={styles.sidebar}>
      <div className={styles.scroll}>
        <div className={styles.sections}>
          <div
            className={styles.sections}
            data-running={running || undefined}
            inert={running}
            style={{ padding: 0 }}
          >
            <SearchRanges />
            <Validation />
          </div>
          <Ranking />
          <div
            className={styles.sections}
            data-running={running || undefined}
            inert={running}
            style={{ padding: 0 }}
          >
            <Properties />
          </div>
        </div>
      </div>
      <RunBlock />
    </div>
  );
}
