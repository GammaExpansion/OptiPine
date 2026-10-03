import { Note } from '../../components/Note.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { useBacktestStore } from '../../state/backtest.ts';
import { InputsSection } from './sidebar/InputsSection.tsx';
import { PropertiesSummary } from './sidebar/PropertiesSummary.tsx';
import styles from './Sidebar.module.css';

/**
 * The right panel: inputs and the properties summary. An outdated result is marked in the dock
 * and the header (B9); here a changed input shows only its dot and default.
 */
export function Sidebar() {
  const { t } = useI18n();
  // After a failed compile the panel keeps the last successful one's inputs, dimmed (B10).
  const stale = useBacktestStore(
    (state) => state.compile.status === 'failed' && state.description !== null,
  );
  return (
    <div className={styles.sidebar}>
      {stale && <Note>{t('inputs.lastCompile')}</Note>}
      <div className={stale ? styles.stale : styles.part}>
        <InputsSection />
      </div>
      <div className={stale ? styles.stale : styles.part}>
        <PropertiesSummary />
      </div>
    </div>
  );
}
