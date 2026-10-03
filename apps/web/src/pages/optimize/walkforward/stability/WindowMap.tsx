import { useMemo, useState } from 'react';
import type { Heatmap } from '@pine/optimizer';
import { HeatmapCanvas, type CellHover } from '../../../../charts/optimize/HeatmapCanvas.tsx';
import { containsSelection, heatTokens } from '../../../../charts/optimize/geometry.ts';
import { SegmentedControl } from '../../../../components/SegmentedControl.tsx';
import { Select } from '../../../../components/Select.tsx';
import { useI18n } from '../../../../i18n/I18nProvider.tsx';
import { formatNumber } from '../../../../i18n/translate.ts';
import { useOptimizationStore } from '../../../../state/optimization.ts';
import { rangeLabel, valueLabel } from '../../map/map-labels.ts';
import { stabilityActions } from './actions.ts';
import styles from './stability.module.css';

/** The workflow supplies the selected window's IS map or the mean, already binned and ranked. */
export function WindowMap() {
  const { t, text } = useI18n();
  const view = useOptimizationStore((state) => state.walkForward);
  const storeActions = useOptimizationStore((state) => state.actions);
  const actions = stabilityActions(storeActions);
  const [hover, setHover] = useState<{ map: Heatmap; hit: CellHover } | null>(null);
  const map = view?.map;
  const selected = view?.selection?.window.plan.index ?? map?.window;
  const markers = useMemo(
    () =>
      map?.chosen.map((chosen) => ({
        parameters: chosen.parameters,
        label: t('optimize.wfStability.window', { window: chosen.window + 1 }),
        selected: chosen.window === selected,
      })) ?? [],
    [map, selected, t],
  );
  const hit = hover?.map === map?.panel ? hover?.hit : undefined;
  const axes = view?.stability?.rows.map((row) => row.title) ?? [];
  const compact = (value: number | null | undefined) =>
    value == null
      ? text(valueLabel(null))
      : formatNumber(value, { notation: 'compact', maximumFractionDigits: 1 });
  if (view?.mapError)
    return (
      <p className={styles.note} role="status">
        {text(view.mapError)}
      </p>
    );
  if (!map)
    return (
      <p className={styles.note} role="status">
        {t(view?.inProgress ? 'optimize.wfStability.waiting' : 'optimize.wfStability.mapWaiting')}
      </p>
    );
  return (
    <div className={styles.map} aria-busy={view?.pending}>
      <div className={styles.mapScope}>
        <Select
          className={styles.select}
          label={t('optimize.wfStability.chooseWindow')}
          value={String(map.window)}
          disabled={!actions.selectWindow}
          options={(view?.windows ?? []).map((window) => ({
            value: String(window.plan.index),
            label: t('optimize.wfStability.window', { window: window.plan.index + 1 }),
          }))}
          onChange={(value) => actions.selectWindow?.(Number(value))}
        />
        <SegmentedControl
          small
          label={t('optimize.wfStability.scope')}
          value={map.surface}
          options={[
            {
              value: 'window',
              label: t('optimize.wfStability.windowIs', { window: map.window + 1 }),
              disabled: !actions.setWindowMapSurface,
            },
            {
              value: 'mean',
              label: t('optimize.wfStability.mean', { count: view?.windows.length ?? 0 }),
              disabled: !actions.setWindowMapSurface,
            },
          ]}
          onChange={(value) => actions.setWindowMapSurface?.(value as 'window' | 'mean')}
        />
      </div>
      <div className={styles.axes}>
        {(['x', 'y', 'z'] as const)
          .filter((axis) => axis === 'x' || (axis === 'y' ? axes.length > 1 : axes.length > 2))
          .map((axis) => (
            <label className={styles.axis} key={axis}>
              <span>{t(`optimize.map.${axis}`)}</span>
              <Select
                className={styles.select}
                label={t('optimize.map.chooseAxis', { axis: t(`optimize.map.${axis}`) })}
                value={map[axis] ?? '__none'}
                options={[
                  ...(axis === 'z' ? [{ value: '__none', label: t('optimize.map.none') }] : []),
                  ...axes.map((title) => ({ value: title, label: title })),
                ]}
                onChange={(value) => storeActions.setAxis(axis, value === '__none' ? null : value)}
              />
            </label>
          ))}
        {map.slices.map((slice) => (
          <label className={styles.axis} key={slice.title}>
            <span>{slice.title}</span>
            <Select
              className={styles.select}
              label={t('optimize.map.slice', { title: slice.title })}
              value={
                slice.mode === 'fixed' ? `value:${slice.values.indexOf(slice.value!)}` : slice.mode
              }
              options={[
                ...slice.values.map((value, index) => ({
                  value: `value:${index}`,
                  label: text(valueLabel(value)),
                })),
                { value: 'max', label: t('optimize.map.max') },
                { value: 'mean', label: t('optimize.map.mean') },
              ]}
              onChange={(value) =>
                storeActions.setSlice(
                  slice.title,
                  value === 'max' || value === 'mean'
                    ? { mode: value }
                    : { mode: 'fixed', value: slice.values[Number(value.slice(6))], pinned: true },
                )
              }
            />
          </label>
        ))}
      </div>
      <HeatmapCanvas
        key={`${map.x}:${map.y}:${map.z}:${map.surface}:${map.window}`}
        map={map.panel}
        markers={markers}
        label={t('optimize.wfStability.canvas')}
        keyboardDescription={t('optimize.wfStability.keyboard')}
        onHover={(hit) => setHover(hit ? { map: map.panel, hit } : null)}
        onActivate={(cell) => {
          const chosen = map.chosen.find((item) =>
            containsSelection(map.panel, cell, item.parameters),
          );
          if (chosen) actions.selectWindow?.(chosen.window);
        }}
      />
      <div className={styles.legend} aria-label={t('optimize.map.legend')}>
        <span>
          {t(
            map.surface === 'mean'
              ? 'optimize.wfStability.meanIs'
              : 'optimize.wfStability.windowIs',
            { count: view?.windows.length ?? 0, window: map.window + 1 },
          )}
        </span>
        <span>{compact(map.panel.display?.minimum)}</span>
        <div className={styles.ramp}>
          {heatTokens.map((token, index) => (
            <i key={token} style={{ background: `var(${token})` }}>
              {index === 3 && <span>{formatNumber(0)}</span>}
            </i>
          ))}
        </div>
        <span>{compact(map.panel.display?.maximum)}</span>
      </div>
      <p className={styles.note}>
        {t(
          selected === undefined
            ? 'optimize.wfStability.circles'
            : 'optimize.wfStability.selectedCircles',
          { window: (selected ?? 0) + 1 },
        )}
      </p>
      {hit && (
        <p className={styles.inspection} role="status">
          {t('optimize.wfStability.cell', {
            x: map.x,
            xValue: text(rangeLabel(hit.cell.xValues ?? [hit.cell.x])),
            y: map.y ?? '',
            yValue: map.y ? text(rangeLabel(hit.cell.yValues ?? [hit.cell.y])) : '',
            value: text(valueLabel(hit.cell.value)),
          })}
        </p>
      )}
    </div>
  );
}
