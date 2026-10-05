import { useShallow } from 'zustand/react/shallow';
import { Button } from '../components/Button.tsx';
import { Icon } from '../components/Icon.tsx';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { useOptimizationStore } from '../state/optimization.ts';
import { useUiStore } from '../state/ui.ts';
import { clockText, optimizeStatus, windowCount, type OptimizeStatus } from './optimize-status.ts';
import { useLayout } from './useLayout.ts';
import header from './Header.module.css';
import styles from './RunControls.module.css';

/** The failed combinations of the shown results, a link to R11's list (R1). */
export function FailedLink({ count }: { count: number }) {
  const { t } = useI18n();
  const setDialogOpen = useUiStore((state) => state.setDialogOpen);
  return (
    <Button variant="link" tone="danger" onClick={() => setDialogOpen('failedCombinations', true)}>
      {t('optimize.run.failedCount', { count })}
    </Button>
  );
}

function OptimizeStatusText({ status }: { status: OptimizeStatus }) {
  const { t, text } = useI18n();
  // A phone has a dedicated line for the counts; the run block and progress bar say the rest.
  const short = useLayout() === 'phone';
  switch (status.kind) {
    case 'running': {
      const label = (compact: boolean) =>
        status.window
          ? t(compact ? 'optimize.run.windowShort' : 'optimize.run.window', {
              index: status.window.index + 1,
              count: status.window.count,
            })
          : t(compact ? 'optimize.run.counts' : 'optimize.run.running', {
              done: status.done,
              total: status.combinations,
            });
      return (
        <span className={`${styles.status} ${styles.strong}`}>
          <Icon name="spinner" />
          {short ? (
            label(true)
          ) : (
            <span title={label(false)}>
              <span className={header.longFacts}>{label(false)}</span>
              <span className={header.shortFacts} aria-hidden="true">
                {label(true)}
              </span>
            </span>
          )}
        </span>
      );
    }
    case 'failed':
      return (
        <span className={`${styles.status} ${styles.danger}`}>
          {t(status.kept ? 'optimize.run.failedKept' : 'optimize.run.failed')}
        </span>
      );
    case 'outdated':
      return (
        <span className={`${styles.status} ${styles.amber}`}>
          <span className={styles.dot} />
          {t('run.outdated')}
        </span>
      );
    case 'cancelled':
      return (
        <span className={styles.status}>
          {t(status.kept ? 'optimize.run.cancelledKept' : 'optimize.run.cancelled')}
        </span>
      );
    case 'done': {
      const facts =
        status.windows !== null
          ? t('optimize.run.windowFacts', {
              windows: text(windowCount(status.windows)),
              time: clockText(status.durationMs),
            })
          : t(status.random ? 'optimize.run.randomFacts' : 'optimize.run.facts', {
              count: status.combinations,
              time: clockText(status.durationMs),
            });
      return (
        <span className={styles.status} title={facts}>
          <span className={header.longFacts}>{facts}</span>
          <span className={header.shortFacts} aria-hidden="true">
            {t('optimize.run.compactFacts', {
              count: status.windows ?? status.combinations,
              time: clockText(status.durationMs),
            })}
          </span>
          {status.failed > 0 && <FailedLink count={status.failed} />}
        </span>
      );
    }
    case 'idle':
      return <span className={styles.status}>{t('optimize.empty')}</span>;
  }
}

/**
 * The Optimize page's run status (R1, O8, R5): the last run's facts and failures, or the run in
 * progress with Cancel. Start and Re-optimize live in the run block, not here.
 */
export default function OptimizeRunControls() {
  const { t } = useI18n();
  const state = useOptimizationStore(
    useShallow((store) => ({
      run: store.run,
      results: store.results,
      outdated: store.outdated,
      cancel: store.actions.cancel,
    })),
  );
  const status = optimizeStatus(state);
  return (
    <>
      <div
        className={header.facts}
        data-kind={status.kind}
        role="group"
        aria-label={t('shell.facts')}
      >
        <OptimizeStatusText status={status} />
      </div>
      {status.kind === 'running' && (
        <Button className={header.run} icon={<Icon name="stop" size={11} />} onClick={state.cancel}>
          {t('run.cancel')}
        </Button>
      )}
    </>
  );
}
