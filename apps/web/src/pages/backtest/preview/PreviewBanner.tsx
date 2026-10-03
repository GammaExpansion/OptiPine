/** The banner over the chart while a set from the optimization is previewed (B16). */
import { useEffect, useState } from 'react';
import { Banner } from '../../../components/Banner.tsx';
import { Button } from '../../../components/Button.tsx';
import { IconButton } from '../../../components/IconButton.tsx';
import { Toast } from '../../../components/Toast.tsx';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { useBacktestStore } from '../../../state/backtest.ts';
import type { AppliedSet } from '../../../workflows/backtest.ts';
import { useResultFormat } from '../../optimize/leaderboard/useResultFormat.ts';
import { useParameterActions } from './useParameterActions.ts';
import styles from './PreviewBanner.module.css';

export function PreviewBanner() {
  const { t } = useI18n();
  const { parameter } = useResultFormat();
  const preview = useBacktestStore((state) => state.preview);
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
  const setName = (origin: AppliedSet['origin']) =>
    origin.kind === 'rank'
      ? t('optimize.leaderboard.set', { rank: origin.rank })
      : t('preview.failed');
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
            {Object.entries(preview.set).map(([title, value]) => (
              <span key={title}>
                {title}
                <b>{parameter(value)}</b>
              </span>
            ))}
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
