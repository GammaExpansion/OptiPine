import { Button } from '../../../components/Button.tsx';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { useOptimizationStore } from '../../../state/optimization.ts';
import { useUiStore } from '../../../state/ui.ts';
import { parameterValue } from './results/copy.ts';
import styles from './results/Results.module.css';

/** Applying a fixed set is an explicit session action, with its workflow-owned provenance. */
export function FixedParameters() {
  const { t, text } = useI18n();
  const view = useOptimizationStore((state) => state.walkForward);
  const actions = useOptimizationStore((state) => state.actions);
  const setPage = useUiStore((state) => state.setPage);
  if (!view?.fixed || view.inProgress) return null;
  const { applyFixedParameters } = actions;
  return (
    <section className={styles.fixed} aria-label={t('optimize.wfResults.fixed')}>
      <div className={styles.fixedContent}>
        <h2>{t('optimize.wfResults.fixed')}</h2>
        <dl>
          {Object.entries(view.fixed.parameters).map(([title, value]) => (
            <div key={title}>
              <dt>{title}</dt>
              <dd>{text(parameterValue(value))}</dd>
            </div>
          ))}
        </dl>
      </div>
      <Button
        variant="primary"
        disabled={view.pending}
        disabledReason={t('optimize.wfResults.updating')}
        onClick={() => {
          void applyFixedParameters();
          setPage('backtest');
        }}
      >
        {t('optimize.wfResults.apply')}
      </Button>
    </section>
  );
}
