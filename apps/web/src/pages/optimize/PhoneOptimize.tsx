import { DockTabs } from '../../components/DockTabs.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useOptimizationStore } from '../../state/optimization.ts';
import { useUiStore, type OptimizeTab } from '../../state/ui.ts';
import { LeaderboardPanel } from './leaderboard/LeaderboardPanel.tsx';
import { MapPanel } from './map/MapPanel.tsx';
import { resultsOutdated, showsResults, showsWalkForward } from './page-view.ts';
import { DataRangeBar } from './range/DataRangeBar.tsx';
import { WindowPlan } from './range/WindowPlan.tsx';
import { SelectionBar } from './selection/SelectionBar.tsx';
import { SensitivityPanel } from './sensitivity/SensitivityPanel.tsx';
import { OptimizeSidebar } from './sidebar/OptimizeSidebar.tsx';
import { EmptyResults } from './states/EmptyResults.tsx';
import { SummaryPanel } from './summary/SummaryPanel.tsx';
import { FixedParameters } from './walkforward/FixedParameters.tsx';
import { WfSelectionBar } from './walkforward/WfSelectionBar.tsx';
import { WfStability } from './walkforward/WfStability.tsx';
import { WfSummary } from './walkforward/WfSummary.tsx';
import { WfTable } from './walkforward/WfTable.tsx';
import tabsStyles from '../../shell/PhoneTabs.module.css';
import styles from './OptimizePage.module.css';

const validationTabs: readonly OptimizeTab[] = ['leaderboard', 'map', 'sensitivity', 'settings'];
const walkForwardTabs: readonly OptimizeTab[] = ['windows', 'stability', 'settings'];

/**
 * The tab shown for a tab the other layout has: the windows for the leaderboard, stability for the
 * map or sensitivity, and back, so switching between R1 and W1 keeps the kind of view.
 */
const counterpart: Record<OptimizeTab, OptimizeTab> = {
  leaderboard: 'windows',
  map: 'stability',
  sensitivity: 'stability',
  windows: 'leaderboard',
  stability: 'map',
  settings: 'settings',
};

/** W1's per-window table with the fixed-parameters card at its foot, as on a desktop. */
function Windows() {
  return (
    <div className={styles.windows}>
      <WfTable />
      <FixedParameters />
    </div>
  );
}

const regions = {
  leaderboard: LeaderboardPanel,
  map: MapPanel,
  sensitivity: SensitivityPanel,
  windows: Windows,
  stability: WfStability,
};

/** A results tab: its region while there are results or a run fills them, else O1's empty state. */
function ResultsTab({ tab }: { tab: Exclude<OptimizeTab, 'settings'> }) {
  const results = useOptimizationStore(showsResults);
  const outdated = useOptimizationStore(resultsOutdated);
  const Region = regions[tab];
  if (!results)
    return (
      <div className={styles.region}>
        <WindowPlan />
        <EmptyResults />
      </div>
    );
  return (
    <div className={styles.region} data-results data-outdated={outdated || undefined}>
      <Region />
    </div>
  );
}

/**
 * The Optimize page below 768 px (G4): the summary above the tabs and the selection bar below
 * them. R1 shows its summary over Leaderboard, Parameter map, Sensitivity and Settings; W1 its
 * stitched equity over Windows, Stability and Settings. Settings holds the data range and the
 * right panel; changing tabs keeps the summary's chosen view mounted.
 */
export function PhoneOptimize() {
  const { t } = useI18n();
  const chosen = useUiStore((state) => state.optimizeTab);
  const setTab = useUiStore((state) => state.setOptimizeTab);
  const results = useOptimizationStore(showsResults);
  const outdated = useOptimizationStore(resultsOutdated);
  const walkForward = useOptimizationStore(showsWalkForward);
  const tabs = walkForward ? walkForwardTabs : validationTabs;
  const tab = tabs.includes(chosen) ? chosen : counterpart[chosen];
  const Summary = walkForward ? WfSummary : SummaryPanel;
  // O1's empty state holds the page's h1; elsewhere the page names itself, out of sight.
  const emptyState = !results && tab !== 'settings';
  return (
    <main className={styles.phone}>
      {!emptyState && <h1 className={styles.pageTitle}>{t('shell.optimize')}</h1>}
      {results && (
        <div className={styles.phoneSummary} data-results data-outdated={outdated || undefined}>
          <Summary />
        </div>
      )}
      <div className={tabsStyles.tabs}>
        <DockTabs
          label={t('layout.sections')}
          value={tab}
          options={tabs.map((value) => ({ value, label: t(`layout.${value}`) }))}
          onChange={(value) => setTab(value as OptimizeTab)}
        >
          {tab === 'settings' ? (
            <div className={styles.settings}>
              <DataRangeBar />
              <OptimizeSidebar />
            </div>
          ) : (
            <ResultsTab tab={tab} />
          )}
        </DockTabs>
      </div>
      {results && (walkForward ? <WfSelectionBar /> : <SelectionBar />)}
    </main>
  );
}
