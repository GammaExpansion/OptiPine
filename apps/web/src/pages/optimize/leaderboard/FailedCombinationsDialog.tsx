import type { Diagnostic } from '@pine/engine';
import { Button } from '../../../components/Button.tsx';
import { Dialog } from '../../../components/Dialog.tsx';
import { Table } from '../../../components/Table.tsx';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import type { MessageId } from '../../../i18n/translate.ts';
import { useOptimizationStore } from '../../../state/optimization.ts';
import { useUiStore } from '../../../state/ui.ts';
import { failuresCsv } from '../../../workflows/optimize-views.ts';
import { useParameterActions } from '../../backtest/preview/useParameterActions.ts';
import { useResultFormat } from './useResultFormat.ts';
import styles from './Leaderboard.module.css';

const kindLabels: Record<Diagnostic['kind'], MessageId> = {
  syntax: 'issues.compileError',
  undeclared: 'issues.compileError',
  type: 'issues.compileError',
  semantic: 'issues.compileError',
  unsupported: 'issues.unsupported',
  limit: 'issues.limit',
  runtime: 'issues.runtimeError',
  internal: 'issues.engineFault',
};

export function FailedCombinationsDialog() {
  const { t } = useI18n();
  const results = useOptimizationStore((state) => state.results);
  const { parameter } = useResultFormat(results?.computedWith.search.rows);
  const setDialogOpen = useUiStore((state) => state.setDialogOpen);
  const navigation = useParameterActions();
  const close = () => setDialogOpen('failedCombinations', false);
  const failures = results?.failures ?? [];
  const exportList = () => {
    const kinds = Object.fromEntries(
      Object.entries(kindLabels).map(([kind, id]) => [kind, t(id)]),
    ) as Record<Diagnostic['kind'], string>;
    const csv = failuresCsv(
      failures,
      results?.computedWith.search.rows.map((row) => row.descriptor.title) ?? [],
      {
        kind: t('optimize.leaderboard.kind'),
        line: t('optimize.leaderboard.line'),
        bar: t('optimize.leaderboard.bar'),
        message: t('optimize.leaderboard.message'),
      },
      kinds,
    );
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = t('optimize.leaderboard.fileName');
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      size="large"
      title={t('optimize.leaderboard.failed', { count: failures.length })}
      description={t('optimize.leaderboard.failureHint', {
        count: (results?.combinations ?? 0) - failures.length,
      })}
      closeLabel={t('optimize.leaderboard.close')}
      footer={
        <div className={styles.failureFooter}>
          <p>{t('optimize.leaderboard.failureFooter')}</p>
          <Button onClick={exportList} disabled={!failures.length}>
            {t('optimize.leaderboard.export')}
          </Button>
          <Button onClick={close}>{t('optimize.leaderboard.close')}</Button>
        </div>
      }
    >
      <Table
        className={styles.failures}
        caption={t('optimize.leaderboard.failed', { count: failures.length })}
      >
        <thead>
          <tr>
            <th>{t('optimize.leaderboard.parameters')}</th>
            <th>{t('optimize.leaderboard.error')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {failures.map((failure) => (
            <tr key={failure.trialId}>
              <td>
                {Object.entries(failure.parameters).map(([title, value]) => (
                  <div key={title}>
                    {title}
                    <b> {parameter(value, title)}</b>
                  </div>
                ))}
              </td>
              <td>
                <div>{t(kindLabels[failure.kind])}</div>
                <span>
                  {t('optimize.leaderboard.location', {
                    line: failure.line,
                    bar: failure.bar === null ? t('common.unavailable') : failure.bar + 1,
                  })}
                </span>
                <code>{failure.message}</code>
              </td>
              <td>
                <Button
                  onClick={() => {
                    close();
                    navigation.preview(failure.parameters, {
                      kind: 'failed',
                      optimizationId: results!.id,
                      trialId: failure.trialId,
                    });
                  }}
                >
                  {t('optimize.leaderboard.failureBacktest')}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Dialog>
  );
}
