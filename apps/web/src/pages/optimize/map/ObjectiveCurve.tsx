import { CurveCanvas } from '../../../charts/optimize/CurveCanvas.tsx';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { useOptimizationStore } from '../../../state/optimization.ts';
import { inspectCurve, useCurveInspection } from './inspection.ts';
import styles from './MapPanel.module.css';

export function ObjectiveCurve() {
  const { t } = useI18n();
  const curve = useOptimizationStore((state) => state.views?.curve);
  const selection = useOptimizationStore((state) => state.views?.selection);
  const validated = useOptimizationStore((state) => state.views?.mode === 'in-out');
  const select = useOptimizationStore((state) => state.actions.select);
  const inspected = useCurveInspection();
  if (!curve) return null;
  const active = Math.max(
    0,
    Math.min(
      curve.points.length - 1,
      inspected?.view === curve
        ? inspected.index
        : curve.points.findIndex((point) => point.trialId === selection?.row.trialId),
    ),
  );
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
        active={active}
        onInspect={(index) => inspectCurve({ view: curve, index })}
        onSelect={(index) => {
          const trialId = curve.points[index]?.trialId;
          if (trialId) select(trialId);
        }}
      />
    </div>
  );
}
