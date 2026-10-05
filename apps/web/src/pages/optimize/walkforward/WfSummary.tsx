import { useState } from 'react';
import { SegmentedControl } from '../../../components/SegmentedControl.tsx';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { useOptimizationStore } from '../../../state/optimization.ts';
import { figure } from './results/copy.ts';
import { SummaryChart } from './results/SummaryChart.tsx';
import type { SummaryMode } from './results/geometry.ts';
import styles from './results/Results.module.css';

/** W1/W2 display workflow equity; final totals wait for all windows (WEB.md 2.6). */
export function WfSummary() {
  const { t, text } = useI18n();
  const view = useOptimizationStore((state) => state.walkForward);
  const anchored = useOptimizationStore((state) =>
    state.run.status === 'running'
      ? state.validation.walkForward.anchored
      : (state.results?.computedWith.validation.walkForward.anchored ??
        state.validation.walkForward.anchored),
  );
  const actions = useOptimizationStore((state) => state.actions);
  const [mode, setMode] = useState<SummaryMode>('windows');
  if (!view) return null;
  const complete = !view.inProgress && view.totals.completed === view.totals.windows;
  const title = t(
    mode === 'windows' ? 'optimize.wfResults.summaryWindows' : 'optimize.wfResults.summary',
  );
  return (
    <section className={styles.summary} aria-label={title} aria-busy={view.pending}>
      <header
        className={`${styles.summaryHeader} ${mode === 'windows' ? styles.windowsHeader : ''}`}
      >
        <h2>{title}</h2>
        {complete ? (
          <div className={styles.facts}>
            <strong
              title={t('optimize.wfResults.markedToMarket')}
              data-tone={(view.totals.outOfSampleNet ?? 0) < 0 ? 'loss' : 'profit'}
            >
              {text(figure(view.totals.outOfSampleNet, 0, true))}
            </strong>
            {mode === 'stitched' && (
              <>
                <span title={t('optimize.wfResults.wfeHint')}>
                  {t('optimize.wfResults.wfe')} <b>{text(figure(view.totals.wfe, 2))}</b>
                </span>
                <span title={t('optimize.wfResults.profitableHint')}>
                  {t('optimize.wfResults.profitableWindows')}{' '}
                  <b>
                    {t('optimize.wfResults.count', {
                      count: view.totals.profitable,
                      total: view.totals.traded,
                    })}
                  </b>
                </span>
              </>
            )}
          </div>
        ) : (
          <span className={styles.muted} role="status">
            {t('optimize.wfResults.completed', {
              done: view.totals.completed,
              total: view.totals.windows,
              count: view.totals.windows,
            })}
          </span>
        )}
        <div className={styles.legend}>
          <span>
            <i />
            {t(anchored ? 'optimize.wfResults.isAnchored' : 'optimize.wfResults.is')}
          </span>
          <span>
            <i />
            {t('optimize.wfResults.oos')}
          </span>
          {mode === 'windows' && (
            <span className={styles.legendHint}>{t('optimize.wfResults.windowsHint')}</span>
          )}
        </div>
        <SegmentedControl
          small
          label={t('optimize.wfResults.view')}
          value={mode}
          onChange={(value) => setMode(value === 'windows' ? 'windows' : 'stitched')}
          options={[
            { value: 'stitched', label: t('optimize.wfResults.stitched') },
            { value: 'windows', label: t('optimize.wfResults.perWindow') },
          ]}
        />
      </header>
      {view.error && (
        <p className={styles.pending} role="alert">
          {text(view.error)}
        </p>
      )}
      {view.pending && (
        <p className={styles.pending} role="status">
          {t('optimize.wfResults.updating')}
        </p>
      )}
      <SummaryChart view={view} mode={mode} selectWindow={actions.selectWindow} />
    </section>
  );
}
