import { CurveCanvas } from '../../../charts/optimize/CurveCanvas.tsx';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { useOptimizationStore } from '../../../state/optimization.ts';
import { inspectCurve, useCurveInspection } from './inspection.ts';
import styles from './MapPanel.module.css';

export function ObjectiveCurve() {
  const { t } = useI18n();
  const views = useOptimizationStore((state) => state.views);
  const curve = views?.curve;
  const validated = views?.mode === 'in-out';
  const select = useOptimizationStore((state) => state.actions.select);
  const active = useCurveInspection(views);
  if (!views || !curve) return null;
  return (
    <div className={styles.body}>
      <p className={styles.axisNote}>{t('optimize.map.oneInput', { title: curve.input })}</p>
      <div className={styles.curveLegend}>
        <span>
          <i />
          {t(validated ? 'optimize.map.is' : 'optimize.map.all')}
        </span>
        {validated && (
          <span>
            <i className={styles.oos} />
            {t('optimize.map.oos')}
          </span>
        )}
        <span>
          <i className={styles.meanLine} />
          {t('optimize.map.neighbourhood')}
        </span>
      </div>
      <CurveCanvas
        curve={curve}
        searchRow={views.searchRows.find((row) => row.descriptor.title === curve.input)}
        active={active}
        onInspect={(index) => {
          const point = curve.points[index];
          if (point)
            inspectCurve({
              runId: views.runId,
              input: curve.input,
              value: point.x,
              selectionId: views.selection?.row.trialId ?? null,
            });
        }}
        onSelect={(index) => {
          const trialId = curve.points[index]?.trialId;
          if (trialId) select(trialId);
        }}
      />
    </div>
  );
}
