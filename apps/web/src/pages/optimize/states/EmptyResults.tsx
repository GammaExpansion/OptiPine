import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { useLayout } from '../../../shell/useLayout.ts';
import { useOptimizationStore } from '../../../state/optimization.ts';
import styles from './EmptyResults.module.css';

const hints = {
  results: {
    desktop: 'optimize.emptyHint',
    tablet: 'optimize.emptyHintPanel',
    phone: 'optimize.emptyHintSettings',
  },
  walkForward: {
    desktop: 'optimize.emptyHintWalkForward',
    tablet: 'optimize.emptyHintPanelWalkForward',
    phone: 'optimize.emptyHintSettingsWalkForward',
  },
} as const;

/**
 * Before the first complete run, the results area says what will appear there (O1), and where the
 * settings are: on the right, in the drawer (G2) or under Settings (G4). Walk-forward results are
 * the per-window equity, the windows and their stability.
 */
export function EmptyResults() {
  const { t } = useI18n();
  const layout = useLayout();
  const walkForward = useOptimizationStore((state) => state.validation.mode === 'walk-forward');
  return (
    <section className={styles.empty}>
      <h1>{t('optimize.empty')}</h1>
      <p>{t(hints[walkForward ? 'walkForward' : 'results'][layout])}</p>
      <p className={styles.hint}>{t('optimize.singleSetHint')}</p>
    </section>
  );
}
