import { useI18n } from '../../i18n/I18nProvider.tsx';
import type { DockTab } from '../../state/ui.ts';
import styles from './EmptyDock.module.css';

export function EmptyDock({ tab }: { tab: DockTab }) {
  const { t } = useI18n();
  if (tab === 'code')
    return (
      <div className={styles.code}>
        <div className={styles.line}>
          <span className={styles.number}>{1}</span>
          <span className={styles.placeholder}>
            <i />
            {t('backtest.codePlaceholder')}
          </span>
        </div>
      </div>
    );
  return (
    <div className={styles.empty}>
      {t(tab === 'issues' ? 'backtest.issuesHint' : 'backtest.resultsHint')}
    </div>
  );
}
