import { Button } from '../../../components/Button.tsx';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { useOptimizationStore } from '../../../state/optimization.ts';
import { resultsActions } from './results/actions.ts';
import { parameterValue } from './results/copy.ts';
import styles from './results/Results.module.css';

/** Applying a fixed set is an explicit session action, with its workflow-owned provenance. */
export function FixedParameters() {
  const { t, text } = useI18n();
  const view = useOptimizationStore((state) => state.walkForward);
  const actions = useOptimizationStore((state) => state.actions);
  if (!view?.fixed || view.inProgress) return null;
  const { applyFixedParameters } = resultsActions(actions);
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
        disabled={!applyFixedParameters || view.pending}
        disabledReason={t(
          view.pending ? 'optimize.wfResults.updating' : 'optimize.wfResults.actionUnavailable',
        )}
        onClick={() => applyFixedParameters?.()}
      >
        {t('optimize.wfResults.apply')}
      </Button>
    </section>
  );
}
