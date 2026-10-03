import { DockTabs } from '../../components/DockTabs.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useOptimizationStore } from '../../state/optimization.ts';
import { useUiStore, type OptimizeTab } from '../../state/ui.ts';
import { LeaderboardPanel } from './leaderboard/LeaderboardPanel.tsx';
import { MapPanel } from './map/MapPanel.tsx';
import { resultsOutdated, showsResults } from './page-view.ts';
import { DataRangeBar } from './range/DataRangeBar.tsx';
import { WindowPlan } from './range/WindowPlan.tsx';
import { SelectionBar } from './selection/SelectionBar.tsx';
import { SensitivityPanel } from './sensitivity/SensitivityPanel.tsx';
import { OptimizeSidebar } from './sidebar/OptimizeSidebar.tsx';
import { EmptyResults } from './states/EmptyResults.tsx';
import { SummaryPanel } from './summary/SummaryPanel.tsx';
import tabsStyles from '../../shell/PhoneTabs.module.css';
import styles from './OptimizePage.module.css';

const tabs: readonly OptimizeTab[] = ['leaderboard', 'map', 'sensitivity', 'settings'];

const regions = {
  leaderboard: LeaderboardPanel,
  map: MapPanel,
  sensitivity: SensitivityPanel,
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
 * G4 keeps the summary above four tabs and the selection actions below them. Settings holds the
 * data range and the right panel; changing tabs keeps the summary's chosen view mounted.
 */
export function PhoneOptimize() {
  const { t } = useI18n();
  const tab = useUiStore((state) => state.optimizeTab);
  const setTab = useUiStore((state) => state.setOptimizeTab);
  const results = useOptimizationStore(showsResults);
  const outdated = useOptimizationStore(resultsOutdated);
  return (
    <main className={styles.phone}>
      {results && (
        <div className={styles.phoneSummary} data-results data-outdated={outdated || undefined}>
          <SummaryPanel />
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
      {results && <SelectionBar />}
    </main>
  );
}
