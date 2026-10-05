/** The banner over the chart while a set from the optimization is previewed (B16). */
import { useEffect, useState } from 'react';
import { Banner } from '../../../components/Banner.tsx';
import { Button } from '../../../components/Button.tsx';
import { IconButton } from '../../../components/IconButton.tsx';
import { Toast } from '../../../components/Toast.tsx';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import type { MessageId } from '../../../i18n/translate.ts';
import { useOptimizationStore } from '../../../state/optimization.ts';
import { searchedParameters } from '../../../workflows/optimize-parameters.ts';
import { useBacktestStore } from '../../../state/backtest.ts';
import type { AppliedSet } from '../../../workflows/backtest.ts';
import { useResultFormat } from '../../optimize/leaderboard/useResultFormat.ts';
import { dateRange, windowLabel } from '../../optimize/walkforward/results/copy.ts';
import { useParameterActions } from './useParameterActions.ts';
import styles from './PreviewBanner.module.css';

type Sentence = 'title' | 'applied' | 'applying' | 'appliedFailed' | 'appliedCancelled';

/**
 * A failed set and the fixed parameters have no rank or window to name, so their B16 and B17
 * sentences are their own: "Previewing the parameters of a failed set".
 */
const unnamed: Record<'failed' | 'fixed', Record<Sentence, MessageId>> = {
  failed: {
    title: 'preview.failedTitle',
    applied: 'preview.failedApplied',
    applying: 'preview.failedApplying',
    appliedFailed: 'preview.failedAppliedFailed',
    appliedCancelled: 'preview.failedAppliedCancelled',
  },
  fixed: {
    title: 'preview.fixedTitle',
    applied: 'preview.fixedApplied',
    applying: 'preview.fixedApplying',
    appliedFailed: 'preview.fixedAppliedFailed',
    appliedCancelled: 'preview.fixedAppliedCancelled',
  },
};

export function PreviewContent() {
  const { t, text } = useI18n();
  const resultRows = useOptimizationStore((state) => state.results?.computedWith.search.rows);
  const preview = useBacktestStore((state) => state.preview);
  const rows = preview?.origin.searchRows ?? resultRows;
  const { parameter, number } = useResultFormat(rows);
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
  /** A B16 or B17 sentence for the set: by its rank or walk-forward window where it has one. */
  const sentence = (origin: AppliedSet['origin'], which: Sentence) => {
    if (origin.kind === 'failed' || origin.kind === 'fixed') return t(unnamed[origin.kind][which]);
    const set =
      origin.kind === 'rank'
        ? t('optimize.leaderboard.set', { rank: origin.rank })
        : text(windowLabel(origin.window));
    return t(which === 'title' ? 'preview.title' : `preview.${which}`, { set });
  };
  return (
    <>
      {preview && (
        <Banner
          data-preview-banner
          role="status"
          className={styles.banner}
          title={sentence(preview.origin, 'title')}
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
            {preview.origin.kind === 'rank' && preview.origin.profits && (
              <span title={t('optimize.profit.help')}>
                {t(
                  preview.origin.profits.outOfSample === undefined
                    ? 'optimize.leaderboard.net'
                    : 'optimize.profit.is',
                )}{' '}
                {number(preview.origin.profits.inSample, true, 0)}
                {preview.origin.profits.outOfSample !== undefined && (
                  <>
                    {t('preview.separator')}
                    {t('optimize.profit.oos')} {number(preview.origin.profits.outOfSample, true, 0)}
                  </>
                )}
              </span>
            )}
            {preview.origin.kind === 'window' && (
              <span>
                {t('preview.windowRanges', {
                  window: text(windowLabel(preview.origin.window)),
                  inSample: text(
                    dateRange(
                      preview.origin.ranges.inSample.start,
                      preview.origin.ranges.inSample.end,
                    ),
                  ),
                  outOfSample: text(
                    dateRange(
                      preview.origin.ranges.outOfSample.start,
                      preview.origin.ranges.outOfSample.end,
                    ),
                  ),
                })}
              </span>
            )}
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
            {sentence(
              applied.origin,
              run === 'done'
                ? 'applied'
                : run === 'failed'
                  ? 'appliedFailed'
                  : run === 'cancelled'
                    ? 'appliedCancelled'
                    : 'applying',
            )}
          </Toast>
        </div>
      )}
    </>
  );
}
