import { useI18n } from '../../i18n/I18nProvider.tsx';
import styles from './Sidebar.module.css';

export function Sidebar() {
  const { t } = useI18n();
  return (
    <div className={styles.sections}>
      <section>
        <h2>{t('backtest.inputs')}</h2>
        <p>{t('backtest.inputsHint')}</p>
      </section>
      <section>
        <h2>{t('backtest.properties')}</h2>
        <p>{t('backtest.propertiesHint')}</p>
      </section>
    </div>
  );
}
