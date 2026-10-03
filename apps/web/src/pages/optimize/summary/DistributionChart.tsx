import { useI18n } from '../../../i18n/I18nProvider.tsx';
import type { DistributionView } from '../../../workflows/optimize-views.ts';
import { useResultFormat } from '../leaderboard/useResultFormat.ts';
import { scale } from './plot-geometry.ts';
import { usePlotSize } from './usePlotSize.ts';
import styles from './Summary.module.css';

export function DistributionChart({ view }: { view: DistributionView }) {
  const { t } = useI18n();
  const { number } = useResultFormat();
  const { ref, width: measuredWidth, height: measuredHeight } = usePlotSize();
  const width = measuredWidth || 1040;
  const height = measuredHeight || 180;
  const top = Math.max(1, ...view.inSample.counts, ...(view.outOfSample?.counts ?? []));
  const x = scale([view.start, view.start + view.bins * view.width], 66, width - 64);
  const y = scale([0, top], height - 28, 20);
  const outPath = `M ${x(view.start)} ${y(0)}${
    view.outOfSample?.counts
      .map((count, index) => ` V ${y(count)} H ${x(view.start + (index + 1) * view.width)}`)
      .join('') ?? ''
  } V ${y(0)}`;
  return (
    <div ref={ref} className={styles.plot}>
      <svg
        role="img"
        aria-label={t('optimize.summary.distribution')}
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${height}`}
      >
        {[0, 0.5, 1].map((part) => (
          <g key={part}>
            <line
              x1={66}
              x2={width - 64}
              y1={y(top * part)}
              y2={y(top * part)}
              stroke="var(--divider)"
            />
            <text x={58} y={y(top * part) + 4} textAnchor="end">
              {number(Math.round(top * part))}
            </text>
          </g>
        ))}
        {view.inSample.counts.map((count, index) => (
          <rect
            key={index}
            x={x(view.start + index * view.width) + 1}
            y={y(count)}
            width={Math.max(1, (width - 130) / view.bins - 2)}
            height={y(0) - y(count)}
            fill={view.start + index * view.width < 0 ? 'var(--heat-2)' : 'var(--heat-6)'}
          >
            <title>
              {t('optimize.summary.bin', {
                from: number(view.start + index * view.width),
                to: number(view.start + (index + 1) * view.width),
                inside: count,
                outside: view.outOfSample?.counts[index] ?? 0,
              })}
            </title>
          </rect>
        ))}
        {view.outOfSample && <path d={outPath} stroke="var(--oos)" strokeWidth={1.6} fill="none" />}
        {view.start <= 0 && view.start + view.bins * view.width >= 0 && (
          <line x1={x(0)} x2={x(0)} y1={20} y2={y(0)} stroke="var(--subtle-border)" />
        )}
        {[
          { value: view.inSample.median, color: 'var(--text)', dashed: true },
          { value: view.best, color: 'var(--primary)', dashed: false },
        ].map((marker, index) =>
          marker.value === null ? null : (
            <line
              key={index}
              x1={x(marker.value)}
              x2={x(marker.value)}
              y1={20}
              y2={y(0)}
              stroke={marker.color}
              strokeWidth={1.4}
              strokeDasharray={marker.dashed ? '4 3' : undefined}
            />
          ),
        )}
        {[0, 0.25, 0.5, 0.75, 1].map((part) => (
          <text key={part} x={66 + (width - 130) * part} y={height - 9} textAnchor="middle">
            {number(view.start + view.bins * view.width * part)}
          </text>
        ))}
        <text x={66} y={12}>
          {t('optimize.summary.sets')}
        </text>
        <text x={width - 64} y={12} textAnchor="end">
          {t('optimize.summary.net')}
        </text>
      </svg>
    </div>
  );
}
