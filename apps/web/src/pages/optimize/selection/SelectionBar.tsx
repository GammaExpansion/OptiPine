/** The selected set with View backtest and Apply to inputs (WEB.md 3.3). */
import { Button } from '../../../components/Button.tsx';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { useOptimizationStore } from '../../../state/optimization.ts';
import { useParameterActions } from '../../backtest/preview/useParameterActions.ts';
import { useResultFormat } from '../leaderboard/useResultFormat.ts';
import { searchedParameters } from '../../../workflows/optimize-parameters.ts';
import styles from './SelectionBar.module.css';

export function SelectionBar() {
  const { t } = useI18n();
  const rows = useOptimizationStore((state) => state.views?.searchRows);
  const { number, parameter } = useResultFormat(rows);
  const selection = useOptimizationStore((state) => state.views?.selection);
  const inProgress = useOptimizationStore((state) => state.run.status === 'running');
  const actions = useParameterActions();
  if (!selection) return null;
  const { row, origin } = selection;
  return (
    <section className={styles.bar} aria-label={t('optimize.selection.label')}>
      <strong className={styles.rank}>{t('optimize.leaderboard.set', { rank: row.rank })}</strong>
      <div className={styles.details}>
        <div className={styles.parameters}>
          {searchedParameters(row.parameters, rows ?? []).map(({ title, value }) => (
            <span key={title}>
              <span>{title}</span>
              <b>{parameter(value, title)}</b>
            </span>
          ))}
        </div>
        <div className={styles.metrics}>
          <span>
            {t(row.outOfSample ? 'optimize.leaderboard.in' : 'optimize.leaderboard.net')}
            <b data-profit={(row.inSample.netProfit ?? 0) >= 0}>
              {number(row.inSample.netProfit, true)}
            </b>
          </span>
          {row.outOfSample && (
            <span>
              {t('optimize.leaderboard.out')}
              <b data-profit={(row.outOfSample.netProfit ?? 0) >= 0}>
                {number(row.outOfSample.netProfit, true)}
              </b>
            </span>
          )}
          <span>
            {t('optimize.selection.neighbourhood')}
            <b>{number(row.neighbourhoodMean, true)}</b>
          </span>
        </div>
      </div>
      <div className={styles.actions}>
        <Button
          disabled={inProgress}
          disabledReason={t('optimize.selection.wait')}
          onClick={() => actions.preview(row.parameters, origin)}
        >
          {t('optimize.selection.backtest')}
        </Button>
        <Button
          variant="primary"
          disabled={inProgress}
          disabledReason={t('optimize.selection.wait')}
          onClick={() => actions.apply(row.parameters, origin)}
        >
          {t('optimize.selection.apply')}
        </Button>
      </div>
    </section>
  );
}
