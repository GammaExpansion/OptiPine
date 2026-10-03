import { useI18n } from '../../../i18n/I18nProvider.tsx';
import styles from './DataRangeBar.module.css';

/** The dataset's span with the IS and OOS ranges, or the planned walk-forward windows (O1–O3). */
export function DataRangeBar() {
  const { t } = useI18n();
  return (
    <div className={styles.bar}>
      <span>{t('optimize.dataRange')}</span>
      <span>{t('common.unavailable')}</span>
    </div>
  );
}
