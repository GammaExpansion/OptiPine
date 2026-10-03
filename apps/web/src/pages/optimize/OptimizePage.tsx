/**
 * The Optimize page (WEB.md 2.4, 2.5), laid out as R1. Slot owners:
 *
 * - setup: this composition and its splits, `range/DataRangeBar` at the top of the main column,
 *   `states/` (the O1 empty results; R5 dims the whole results area here, so the panels below do
 *   not dim themselves), the right panel `sidebar/` with the run block at its foot, and
 *   `filters/`, the shared trigger of R10's add-condition popover;
 * - summary and leaderboard: `summary/SummaryPanel`, `leaderboard/LeaderboardPanel` (left, under
 *   the summary) and `selection/SelectionBar` along the bottom of the main column;
 * - map and sensitivity: `map/MapPanel` over `sensitivity/SensitivityPanel` (right, under the
 *   summary).
 *
 * The panels mount while there are results or a run fills them, and read the optimization store
 * themselves; none takes props. Dialog slots mount once at shell/DialogsRoot.
 */
import { useOptimizationStore } from '../../state/optimization.ts';
import { Workbench } from '../../shell/Workbench.tsx';
import { LeaderboardPanel } from './leaderboard/LeaderboardPanel.tsx';
import { MapPanel } from './map/MapPanel.tsx';
import { OptimizeSidebar } from './OptimizeSidebar.tsx';
import { resultsOutdated, showsResults } from './page-view.ts';
import { DataRangeBar } from './range/DataRangeBar.tsx';
import { SelectionBar } from './selection/SelectionBar.tsx';
import { SensitivityPanel } from './sensitivity/SensitivityPanel.tsx';
import { Split } from './Split.tsx';
import { EmptyResults } from './states/EmptyResults.tsx';
import { SummaryPanel } from './summary/SummaryPanel.tsx';
import styles from './OptimizePage.module.css';

function Results() {
  const outdated = useOptimizationStore(resultsOutdated);
  return (
    <div className={styles.results} data-results data-outdated={outdated || undefined}>
      <div className={styles.fill}>
        <Split
          name="summary"
          stacked
          minSize={160}
          restMinSize={200}
          first={<SummaryPanel />}
          second={
            <Split
              name="leaderboard"
              stacked={false}
              minSize={320}
              restMinSize={320}
              first={<LeaderboardPanel />}
              second={
                <Split
                  name="map"
                  stacked
                  minSize={200}
                  restMinSize={100}
                  first={<MapPanel />}
                  second={<SensitivityPanel />}
                />
              }
            />
          }
        />
      </div>
      <SelectionBar />
    </div>
  );
}

function OptimizeMain() {
  const results = useOptimizationStore(showsResults);
  return (
    <div className={styles.page}>
      <DataRangeBar />
      {results ? <Results /> : <EmptyResults />}
    </div>
  );
}

export function OptimizePage() {
  return <Workbench page="optimize" main={<OptimizeMain />} sidebar={<OptimizeSidebar />} />;
}
