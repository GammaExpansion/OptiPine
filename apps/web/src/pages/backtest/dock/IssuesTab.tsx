import { useI18n } from '../../../i18n/I18nProvider.tsx';
import styles from './EmptyTab.module.css';

export function IssuesTab() {
  const { t } = useI18n();
  return <div className={styles.empty}>{t('backtest.issuesHint')}</div>;
}
