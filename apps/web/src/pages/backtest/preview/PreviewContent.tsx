/** The banner over the chart while a set from the optimization is previewed (B16). */
import { useEffect, useState } from 'react';
import { Banner } from '../../../components/Banner.tsx';
import { Button } from '../../../components/Button.tsx';
import { IconButton } from '../../../components/IconButton.tsx';
import { Toast } from '../../../components/Toast.tsx';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { useOptimizationStore } from '../../../state/optimization.ts';
import { searchedParameters } from '../../../workflows/optimize-parameters.ts';
import { useBacktestStore } from '../../../state/backtest.ts';
import type { AppliedSet } from '../../../workflows/backtest.ts';
import { useResultFormat } from '../../optimize/leaderboard/useResultFormat.ts';
import { windowLabel } from '../../optimize/walkforward/results/copy.ts';
import { useParameterActions } from './useParameterActions.ts';
import styles from './PreviewBanner.module.css';

export function PreviewContent() {
  const { t, text } = useI18n();
  const resultRows = useOptimizationStore((state) => state.results?.computedWith.search.rows);
  const preview = useBacktestStore((state) => state.preview);
  const rows = preview?.origin.searchRows ?? resultRows;
  const { parameter } = useResultFormat(rows);
  const applied = useBacktestStore((state) => state.applied);
  const run = useBacktestStore((state) => state.run.status);
  const actions = useBacktestStore((state) => state.actions);
  const navigation = useParameterActions();
  const [dismissed, setDismissed] = useState<AppliedSet | null>(null);
  const showToast = applied && applied !== dismissed;
  useEffect(() => {
    if (!showToast) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) setDismissed(applied);
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [showToast, applied]);
  /** The set as B16 names it: a rank, a failed set, a walk-forward window or the fixed set. */
  const setName = (origin: AppliedSet['origin']) => {
    switch (origin.kind) {
      case 'rank':
        return t('optimize.leaderboard.set', { rank: origin.rank });
      case 'failed':
        return t('preview.failed');
      case 'window':
        return text(windowLabel(origin.window));
      case 'fixed':
        return t('preview.fixed');
    }
  };
  return (
    <>
      {preview && (
        <Banner
          role="status"
          className={styles.banner}
          title={t('preview.title', { set: setName(preview.origin) })}
          actions={
            <>
              <Button onClick={navigation.back}>{t('preview.back')}</Button>
              <Button variant="primary" onClick={() => void actions.setPreviewAsCurrent()}>
                {t('preview.apply')}
              </Button>
            </>
          }
        >
          <div className={styles.parameters}>
            <span>
              {searchedParameters(preview.set, rows ?? [])
                .map(({ title, value }) =>
                  typeof value === 'number'
                    ? t('preview.parameter', { title, value: parameter(value, title) })
                    : parameter(value, title),
                )
                .join(t('preview.separator'))}
            </span>
            <span>{t('preview.unchanged')}</span>
          </div>
        </Banner>
      )}
      {showToast && (
        <div className={styles.toast} role="region" aria-label={t('preview.notifications')}>
          <Toast
            role="status"
            tone={run === 'failed' || run === 'cancelled' ? 'amber' : 'success'}
            action={
              <>
                <Button title={t('preview.undoHint')} onClick={actions.undoApply}>
                  {t('preview.undo')}
                </Button>
                <Button onClick={navigation.back}>{t('preview.back')}</Button>
                <IconButton
                  icon="close"
                  label={t('preview.close')}
                  tooltip={false}
                  onClick={() => setDismissed(applied)}
                />
              </>
            }
          >
            {t(
              run === 'done'
                ? 'preview.applied'
                : run === 'failed'
                  ? 'preview.appliedFailed'
                  : run === 'cancelled'
                    ? 'preview.appliedCancelled'
                    : 'preview.applying',
              {
                set: setName(applied.origin),
              },
            )}
          </Toast>
        </div>
      )}
    </>
  );
}
