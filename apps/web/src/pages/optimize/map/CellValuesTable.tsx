import { useState } from 'react';
import type { CellValues } from '../../../workflows/optimize-views.ts';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import { formatNumber } from '../../../i18n/translate.ts';
import { valueLabel } from './map-labels.ts';
import styles from './MapPanel.module.css';

/** Only the visible values mount, even when a bin covers thousands of original combinations. */
export function CellValuesTable({
  values,
  x,
  y,
  validated,
}: {
  values: CellValues;
  x: string;
  y: string | null;
  validated: boolean;
}) {
  const { t, text } = useI18n();
  const [start, setStart] = useState(0);
  const visible = 10;
  const from = Math.min(start, Math.max(0, values.values.length - visible));
  const showY = y && values.values.some((value) => value.y !== values.values[0]?.y);
  const number = (value: number | null) =>
    value === null
      ? t('optimize.map.na')
      : formatNumber(value, { maximumFractionDigits: 2, signDisplay: 'exceptZero' });
  return (
    <div className={styles.values}>
      <div
        className={styles.valueScroll}
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
                        x: text(valueLabel(value.x)),
                        y: text(valueLabel(value.y)),
                      })
                    : text(valueLabel(value.x))}
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
      <div className={styles.mean}>
        <strong>{t('optimize.map.mean')}</strong>
        <span>{number(values.mean.inSample)}</span>
        {validated && <span>{number(values.mean.outOfSample)}</span>}
      </div>
    </div>
  );
}
