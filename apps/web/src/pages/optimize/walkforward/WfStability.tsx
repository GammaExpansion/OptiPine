import { useState } from 'react';
import { SegmentedControl } from '../../../components/SegmentedControl.tsx';
import { Select } from '../../../components/Select.tsx';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { formatNumber } from '../../../i18n/translate.ts';
import { useOptimizationStore } from '../../../state/optimization.ts';
import { stabilityActions } from './stability/actions.ts';
import { StabilityRows } from './stability/StabilityRows.tsx';
import { WindowMap } from './stability/WindowMap.tsx';
import styles from './stability/stability.module.css';

/** W1/W3 read the workflow's bands and surfaces; changing views never starts a run. */
export function WfStability() {
  const { t } = useI18n();
  const view = useOptimizationStore((state) => state.walkForward);
  const actions = stabilityActions(useOptimizationStore((state) => state.actions));
  const [tab, setTab] = useState('stability');
  const stability = view?.stability;
  const tolerance = stability?.tolerance ?? 0.1;
  const tolerances = [...new Set([0.05, 0.1, 0.15, 0.2, tolerance])].sort((a, b) => a - b);
  return (
    <section className={styles.panel} aria-label={t('optimize.wfStability.title')}>
      <header className={styles.header}>
        <SegmentedControl
          small
          label={t('optimize.wfStability.view')}
          value={tab}
          options={[
            { value: 'stability', label: t('optimize.wfStability.stability') },
            { value: 'map', label: t('optimize.wfStability.map') },
          ]}
          onChange={setTab}
        />
        {tab === 'stability' && (
          <label className={styles.tolerance}>
            <span>{t('optimize.wfStability.tolerance')}</span>
            <Select
              className={styles.select}
              label={t('optimize.wfStability.tolerance')}
              value={String(tolerance)}
              disabled={!stability || !actions.setStabilityTolerance}
              options={tolerances.map((value) => ({
                value: String(value),
                label: formatNumber(value, { style: 'percent', maximumFractionDigits: 1 }),
              }))}
              onChange={(value) => actions.setStabilityTolerance?.(Number(value))}
            />
          </label>
        )}
      </header>
      {tab === 'stability' ? (
        <div className={styles.stability} aria-busy={stability?.pending || view?.pending}>
          {stability ? (
            <>
              {stability.pending && (
                <p role="status" className={styles.note}>
                  {t('optimize.wfStability.updating')}
                </p>
              )}
              <StabilityRows view={view!} />
            </>
          ) : (
            <p className={styles.note} role="status">
              {t('optimize.wfStability.waiting')}
            </p>
          )}
        </div>
      ) : (
        <WindowMap />
      )}
    </section>
  );
}
