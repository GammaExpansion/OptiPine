import * as ToggleGroup from '@radix-ui/react-toggle-group';
import styles from './SegmentedControl.module.css';

export interface Segment {
  value: string;
  label: string;
}
export function SegmentedControl({
  label,
  value,
  options,
  onChange,
  disabled = false,
  small = false,
}: {
  label: string;
  value: string;
  options: readonly Segment[];
  onChange?: (value: string) => void;
  disabled?: boolean;
  small?: boolean;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      className={`${styles.group} ${small ? styles.small : ''}`}
      aria-label={label}
      value={value}
      onValueChange={(next) => {
        if (next) onChange?.(next);
      }}
      disabled={disabled}
    >
      {options.map((option) => (
        <ToggleGroup.Item className={styles.item} key={option.value} value={option.value}>
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
