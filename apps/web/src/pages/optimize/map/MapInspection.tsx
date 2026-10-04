import { useMemo } from 'react';
import { HeatmapCanvas } from '../../../charts/optimize/HeatmapCanvas.tsx';
import { IconButton } from '../../../components/IconButton.tsx';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { formatNumber } from '../../../i18n/translate.ts';
import { useOptimizationStore } from '../../../state/optimization.ts';
import { binDetail, cellValues } from '../../../workflows/optimize-views.ts';
import { CellValuesTable } from './CellValuesTable.tsx';
import { inspectBin, useBinInspection, useCurveInspection } from './inspection.ts';
import { rangeLabel, valueLabel } from './map-labels.ts';
import styles from './MapPanel.module.css';

/** R7 replaces sensitivity below the map, so inspecting a bin keeps its parent map visible. */
export function BinInspection() {
  const { t, text } = useI18n();
  const views = useOptimizationStore((state) => state.views);
  const select = useOptimizationStore((state) => state.actions.select);
  const opened = useBinInspection();
  const map = views?.map;
  const rowFor = (title: string | null) =>
    views?.searchRows.find((row) => row.descriptor.title === title);
  const detail = useMemo(
    () =>
      map && opened?.map === map.panel ? binDetail(map, opened.cell, opened.panel) : undefined,
    [map, opened],
  );
  const values = useMemo(
    () => (detail && views ? cellValues(views.summary, detail.selectedCell) : null),
    [views, detail],
  );
  if (!detail || !values || !map) return null;
  const cell = detail.selectedCell;
  return (
    <section className={styles.inspection} aria-label={t('optimize.map.binDetail')}>
      <div className={styles.detailHeading}>
        <h3>{t('optimize.map.binDetail')}</h3>
        <span>
          {t('optimize.map.cellTitle', {
            x: map.x,
            y: map.y ?? '',
            xValue: text(rangeLabel(cell.xValues ?? [cell.x], rowFor(map.x))),
            yValue: text(rangeLabel(cell.yValues?.length ? cell.yValues : [cell.y], rowFor(map.y))),
          })}
        </span>
        <IconButton
          icon="close"
          label={t('optimize.map.closeDetail')}
          onClick={() => inspectBin(null)}
        />
      </div>
      <div className={styles.detailColumns}>
        <div className={styles.detailMap}>
          <HeatmapCanvas
            map={detail.localMap}
            searchRows={views?.searchRows}
            showValues
            framed={detail.mergedCells}
            selection={views?.selection?.row.parameters}
            label={t('optimize.map.detailCanvas')}
            onHover={() => {}}
            onActivate={(cell) => {
              if (cell.trialId && cell.value !== null) select(cell.trialId);
            }}
          />
          <p className={styles.note}>
            {t('optimize.map.detailHint', { count: detail.mergedCells.length })}
          </p>
        </div>
        <CellValuesTable values={values} x={map.x} y={map.y} validated={views?.mode === 'in-out'} />
      </div>
    </section>
  );
}

/** R8's figures follow the inspected point; selection still belongs to the optimization session. */
export function CurveInspection() {
  const { t, text } = useI18n();
  const curve = useOptimizationStore((state) => state.views?.curve);
  const selection = useOptimizationStore((state) => state.views?.selection);
  const validated = useOptimizationStore((state) => state.views?.mode === 'in-out');
  const inspected = useCurveInspection();
  const rows = useOptimizationStore((state) => state.views?.searchRows);
  if (!curve) return null;
  const row = rows?.find((row) => row.descriptor.title === curve.input);
  const active =
    inspected?.view === curve
      ? inspected.index
      : curve.points.findIndex((point) => point.trialId === selection?.row.trialId);
  const point = curve.points[Math.max(0, active)];
  const number = (value: number | null | undefined) =>
    value == null ? t('optimize.map.na') : formatNumber(value, { maximumFractionDigits: 2 });
  return (
    <section className={styles.inspection} aria-label={t('optimize.map.curveValues')}>
      <div className={styles.detailHeading}>
        <h3>
          {t('optimize.map.layer', { title: curve.input, value: text(valueLabel(point?.x, row)) })}
        </h3>
      </div>
      <dl className={styles.curveFacts} aria-live="polite">
        <div>
          <dt>{t(validated ? 'optimize.map.is' : 'optimize.map.all')}</dt>
          <dd>{number(point?.inSample)}</dd>
        </div>
        {validated && (
          <div>
            <dt>{t('optimize.map.oos')}</dt>
            <dd>{number(point?.outOfSample)}</dd>
          </div>
        )}
        <div>
          <dt>{t('optimize.map.neighbourhood')}</dt>
          <dd>{number(point?.neighbourhoodMean)}</dd>
        </div>
        <div>
          <dt>{t('optimize.map.nearPeak')}</dt>
          <dd>
            {curve.nearPeak
              ? text(rangeLabel([curve.nearPeak.from, curve.nearPeak.to], row))
              : t('optimize.map.na')}
          </dd>
        </div>
      </dl>
    </section>
  );
}
