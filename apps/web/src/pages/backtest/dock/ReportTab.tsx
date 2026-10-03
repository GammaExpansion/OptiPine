import { useI18n } from '../../../i18n/I18nProvider.tsx';
import styles from './EmptyTab.module.css';

export function ReportTab() {
  const { t } = useI18n();
  return <div className={styles.empty}>{t('backtest.resultsHint')}</div>;
}
