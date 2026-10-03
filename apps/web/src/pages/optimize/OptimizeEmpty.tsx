import { useI18n } from '../../i18n/I18nProvider.tsx';
import styles from './OptimizeEmpty.module.css';

export function OptimizeEmpty() {
  const { t } = useI18n();
  return (
    <div className={styles.page}>
      <div className={styles.range}>
        <span>{t('optimize.dataRange')}</span>
        <span>{t('common.unavailable')}</span>
      </div>
      <section className={styles.empty}>
        <h1>{t('optimize.empty')}</h1>
        <p>{t('optimize.emptyHint')}</p>
        <p className={styles.hint}>{t('optimize.singleSetHint')}</p>
      </section>
    </div>
  );
}
