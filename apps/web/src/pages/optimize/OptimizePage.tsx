/**
 * The Optimize page (WEB.md 2.4–2.6), laid out as R1, or as W1 for walk-forward. Slot owners:
 *
 * - setup: this composition and its splits, `range/DataRangeBar` at the top of the main column
 *   with the walk-forward `range/WindowPlan` over the empty results, `states/` (the O1 empty
 *   results; R5 dims the whole results area here, so the panels below do
 *   not dim themselves), the right panel `sidebar/` with the run block at its foot, and
 *   `filters/AddConditionTrigger`, the + Condition that both the leaderboard and the right panel
 *   use to open R10's popover;
 * - summary and leaderboard: `summary/SummaryPanel`, `leaderboard/LeaderboardPanel` (left, under
 *   the summary), `selection/SelectionBar` along the bottom of the main column, and
 *   `filters/ConditionPopover`, the body of R10's popover;
 * - map and sensitivity: `map/MapPanel` over `sensitivity/SensitivityPanel` (right, under the
 *   summary);
 * - walk-forward (W1–W6), in place of all three while walk-forward results or a walk-forward run
 *   are on display: `walkforward/WfSummary` at the top, `walkforward/WfTable` (left, under the
 *   summary) over `walkforward/FixedParameters`, `walkforward/WfStability` (right: Stability and
 *   Window map), and `walkforward/WfSelectionBar` along the bottom.
 *
 * The panels mount while there are results or a run fills them, and read the optimization store
 * themselves; none takes props. Dialog slots mount once at shell/DialogsRoot.
 *
 * Below 768 px `PhoneOptimize` (G4) mounts the same slots one per tab: Summary, Leaderboard,
 * Parameter map and Sensitivity each get the tab's whole width and height (390 px wide on G4, room
 * for the leaderboard's cards), or for walk-forward Summary, Windows (the table over the fixed
 * parameters) and Stability; Settings holds the data range over the right panel, and the
 * selection bar stays along the bottom. From 768 to 1279 px the right panel is a drawer (G2) beside
 * R1 or W1 as on a desktop.
 */
import { useOptimizationLoaded, useOptimizationStore } from '../../state/optimization.ts';
import { useLayout } from '../../shell/useLayout.ts';
import { Workbench } from '../../shell/Workbench.tsx';
import { LeaderboardPanel } from './leaderboard/LeaderboardPanel.tsx';
import { MapPanel } from './map/MapPanel.tsx';
import { resultsOutdated, showsResults, showsWalkForward } from './page-view.ts';
import { DataRangeBar } from './range/DataRangeBar.tsx';
import { WindowPlan } from './range/WindowPlan.tsx';
import { SelectionBar } from './selection/SelectionBar.tsx';
import { SensitivityPanel } from './sensitivity/SensitivityPanel.tsx';
import { PhoneOptimize } from './PhoneOptimize.tsx';
import { OptimizeSidebar } from './sidebar/OptimizeSidebar.tsx';
import { Split } from './Split.tsx';
import { EmptyResults } from './states/EmptyResults.tsx';
import { SummaryPanel } from './summary/SummaryPanel.tsx';
import { FixedParameters } from './walkforward/FixedParameters.tsx';
import { WfSelectionBar } from './walkforward/WfSelectionBar.tsx';
import { WfStability } from './walkforward/WfStability.tsx';
import { WfSummary } from './walkforward/WfSummary.tsx';
import { WfTable } from './walkforward/WfTable.tsx';
import styles from './OptimizePage.module.css';

/** R1: the summary over the leaderboard, beside the map over sensitivity. */
function ValidationResults() {
  return (
    <>
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
    </>
  );
}

/** W1: the stitched equity over the window table and fixed parameters, beside stability. */
function WalkForwardResults() {
  return (
    <>
      <div className={styles.fill}>
        <Split
          name="wfSummary"
          stacked
          minSize={160}
          restMinSize={200}
          first={<WfSummary />}
          second={
            <Split
              name="wfTable"
              stacked={false}
              minSize={420}
              restMinSize={320}
              first={
                <div className={styles.windows}>
                  <WfTable />
                  <FixedParameters />
                </div>
              }
              second={<WfStability />}
            />
          }
        />
      </div>
      <WfSelectionBar />
    </>
  );
}

function Results() {
  const outdated = useOptimizationStore(resultsOutdated);
  const walkForward = useOptimizationStore(showsWalkForward);
  return (
    <div className={styles.results} data-results data-outdated={outdated || undefined}>
      {walkForward ? <WalkForwardResults /> : <ValidationResults />}
    </div>
  );
}

function OptimizeMain() {
  const results = useOptimizationStore(showsResults);
  return (
    <div className={styles.page}>
      <DataRangeBar />
      {results ? (
        <Results />
      ) : (
        <>
          <WindowPlan />
          <EmptyResults />
        </>
      )}
    </div>
  );
}

/** Mounting the page loads the optimization side; its panels render once it exists. */
export function OptimizePage() {
  const loaded = useOptimizationLoaded();
  const layout = useLayout();
  if (!loaded) return null;
  if (layout === 'phone') return <PhoneOptimize />;
  return <Workbench page="optimize" main={<OptimizeMain />} sidebar={<OptimizeSidebar />} />;
}
