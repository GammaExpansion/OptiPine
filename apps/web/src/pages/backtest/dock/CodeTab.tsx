import { useI18n } from '../../../i18n/I18nProvider.tsx';
import styles from './CodeTab.module.css';

export function CodeTab() {
  const { t } = useI18n();
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
}
