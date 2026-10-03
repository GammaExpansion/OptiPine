import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '../components/Button.tsx';
import { Icon } from '../components/Icon.tsx';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { formatNumber } from '../i18n/translate.ts';
import { useBacktestStore } from '../state/backtest.ts';
import { useOptimizationPresence, useOptimizationStore } from '../state/optimization.ts';
import { getServices } from '../state/services.ts';
import { useUiStore } from '../state/ui.ts';
import { clockText, optimizeStatus, windowCount, type OptimizeStatus } from './optimize-status.ts';
import { useLayout } from './useLayout.ts';
import { disabledReason, runStatus, type RunStatus } from './run-status.ts';
import header from './Header.module.css';
import styles from './RunControls.module.css';

const seconds = (milliseconds: number) => (Math.max(0, milliseconds) / 1000).toFixed(1);

/** Rerenders every tenth of a second while a run is in progress, for the elapsed time. */
export function useElapsed(startedAt: number | null): number {
  const now = getServices().now;
  const [time, setTime] = useState(now);
  useEffect(() => {
    if (startedAt === null) return;
    setTime(now());
    const timer = setInterval(() => setTime(now()), 100);
    return () => clearInterval(timer);
  }, [startedAt, now]);
  return startedAt === null ? 0 : time - startedAt;
}

function StatusText({ status }: { status: RunStatus }) {
  const { t, text } = useI18n();
  const elapsed = useElapsed(status.kind === 'running' ? status.startedAt : null);
  switch (status.kind) {
    case 'running':
      return (
        <span className={`${styles.status} ${styles.strong}`}>
          <Icon name="spinner" />
          {t('run.running', { seconds: seconds(elapsed) })}
        </span>
      );
    case 'compileFailed': {
      const { errors, unsupported } = status;
      return (
        <span className={`${styles.status} ${styles.danger}`}>
          {errors > 1
            ? t('run.compileErrors', { count: errors })
            : errors === 1
              ? t('run.compileError')
              : unsupported > 1
                ? t('run.unsupportedFeatures', { count: unsupported })
                : unsupported === 1
                  ? t('run.unsupportedFeature')
                  : t('run.compileFailed')}
        </span>
      );
    }
    case 'runFailed':
      return <span className={`${styles.status} ${styles.danger}`}>{t('run.failed')}</span>;
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
          {t(status.kept ? 'run.cancelledKept' : 'run.cancelled')}
        </span>
      );
    case 'done':
      return (
        <span className={styles.status}>
          {t('run.facts', {
            bars: formatNumber(status.bars),
            seconds: seconds(status.durationMs),
          })}
        </span>
      );
    case 'blocked':
      // FirstLaunch's disabled run step is described by this element.
      return (
        <span className={styles.status} id="run-missing">
          {text(status.reason)}
        </span>
      );
    case 'ready':
      return null;
  }
}

/** The Backtest page's run status and main action (G5 run status, B1, B8–B12). */
function BacktestRunControls() {
  const { t, text } = useI18n();
  const layout = useLayout();
  const state = useBacktestStore(
    useShallow((store) => ({
      compile: store.compile,
      run: store.run,
      result: store.result,
      outdated: store.outdated,
      readiness: store.readiness,
      preview: store.preview,
      actions: store.actions,
    })),
  );
  const status = runStatus(state);
  const reason = disabledReason((state.preview ?? state).readiness);
  return (
    <>
      <div className={header.facts} aria-label={t('shell.facts')}>
        <StatusText status={status} />
      </div>
      {status.kind === 'running' ? (
        <>
          <Button
            className={header.run}
            icon={<Icon name="stop" size={11} />}
            onClick={state.actions.cancel}
          >
            {t('run.cancel')}
          </Button>
          <div className={styles.progress} role="progressbar" aria-label={t('run.progress')} />
        </>
      ) : (
        <Button
          variant="primary"
          className={header.run}
          disabled={reason !== null}
          disabledReason={reason ? text(reason) : undefined}
          aria-keyshortcuts="Control+Enter"
          icon={<Icon name="play" size={11} />}
          shortcut={layout === 'desktop' ? t('shell.shortcut') : undefined}
          onClick={() => void state.actions.run()}
        >
          {/* A phone's header says Run (G3); a tablet's says it below 1024 px. */}
          {layout === 'phone' ? (
            <span>{t('shell.run')}</span>
          ) : (
            <>
              <span className={header.runLong}>{t('shell.runBacktest')}</span>
              {layout === 'tablet' && <span className={header.runShort}>{t('shell.run')}</span>}
            </>
          )}
        </Button>
      )}
    </>
  );
}

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
  switch (status.kind) {
    case 'running':
      return (
        <span className={`${styles.status} ${styles.strong}`}>
          <Icon name="spinner" />
          {status.window
            ? t('optimize.run.window', {
                index: status.window.index + 1,
                count: status.window.count,
              })
            : t('optimize.run.running', { done: status.done, total: status.combinations })}
        </span>
      );
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
    case 'done':
      return (
        <span className={styles.status}>
          {status.windows !== null
            ? t('optimize.run.windowFacts', {
                windows: text(windowCount(status.windows)),
                time: clockText(status.durationMs),
              })
            : t(status.random ? 'optimize.run.randomFacts' : 'optimize.run.facts', {
                count: status.combinations,
                time: clockText(status.durationMs),
              })}
          {status.failed > 0 && <FailedLink count={status.failed} />}
        </span>
      );
    case 'idle':
      return <span className={styles.status}>{t('optimize.empty')}</span>;
  }
}

/**
 * The Optimize page's run status (R1, O8, R5): the last run's facts and failures, or the run in
 * progress with Cancel. Start and Re-optimize live in the run block, not here.
 */
function OptimizeRunControls() {
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
      <div className={header.facts} aria-label={t('shell.facts')}>
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

export function RunControls() {
  const page = useUiStore((state) => state.page);
  // The Optimize page loads the optimization side as it opens; its status follows.
  const loaded = useOptimizationPresence((presence) => presence.loaded);
  if (page === 'backtest') return <BacktestRunControls />;
  return loaded ? <OptimizeRunControls /> : null;
}
