import styles from './ProgressBar.module.css';

export function ProgressBar({
  label,
  value,
  max = 100,
  valueText,
  className = '',
}: {
  label: string;
  value?: number;
  max?: number;
  valueText?: string;
  className?: string;
}) {
  const maximum = Number.isFinite(max) && max > 0 ? max : 100;
  const current =
    value !== undefined && Number.isFinite(value)
      ? Math.min(maximum, Math.max(0, value))
      : undefined;
  return (
    <div
      className={`${styles.bar} ${className}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={maximum}
      aria-valuenow={current}
      aria-valuetext={valueText}
    >
      <span
        className={current === undefined ? styles.indeterminate : styles.fill}
        style={current === undefined ? undefined : { width: `${(current / maximum) * 100}%` }}
      />
    </div>
  );
}
