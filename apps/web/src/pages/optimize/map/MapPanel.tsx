import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Heatmap, HeatmapCell } from '@pine/optimizer';
import { HeatmapCanvas, type CellHover } from '../../../charts/optimize/HeatmapCanvas.tsx';
import { heatTokens } from '../../../charts/optimize/geometry.ts';
import { Select } from '../../../components/Select.tsx';
import { SegmentedControl } from '../../../components/SegmentedControl.tsx';
import { ToggleSwitch } from '../../../components/ToggleSwitch.tsx';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { formatNumber } from '../../../i18n/translate.ts';
import { useOptimizationStore } from '../../../state/optimization.ts';
import { cellValues } from '../../../workflows/optimize-views.ts';
import { axisLabel, isBinnedCell, rangeLabel, valueLabel } from './map-labels.ts';
import { CellValuesTable } from './CellValuesTable.tsx';
import { ObjectiveCurve } from './ObjectiveCurve.tsx';
import { inspectBin, resetInspection } from './inspection.ts';
import styles from './MapPanel.module.css';

/** The parameter map, or the single-input curve (R4, R6–R8). */
export function MapPanel() {
  const { t, text } = useI18n();
  const views = useOptimizationStore((state) => state.views);
  const settings = useOptimizationStore((state) => state.viewSettings);
  const actions = useOptimizationStore((state) => state.actions);
  const [hover, setHover] = useState<{ map: Heatmap; hit: CellHover } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(hoverTimer.current);
      resetInspection();
    },
    [],
  );
  const map = views?.map;
  const rowFor = (title: string | null | undefined) =>
    views?.searchRows.find((row) => row.descriptor.title === title);
  const hit = hover?.map === map?.panel ? hover?.hit : undefined;
  const hoveredValues = useMemo(
    () => (hit && views ? cellValues(views.summary, hit.cell) : null),
    [views, hit],
  );
  const validated = views?.mode === 'in-out';
  const choose = (cell: HeatmapCell) => {
    if (isBinnedCell(cell)) {
      if (map?.map) inspectBin({ map: map.panel, cell });
    } else if (cell.trialId && cell.value !== null) actions.select(cell.trialId);
    setHover(null);
  };
  const cellTitle = (cell: HeatmapCell) =>
    t('optimize.map.cellTitle', {
      x: map?.x ?? '',
      y: map?.y ?? '',
      xValue: text(rangeLabel(cell.xValues ?? [cell.x], rowFor(map?.x))),
      yValue: text(rangeLabel(cell.yValues?.length ? cell.yValues : [cell.y], rowFor(map?.y))),
    });
  return (
    <section
      className={styles.panel}
      aria-label={t('optimize.map.title')}
      aria-busy={views?.pending}
    >
      <header className={styles.header}>
        <h2>{t(views?.curve ? 'optimize.map.curve' : 'optimize.map.title')}</h2>
        {validated && !views?.curve && (
          <SegmentedControl
            small
            label={t('optimize.map.surface')}
            value={settings.surface}
            options={[
              { value: 'in', label: t('optimize.map.is') },
              { value: 'out', label: t('optimize.map.oos') },
            ]}
            onChange={(value) => actions.setSurface(value as 'in' | 'out')}
          />
        )}
        <label className={styles.smooth}>
          <span>{t('optimize.map.smooth')}</span>
          <ToggleSwitch
            label={t('optimize.map.smoothHint')}
            checked={settings.smooth}
            onCheckedChange={actions.setSmooth}
          />
        </label>
      </header>
      {!views ? (
        <p className={styles.note}>{t('optimize.map.waiting')}</p>
      ) : views.mapError ? (
        <p className={styles.note} role="status">
          {text(views.mapError)}
        </p>
      ) : views.curve ? (
        <ObjectiveCurve />
      ) : map ? (
        <>
          <div className={styles.axes}>
            {(['x', 'y', 'z'] as const)
              .filter((role) => role !== 'z' || views.leaderboard.columns.length > 2)
              .map((role) => (
                <label className={styles.axis} key={role}>
                  <span>{t(`optimize.map.${role}`)}</span>
                  <Select
                    label={t('optimize.map.chooseAxis', { axis: t(`optimize.map.${role}`) })}
                    className={styles.select}
                    value={map[role] ?? '__none'}
                    options={[
                      ...(role === 'z' ? [{ value: '__none', label: t('optimize.map.none') }] : []),
                      ...views.leaderboard.columns.map((title) => ({ value: title, label: title })),
                    ]}
                    onChange={(value) => actions.setAxis(role, value === '__none' ? null : value)}
                  />
                </label>
              ))}
            {map.slices.map((slice) => (
              <label className={styles.axis} key={slice.title}>
                <span>{slice.title}</span>
                <Select
                  label={t('optimize.map.slice', { title: slice.title })}
                  className={styles.select}
                  value={
                    slice.mode === 'fixed'
                      ? `value:${slice.values.indexOf(slice.value!)}`
                      : slice.mode
                  }
                  options={[
                    ...slice.values.map((value, index) => ({
                      value: `value:${index}`,
                      label: text(valueLabel(value, rowFor(slice.title))),
                    })),
                    { value: 'max', label: t('optimize.map.max') },
                    { value: 'mean', label: t('optimize.map.mean') },
                  ]}
                  onChange={(value) =>
                    actions.setSlice(
                      slice.title,
                      value === 'max' || value === 'mean'
                        ? { mode: value }
                        : {
                            mode: 'fixed',
                            value: slice.values[Number(value.slice(6))],
                            pinned: true,
                          },
                    )
                  }
                />
              </label>
            ))}
          </div>
          <div className={styles.body}>
            {(map.panel.display?.yBinSize ?? 1) > 1 && (
              <p className={styles.axisNote}>
                {text(axisLabel(map.y ?? '', map.panel.display!.yBinSize))}
              </p>
            )}
            <HeatmapCanvas
              map={map.panel}
              searchRows={views.searchRows}
              selection={views.selection?.row.parameters}
              label={t('optimize.map.canvas')}
              onHover={(hit) => {
                clearTimeout(hoverTimer.current);
                if (hit) setHover({ map: map.panel, hit });
                else hoverTimer.current = setTimeout(() => setHover(null), 150);
              }}
              onActivate={choose}
            />
            <div className={styles.legend} aria-label={t('optimize.map.legend')}>
              <span>{t(`optimize.map.objective.${settings.objective}`)}</span>
              <span>
                {map.panel.display?.minimum == null
                  ? t('optimize.map.na')
                  : formatNumber(map.panel.display.minimum, {
                      maximumFractionDigits: 1,
                      notation: 'compact',
                    })}
              </span>
              <div className={styles.ramp}>
                {heatTokens.map((token, index) => (
                  <i key={token} style={{ background: `var(${token})` }}>
                    {index === 3 && <span>{formatNumber(0)}</span>}
                  </i>
                ))}
              </div>
              <span>
                {map.panel.display?.maximum == null
                  ? t('optimize.map.na')
                  : formatNumber(map.panel.display.maximum, {
                      maximumFractionDigits: 1,
                      notation: 'compact',
                    })}
              </span>
              {map.panel.cells.some((cell) => cell.value === null) && (
                <span className={styles.missing}>
                  {t(views.inProgress ? 'optimize.map.incomplete' : 'optimize.map.notSampled')}
                </span>
              )}
            </div>
          </div>
          {hit &&
            hoveredValues &&
            createPortal(
              <div
                role="tooltip"
                className={styles.hover}
                onPointerEnter={() => clearTimeout(hoverTimer.current)}
                onPointerLeave={() => setHover(null)}
                style={{
                  left: Math.max(8, Math.min(hit.left - 140, window.innerWidth - 300)),
                  top: Math.max(8, Math.min(hit.top + 18, window.innerHeight - 320)),
                }}
              >
                <strong>{cellTitle(hit.cell)}</strong>
                {!map.map && isBinnedCell(hit.cell) ? (
                  <>
                    <p>{t('optimize.map.liveMean', { value: text(valueLabel(hit.cell.value)) })}</p>
                    <p className={styles.note}>{t('optimize.map.liveDetail')}</p>
                  </>
                ) : (
                  <CellValuesTable
                    values={hoveredValues}
                    x={map.x}
                    y={map.y}
                    validated={validated}
                  />
                )}
                <span className={styles.note}>
                  {t(isBinnedCell(hit.cell) ? 'optimize.map.openDetail' : 'optimize.map.selectSet')}
                </span>
              </div>,
              document.body,
            )}
        </>
      ) : (
        <p className={styles.note}>{t('optimize.map.noAxes')}</p>
      )}
    </section>
  );
}
