import { Button } from '../../../components/Button.tsx';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { useOptimizationStore } from '../../../state/optimization.ts';
import { resultsActions } from './results/actions.ts';
import { dateRange, figure, parameterSet, windowLabel } from './results/copy.ts';
import styles from './results/Results.module.css';

/** Selection never changes inputs; the session opens the chosen set in Backtest preview. */
export function WfSelectionBar() {
  const { t, text } = useI18n();
  const view = useOptimizationStore((state) => state.walkForward);
  const actions = useOptimizationStore((state) => state.actions);
  if (!view?.selection) return null;
  const { window, origin } = view.selection;
  const { plan } = window;
  const { previewWindow } = resultsActions(actions);
  const available = window.status === 'done' && window.parameters !== null && origin !== null;
  return (
    <section className={styles.selection} aria-label={t('optimize.wfResults.selection')}>
      <strong>{text(windowLabel(plan.index))}</strong>
      <span
        className={styles.selectionRange}
        title={t('optimize.wfResults.isRange', {
          range: dateRange(plan.inSampleStart, plan.inSampleEnd),
        })}
      >
        {t('optimize.wfResults.oos')} {text(dateRange(plan.outOfSampleStart, plan.outOfSampleEnd))}
      </span>
      <span className={styles.selectionSet} title={text(parameterSet(window.parameters, true))}>
        {window.parameters
          ? text(parameterSet(window.parameters))
          : t(`optimize.wfResults.status.${window.status}`)}
      </span>
      <div className={styles.selectionFigures}>
        <span>
          {t('optimize.wfResults.is')} <b>{text(figure(window.inSample?.netProfit, 0, true))}</b>
        </span>
        <span>
          {t('optimize.wfResults.oos')}{' '}
          <b data-tone={(window.outOfSample?.netProfit ?? 0) < 0 ? 'loss' : 'profit'}>
            {text(figure(window.outOfSample?.netProfit, 0, true))}
          </b>
        </span>
        <span>
          {t('optimize.wfResults.wfe')}{' '}
          <b data-tone={(window.wfe ?? 0) < 0 ? 'loss' : undefined}>
            {text(figure(window.wfe, 2))}
          </b>
        </span>
      </div>
      <Button
        variant="secondary"
        disabled={!available || !previewWindow || view.pending}
        disabledReason={t(
          !available
            ? 'optimize.wfResults.noSet'
            : view.pending
              ? 'optimize.wfResults.updating'
              : 'optimize.wfResults.actionUnavailable',
        )}
        onClick={() => {
          void previewWindow?.(plan.index);
        }}
      >
        {t('optimize.wfResults.viewBacktest')}
      </Button>
    </section>
  );
}
