import { lazy, Suspense, useEffect, useId, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '../components/Button.tsx';
import { Icon } from '../components/Icon.tsx';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { formatNumber } from '../i18n/translate.ts';
import { useBacktestStore } from '../state/backtest.ts';
import { useOptimizationPresence } from '../state/optimization.ts';
import { getServices } from '../state/services.ts';
import { useUiStore } from '../state/ui.ts';
import { useLayout } from './useLayout.ts';
import { disabledReason, runStatus, type RunStatus } from './run-status.ts';
import header from './Header.module.css';
import styles from './RunControls.module.css';

// The first screen needs only Backtest; Optimize loads its own status code on first use.
const OptimizeRunControls = lazy(() => import('./OptimizeRunControls.tsx'));

const seconds = (milliseconds: number) => (Math.max(0, milliseconds) / 1000).toFixed(1);
function StatusLabel({ full, short }: { full: string; short: string }) {
  return (
    <span title={full}>
      <span className={header.longFacts}>{full}</span>
      <span className={header.shortFacts} aria-hidden="true">
        {short}
      </span>
    </span>
  );
}
const backtestFacts = (
  t: ReturnType<typeof useI18n>['t'],
  status: Extract<RunStatus, { kind: 'done' }>,
) =>
  t('run.facts', {
    count: status.bars,
    bars: formatNumber(status.bars),
    seconds: seconds(status.durationMs),
  });

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

function StatusText({ status, factsId }: { status: RunStatus; factsId: string }) {
  const { t, text } = useI18n();
  const elapsed = useElapsed(status.kind === 'running' ? status.startedAt : null);
  switch (status.kind) {
    case 'running':
      return (
        <span className={`${styles.status} ${styles.strong}`}>
          <Icon name="spinner" />
          <StatusLabel
            full={t('run.running', { seconds: seconds(elapsed) })}
            short={t('run.runningShort', { seconds: seconds(elapsed) })}
          />
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
          <StatusLabel full={t('run.outdated')} short={t('run.outdatedShort')} />
        </span>
      );
    case 'cancelled':
      return (
        <span className={styles.status}>
          <StatusLabel
            full={t(status.kept ? 'run.cancelledKept' : 'run.cancelled')}
            short={t('run.cancelled')}
          />
        </span>
      );
    case 'done':
      return (
        <span id={factsId} className={styles.status}>
          {backtestFacts(t, status)}
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
  const factsId = useId();
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
      <div
        className={`${header.facts} ${header.backtestFacts}`}
        data-kind={status.kind}
        role="group"
        aria-label={t('shell.facts')}
      >
        <StatusText status={status} factsId={factsId} />
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
          aria-label={layout === 'tablet' ? t('shell.runBacktest') : undefined}
          aria-describedby={status.kind === 'done' ? factsId : undefined}
          title={
            status.kind === 'done'
              ? t('run.actionFacts', {
                  action: t('shell.runBacktest'),
                  facts: backtestFacts(t, status),
                })
              : t('shell.runBacktest')
          }
          icon={<Icon name="play" size={11} />}
          shortcut={layout === 'desktop' ? t('shell.shortcut') : undefined}
          onClick={() => void state.actions.run()}
        >
          {/* A phone says Run (G3); the narrow workbench shortens it only when needed. */}
          {layout === 'phone' ? (
            <span>{t('shell.run')}</span>
          ) : (
            <>
              <span className={header.runLong}>{t('shell.runBacktest')}</span>
              {layout === 'tablet' && (
                <span className={header.runShort} aria-hidden="true">
                  {t('shell.run')}
                </span>
              )}
            </>
          )}
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
  return loaded ? (
    <Suspense fallback={null}>
      <OptimizeRunControls />
    </Suspense>
  ) : null;
}
