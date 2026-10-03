import { useI18n } from '../../../../i18n/I18nProvider.tsx';
import { formatNumber } from '../../../../i18n/translate.ts';
import type { StabilityRow, WalkForwardView } from '../../../../workflows/walk-forward.ts';
import { rangeLabel, valueLabel } from '../../map/map-labels.ts';
import { bandRect, nearSegments, valuePosition } from './lanes.ts';
import styles from './stability.module.css';

function Row({ row, view }: { row: StabilityRow; view: WalkForwardView }) {
  const { t, text } = useI18n();
  const selected = view.selection?.window.plan.index;
  const count = Math.max(1, view.windows.length);
  const common = row.common
    .map(({ from, to }) => text(rangeLabel(from === to ? [from] : [from, to])))
    .join(', ');
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <span>{row.title}</span>
        <span className={styles.commonText}>
          {row.allNearOptimal
            ? t('optimize.wfStability.allNearOptimal')
            : t(common ? 'optimize.wfStability.common' : 'optimize.wfStability.noCommon', {
                values: common,
              })}
        </span>
        <span className={styles.fixedText}>
          {t('optimize.wfStability.fixed', {
            value: text(valueLabel(row.fixed)),
            loss:
              row.meanLoss === null
                ? text(valueLabel(null))
                : formatNumber(row.meanLoss, {
                    style: 'percent',
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  }),
          })}
        </span>
      </div>
      <div className={styles.lanes}>
        <svg
          viewBox={`0 0 ${count * 44} 64`}
          preserveAspectRatio="none"
          aria-label={t('optimize.wfStability.bands', { title: row.title })}
          role="img"
        >
          {row.common.map(({ from, to }, index) => {
            const rect = bandRect(row.values, from, to);
            return (
              rect && (
                <rect
                  key={index}
                  x={0}
                  width={count * 44}
                  {...rect}
                  className={styles.commonBand}
                />
              )
            );
          })}
          {view.windows.map((window, index) => {
            const band = row.bands.find((band) => band.window === window.plan.index);
            const chosen = valuePosition(row.values, band?.chosen ?? null);
            return (
              <g
                key={window.plan.index}
                data-selected={window.plan.index === selected || undefined}
              >
                <title>
                  {t('optimize.wfStability.lane', {
                    window: window.plan.index + 1,
                    chosen: text(valueLabel(band?.chosen)),
                    values: band?.near.length
                      ? band.near.map((value) => text(valueLabel(value))).join(', ')
                      : text(valueLabel(null)),
                  })}
                </title>
                <rect
                  x={index * 44}
                  y={0}
                  width={44}
                  height={64}
                  className={styles.selectedColumn}
                />
                {nearSegments(row.values, band?.near ?? []).map(({ from, to }, segment) => {
                  const rect = bandRect(row.values, from, to);
                  return (
                    rect && (
                      <rect
                        key={segment}
                        x={index * 44 + 16}
                        width={12}
                        rx={2}
                        {...rect}
                        className={styles.nearBand}
                      />
                    )
                  );
                })}
                {chosen !== null && (
                  <circle cx={index * 44 + 22} cy={chosen} r={3.2} className={styles.chosen} />
                )}
              </g>
            );
          })}
        </svg>
        <span className={styles.maximum}>{text(valueLabel(row.values.at(-1)))}</span>
        {row.values.length > 1 && (
          <span className={styles.minimum}>{text(valueLabel(row.values[0]))}</span>
        )}
      </div>
    </div>
  );
}

export function StabilityRows({ view }: { view: WalkForwardView }) {
  const { t } = useI18n();
  const rows = view.stability?.rows ?? [];
  return rows.length ? (
    <div className={styles.rows}>
      <div
        className={styles.windowLabels}
        style={{
          gridTemplateColumns: `repeat(${Math.max(1, view.windows.length)}, minmax(0, 1fr))`,
        }}
      >
        {view.windows.map((window) => (
          <span
            key={window.plan.index}
            data-selected={window.plan.index === view.selection?.window.plan.index || undefined}
          >
            {t('optimize.wfStability.window', { window: window.plan.index + 1 })}
          </span>
        ))}
      </div>
      {rows.map((row) => (
        <Row key={row.title} row={row} view={view} />
      ))}
    </div>
  ) : (
    <p className={styles.note}>{t('optimize.wfStability.noInputs')}</p>
  );
}
