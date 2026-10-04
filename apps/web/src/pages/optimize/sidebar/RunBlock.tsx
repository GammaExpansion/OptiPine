import { useShallow } from 'zustand/react/shallow';
import { Button } from '../../../components/Button.tsx';
import { Icon } from '../../../components/Icon.tsx';
import { ProgressBar } from '../../../components/ProgressBar.tsx';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { formatNumber } from '../../../i18n/translate.ts';
import { useOptimizationStore } from '../../../state/optimization.ts';
import { clockText, estimateText, progressView } from '../../../shell/optimize-status.ts';
import { FailedLink, useElapsed } from '../../../shell/RunControls.tsx';
import type { RunProgress } from '../../../workflows/optimize-session.ts';
import { runBlockView, type RunCaption } from './run-block.ts';
import styles from './OptimizeSidebar.module.css';

function useThreads() {
  const { t } = useI18n();
  return (count: number) =>
    count === 1 ? t('optimize.run.thread') : t('optimize.run.threads', { count });
}

function Caption({ caption }: { caption: RunCaption }) {
  const { t, text } = useI18n();
  const threads = useThreads();
  const failed = useOptimizationStore((state) => state.results?.failures.length ?? 0);
  switch (caption.kind) {
    case 'errors':
    case 'failed':
      return <span className={styles.runError}>{text(caption.reason)}</span>;
    case 'blocked':
      return <span>{text(caption.reason)}</span>;
    case 'windows':
      return (
        <span>
          {caption.windows === null
            ? t('optimize.setup.planning')
            : caption.estimatedMs === null
              ? t('optimize.run.windowsNoEstimate', {
                  windows: caption.windows,
                  combinations: caption.combinations,
                })
              : t('optimize.run.windows', {
                  windows: caption.windows,
                  combinations: caption.combinations,
                  estimate: text(estimateText(caption.estimatedMs)),
                })}
        </span>
      );
    case 'outdated':
      return <span>{t('optimize.run.outdated')}</span>;
    case 'lastRun':
      return (
        <span>
          {t('optimize.run.lastRun', {
            time: clockText(caption.durationMs),
            threads: threads(caption.threads),
          })}
          {failed > 0 && <FailedLink count={failed} />}
        </span>
      );
    case 'estimate':
      return (
        <span>
          {caption.estimatedMs === null
            ? t('optimize.run.noEstimate', { threads: threads(caption.threads) })
            : t('optimize.run.estimate', {
                estimate: text(estimateText(caption.estimatedMs)),
                threads: threads(caption.threads),
              })}
        </span>
      );
  }
}

/**
 * Progress, phase, elapsed and remaining time, threads and Cancel during a run (O8); for
 * walk-forward, the window and the combinations within it (W4).
 */
function Running({ startedAt, progress }: { startedAt: number; progress: RunProgress }) {
  const { t } = useI18n();
  const threads = useThreads();
  const cancel = useOptimizationStore((state) => state.actions.cancel);
  const configured = useOptimizationStore((state) => state.runBlock.threads);
  const elapsed = useElapsed(startedAt);
  const view = progressView(progress);
  return (
    <section className={styles.running} aria-label={t('optimize.run.label')}>
      <div className={styles.progressHead}>
        <Icon name="spinner" size={14} />
        <strong>
          {view.window
            ? t('optimize.run.window', { index: view.window.index + 1, count: view.window.count })
            : t(`optimize.run.phase.${view.phase}`)}
        </strong>
        <span className={styles.secondary}>
          {t('optimize.run.progressCount', { done: view.done, total: view.combinations })}
        </span>
        <strong className={styles.percent}>
          {t('optimize.setup.percent', { value: view.percent })}
        </strong>
      </div>
      <ProgressBar
        label={t('optimize.run.progress')}
        value={view.percent}
        valueText={t('optimize.setup.percent', { value: view.percent })}
      />
      <div className={styles.progressFoot}>
        <span className={styles.secondary}>
          {t('optimize.run.elapsed', { time: clockText(elapsed) })}
        </span>
        <span className={styles.secondary}>
          {progress.remainingMs === null
            ? t('optimize.run.estimating')
            : t('optimize.run.remaining', { time: clockText(progress.remainingMs) })}
        </span>
        <span className={styles.caption}>{threads(progress.workers || configured)}</span>
        {progress.failed > 0 && (
          <span className={styles.runError}>
            {t('optimize.run.failedCount', { count: progress.failed })}
          </span>
        )}
        <Button className={styles.cancel} icon={<Icon name="stop" size={10} />} onClick={cancel}>
          {t('run.cancel')}
        </Button>
      </div>
    </section>
  );
}

/**
 * The run block pinned under the right panel (O1, O3, O5, O6, O8, R1, R5): what Start would run
 * and its estimate, Start or Re-optimize, and the run's progress with Cancel while it goes.
 */
export function RunBlock() {
  const { t, text } = useI18n();
  const state = useOptimizationStore(
    useShallow((store) => ({
      runBlock: store.runBlock,
      readiness: store.readiness,
      run: store.run,
      results: store.results,
      outdated: store.outdated,
      validation: store.validation,
      start: store.actions.start,
    })),
  );
  if (state.run.status === 'running')
    return <Running startedAt={state.run.startedAt} progress={state.run.progress} />;
  const view = runBlockView(state);
  return (
    <section className={styles.block} aria-label={t('optimize.run.label')}>
      <div className={styles.numbers}>
        <div className={styles.runCount}>
          <strong>
            {view.count === null ? t('common.unavailable') : formatNumber(view.count)}
          </strong>
          <span>{t(view.unit === 'combos' ? 'optimize.combos' : 'optimize.run.backtests')}</span>
        </div>
        <div className={styles.runCaption}>
          <Caption caption={view.caption} />
        </div>
      </div>
      <Button
        variant="primary"
        className={styles.start}
        disabled={view.disabled !== null}
        disabledReason={view.disabled ? text(view.disabled) : undefined}
        icon={<Icon name="play" size={11} />}
        onClick={() => void state.start()}
      >
        {t(view.rerun ? 'optimize.run.reoptimize' : 'optimize.start')}
      </Button>
    </section>
  );
}
