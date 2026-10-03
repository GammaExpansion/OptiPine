import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { useLayout } from '../../../shell/useLayout.ts';
import styles from './EmptyResults.module.css';

const hints = {
  desktop: 'optimize.emptyHint',
  tablet: 'optimize.emptyHintPanel',
  phone: 'optimize.emptyHintSettings',
} as const;

/**
 * Before the first complete run, the results area says what will appear there (O1), and where the
 * settings are: on the right, in the drawer (G2) or under Settings (G4).
 */
export function EmptyResults() {
  const { t } = useI18n();
  const layout = useLayout();
  return (
    <section className={styles.empty}>
      <h1>{t('optimize.empty')}</h1>
      <p>{t(hints[layout])}</p>
      <p className={styles.hint}>{t('optimize.singleSetHint')}</p>
    </section>
  );
}
