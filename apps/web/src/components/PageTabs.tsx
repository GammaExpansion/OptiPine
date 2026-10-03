import { DisabledReason } from './DisabledReason.tsx';
import styles from './PageTabs.module.css';

export function PageTabs<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly {
    value: T;
    label: string;
    disabled?: boolean;
    disabledReason?: string;
    changed?: boolean;
  }[];
  onChange: (value: T) => void;
}) {
  return (
    <nav className={styles.tabs} aria-label={label}>
      {options.map((option) => (
        <DisabledReason
          key={option.value}
          reason={option.disabled ? option.disabledReason : undefined}
        >
          {(descriptionId) => (
            <button
              type="button"
              className={styles.tab}
              aria-current={value === option.value ? 'page' : undefined}
              disabled={option.disabled}
              aria-describedby={descriptionId}
              onClick={() => onChange(option.value)}
            >
              {option.label}
              {option.changed && <span className={styles.dot} aria-hidden="true" />}
            </button>
          )}
        </DisabledReason>
      ))}
    </nav>
  );
}
