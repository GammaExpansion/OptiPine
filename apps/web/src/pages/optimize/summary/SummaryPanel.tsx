/** The summary chart: Top 20 equity, IS vs OOS and Distribution (R1, R2, R2b, R3). */
import { useState } from 'react';
import { ProgressBar } from '../../../components/ProgressBar.tsx';
import { SegmentedControl } from '../../../components/SegmentedControl.tsx';
import { Tag } from '../../../components/Tag.tsx';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { useOptimizationStore } from '../../../state/optimization.ts';
import { DistributionChart } from './DistributionChart.tsx';
import { SummaryCanvas } from './SummaryCanvas.tsx';
import styles from './Summary.module.css';

export function SummaryPanel() {
  const { t, text } = useI18n();
  const views = useOptimizationStore((state) => state.views);
  const equity = useOptimizationStore((state) => state.topEquity);
  const run = useOptimizationStore((state) => state.run);
  const error = useOptimizationStore((state) => state.analysisError);
  const [choice, setChoice] = useState('equity');
  const live = run.status === 'running';
  // Reproduction is available after completion. Show the snapshot histogram while it runs,
  // then return to the chosen equity view without changing the user's preference.
  const available = choice === 'scatter' && views?.unvalidated ? 'equity' : choice;
  const view = live && available === 'equity' ? 'distribution' : available;
  const working = equity.status === 'running';
  const legend = (label: string, kind: string) => (
    <span className={styles.legendItem}>
      <i data-kind={kind} />
      {label}
    </span>
  );
  const failed = equity.curves.filter((curve) => curve.error);
  return (
    <section className={styles.panel} aria-label={t('optimize.summary.title')}>
      <header className={styles.heading}>
        <h2>{t('optimize.summary.title')}</h2>
        <div className={styles.legend}>
          {view === 'equity' ? (
            <>
              {legend(
                t(views?.unvalidated ? 'optimize.summary.fullRange' : 'optimize.summary.leading'),
                'equity',
              )}
              {legend(t('optimize.summary.median'), 'median')}
              {legend(t('optimize.summary.best'), 'best')}
            </>
          ) : view === 'scatter' ? (
            <>
              <span>
                {t('optimize.summary.points', { count: views?.scatter?.rank.length ?? 0 })}
              </span>
              {legend(t('optimize.summary.profit'), 'profit')}
              {legend(t('optimize.summary.loss'), 'loss')}
              {legend(t('optimize.summary.page'), 'page')}
            </>
          ) : (
            <>
              <span>
                {t('optimize.summary.histogram', {
                  count: views?.distribution.inSample.sets ?? 0,
                  width: views?.distribution.width ?? 0,
                })}
              </span>
              {legend(
                t('optimize.summary.profitable', {
                  range: t(
                    views?.unvalidated ? 'optimize.leaderboard.net' : 'optimize.leaderboard.in',
                  ),
                  count: views?.distribution.inSample.profitable ?? 0,
                }),
                'equity',
              )}
              {views?.distribution.outOfSample &&
                legend(
                  t('optimize.summary.profitable', {
                    range: t('optimize.leaderboard.out'),
                    count: views.distribution.outOfSample.profitable,
                  }),
                  'best',
                )}
            </>
          )}
        </div>
        <SegmentedControl
          small
          label={t('optimize.summary.view')}
          value={view}
          onChange={setChoice}
          options={[
            { value: 'equity', label: t('optimize.summary.equity'), disabled: live },
            {
              value: 'scatter',
              label: t('optimize.summary.scatter'),
              disabled: views?.unvalidated,
            },
            { value: 'distribution', label: t('optimize.summary.distribution') },
          ]}
        />
      </header>
      {(live || views?.unvalidated || error) && (
        <div className={styles.status} role="status">
          {live &&
            t('optimize.summary.progress', {
              completed: views?.completed ?? 0,
              total: run.progress.combinations,
            })}
          {views?.unvalidated && <Tag tone="amber">{t('optimize.summary.unvalidated')}</Tag>}
          {error && text(error)}
        </div>
      )}
      <div className={styles.body}>
        {view === 'equity' ? (
          <>
            {!live && equity.status === 'ready' && equity.curves.length > 0 && (
              <SummaryCanvas chart={{ kind: 'equity', equity }} />
            )}
            {(live || working || !equity.curves.length) && (
              <div className={styles.empty} role="status">
                {working && !live ? <ProgressBar label={t('optimize.summary.equity')} /> : null}
                {t(
                  live
                    ? 'optimize.summary.waiting'
                    : working
                      ? 'optimize.summary.computing'
                      : 'optimize.summary.noCurves',
                )}
              </div>
            )}
            {!live && !!failed.length && (
              <div
                className={styles.error}
                role="status"
                title={failed.map((curve) => text(curve.error!)).join('\n')}
              >
                {t('optimize.summary.curveErrors', { count: failed.length })}
              </div>
            )}
          </>
        ) : view === 'scatter' && views?.scatter ? (
          <SummaryCanvas chart={{ kind: 'scatter', scatter: views.scatter }} />
        ) : view === 'distribution' && views ? (
          <DistributionChart view={views.distribution} />
        ) : null}
      </div>
    </section>
  );
}
