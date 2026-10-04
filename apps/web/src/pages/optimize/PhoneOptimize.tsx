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

const validationTabs: readonly OptimizeTab[] = [
  'summary',
  'leaderboard',
  'map',
  'sensitivity',
  'settings',
];
const walkForwardTabs: readonly OptimizeTab[] = ['summary', 'windows', 'stability', 'settings'];

/**
 * The tab shown for a tab the other layout has: the windows for the leaderboard, stability for the
 * map or sensitivity, and back, so switching between R1 and W1 keeps the kind of view.
 */
const counterpart: Record<OptimizeTab, OptimizeTab> = {
  summary: 'summary',
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

/** The regions only one layout has; Summary is R1's or W1's own. */
const regions = {
  leaderboard: LeaderboardPanel,
  map: MapPanel,
  sensitivity: SensitivityPanel,
  windows: Windows,
  stability: WfStability,
};

/** A results tab: its region while there are results or a run fills them, else O1's empty state. */
function ResultsTab({
  tab,
  walkForward,
}: {
  tab: Exclude<OptimizeTab, 'settings'>;
  walkForward: boolean;
}) {
  const results = useOptimizationStore(showsResults);
  const outdated = useOptimizationStore(resultsOutdated);
  if (!results)
    return (
      <div className={styles.region}>
        <WindowPlan />
        <EmptyResults />
      </div>
    );
  const Region = tab === 'summary' ? (walkForward ? WfSummary : SummaryPanel) : regions[tab];
  return (
    <div className={styles.region} data-results data-outdated={outdated || undefined}>
      <Region />
    </div>
  );
}

/**
 * The Optimize page below 768 px (G4): Summary, Leaderboard, Parameter map, Sensitivity and
 * Settings, or while walk-forward is on display (W1) Summary, Windows, Stability and Settings; each
 * tab holds one region's slot, and the selection bar runs along the bottom. Settings holds the
 * data range and the right panel.
 */
export function PhoneOptimize() {
  const { t } = useI18n();
  const chosen = useUiStore((state) => state.optimizeTab);
  const setTab = useUiStore((state) => state.setOptimizeTab);
  const results = useOptimizationStore(showsResults);
  const walkForward = useOptimizationStore(showsWalkForward);
  const tabs = walkForward ? walkForwardTabs : validationTabs;
  const tab = tabs.includes(chosen) ? chosen : counterpart[chosen];
  return (
    <main className={styles.phone}>
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
            <ResultsTab tab={tab} walkForward={walkForward} />
          )}
        </DockTabs>
      </div>
      {results && (walkForward ? <WfSelectionBar /> : <SelectionBar />)}
    </main>
  );
}
