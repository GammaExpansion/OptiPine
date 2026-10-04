import { useState } from 'react';
import type { CellValues } from '../../../workflows/optimize-views.ts';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { useOptimizationStore } from '../../../state/optimization.ts';
import { useResultFormat } from '../leaderboard/useResultFormat.ts';
import { valueLabel } from './map-labels.ts';
import styles from './MapPanel.module.css';

/** Rows a scrolling list shows before it scrolls, under its header. */
const shownRows = 8;

/**
 * A cell's values and their mean. In a tooltip the list scrolls past `shownRows` and says so, and
 * only the visible values mount, even when a bin covers thousands of original combinations; in
 * the bin detail (`scroll` false) the panel scrolls instead, so the list has no scroll of its own.
 */
export function CellValuesTable({
  values,
  x,
  y,
  validated,
  scroll = true,
}: {
  values: CellValues;
  x: string;
  y: string | null;
  validated: boolean;
  scroll?: boolean;
}) {
  const { t, text } = useI18n();
  const rows = useOptimizationStore((state) => state.views?.searchRows);
  const xRow = rows?.find((row) => row.descriptor.title === x);
  const yRow = rows?.find((row) => row.descriptor.title === y);
  const [start, setStart] = useState(0);
  const visible = scroll ? shownRows + 2 : values.values.length;
  const from = Math.min(start, Math.max(0, values.values.length - visible));
  const showY = y && values.values.some((value) => value.y !== values.values[0]?.y);
  const objective = useOptimizationStore((state) => state.viewSettings.objective);
  const format = useResultFormat(rows);
  const number = (value: number | null) => format.objective(value, objective);
  return (
    <div className={styles.values}>
      <div
        className={scroll ? styles.valueScroll : undefined}
        onScroll={(event) =>
          setStart(Math.max(0, Math.floor(event.currentTarget.scrollTop / 24) - 1))
        }
      >
        <table aria-label={t('optimize.map.coveredValues')}>
          <thead>
            <tr>
              <th>{showY ? t('optimize.map.pair', { x, y }) : x}</th>
              <th>{t(validated ? 'optimize.map.is' : 'optimize.map.all')}</th>
              {validated && <th>{t('optimize.map.oos')}</th>}
            </tr>
          </thead>
          <tbody>
            {from > 0 && (
              <tr aria-hidden="true">
                <td style={{ height: from * 24, padding: 0 }} />
              </tr>
            )}
            {values.values.slice(from, from + visible).map((value, index) => (
              <tr key={from + index}>
                <td>
                  {showY
                    ? t('optimize.map.pair', {
                        x: text(valueLabel(value.x, xRow)),
                        y: text(valueLabel(value.y, yRow)),
                      })
                    : text(valueLabel(value.x, xRow))}
                </td>
                <td data-sign={Math.sign(value.inSample ?? 0)}>{number(value.inSample)}</td>
                {validated && (
                  <td data-sign={Math.sign(value.outOfSample ?? 0)}>{number(value.outOfSample)}</td>
                )}
              </tr>
            ))}
            {from + visible < values.values.length && (
              <tr aria-hidden="true">
                <td style={{ height: (values.values.length - from - visible) * 24, padding: 0 }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {scroll && values.values.length > shownRows && (
        <p className={styles.scrollHint}>
          {t('optimize.map.scrollValues', { count: values.values.length })}
        </p>
      )}
      <div className={styles.mean}>
        <strong>{t('optimize.map.mean')}</strong>
        <span>{number(values.mean.inSample)}</span>
        {validated && <span>{number(values.mean.outOfSample)}</span>}
      </div>
    </div>
  );
}
