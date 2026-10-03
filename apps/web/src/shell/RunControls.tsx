import { useEffect, useState, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '../components/Button.tsx';
import { Icon } from '../components/Icon.tsx';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { formatNumber } from '../i18n/translate.ts';
import { useBacktestStore } from '../state/backtest.ts';
import { getServices } from '../state/services.ts';
import { useUiStore } from '../state/ui.ts';
import { disabledReason, runStatus, type RunStatus } from './run-status.ts';
import header from './Header.module.css';
import styles from './RunControls.module.css';

const seconds = (milliseconds: number) => (Math.max(0, milliseconds) / 1000).toFixed(1);

/** Rerenders every tenth of a second while a run is in progress, for the elapsed time. */
function useElapsed(startedAt: number | null): number {
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
          <Button icon={<Icon name="stop" size={11} />} onClick={state.actions.cancel}>
            {t('run.cancel')}
          </Button>
          <div className={styles.progress} role="progressbar" aria-label={t('run.progress')} />
        </>
      ) : (
        <Button
          variant="primary"
          disabled={reason !== null}
          disabledReason={reason ? text(reason) : undefined}
          aria-keyshortcuts="Control+Enter"
          icon={<Icon name="play" size={11} />}
          shortcut={t('shell.shortcut')}
          onClick={() => void state.actions.run()}
        >
          <span>{t('shell.runBacktest')}</span>
        </Button>
      )}
    </>
  );
}

export function RunControls({ facts }: { facts?: ReactNode }) {
  const { t } = useI18n();
  const page = useUiStore((state) => state.page);
  if (page === 'backtest') return <BacktestRunControls />;
  return (
    <div className={header.facts} aria-label={t('shell.facts')}>
      {facts ?? t('optimize.empty')}
    </div>
  );
}
