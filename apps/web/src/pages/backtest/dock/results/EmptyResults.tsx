import { useI18n } from '../../../../i18n/I18nProvider.tsx';
import styles from './Results.module.css';

/** Shared by S1 and unloaded result tabs, without importing any result calculations. */
export function EmptyResults() {
  const { t } = useI18n();
  return <div className={styles.empty}>{t('backtest.resultsHint')}</div>;
}

/** A result tab whose code is still loading while a result exists: never the no-results copy. */
export function LoadingResults() {
  const { t } = useI18n();
  return (
    <div className={styles.empty} role="status" aria-busy="true">
      {t('backtest.resultsLoading')}
    </div>
  );
}
