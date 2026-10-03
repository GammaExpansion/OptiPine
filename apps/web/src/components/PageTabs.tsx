import styles from './PageTabs.module.css';

export function PageTabs<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; disabled?: boolean }[];
  onChange: (value: T) => void;
}) {
  return (
    <nav className={styles.tabs} aria-label={label}>
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          className={styles.tab}
          aria-current={value === option.value ? 'page' : undefined}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </nav>
  );
}
