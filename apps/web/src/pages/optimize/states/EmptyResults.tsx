import { useI18n } from '../../../i18n/I18nProvider.tsx';
import styles from './EmptyResults.module.css';

/** Before the first complete run, the results area says what will appear there (O1). */
export function EmptyResults() {
  const { t } = useI18n();
  return (
    <section className={styles.empty}>
      <h1>{t('optimize.empty')}</h1>
      <p>{t('optimize.emptyHint')}</p>
      <p className={styles.hint}>{t('optimize.singleSetHint')}</p>
    </section>
  );
}
