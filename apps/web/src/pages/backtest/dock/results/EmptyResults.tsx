import { useI18n } from '../../../../i18n/I18nProvider.tsx';
import type { MessageId } from '../../../../i18n/translate.ts';
import styles from './Results.module.css';

/** Shared by S1 and unloaded result tabs, without importing any result calculations. */
export function EmptyResults({ message = 'backtest.resultsHint' }: { message?: MessageId }) {
  const { t } = useI18n();
  return <div className={styles.empty}>{t(message)}</div>;
}
