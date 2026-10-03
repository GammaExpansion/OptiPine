import { useId, type ReactNode } from 'react';
import { Checkbox } from './Checkbox.tsx';
import { Chip } from './Chip.tsx';
import { Popover } from './Popover.tsx';
import styles from './ChipOverflow.module.css';

/** The full list stays editable in-place; selection rules belong to the calling workflow. */
export function ChipOverflow({
  options,
  values,
  onChange,
  limit = 3,
  moreLabel,
  title,
  summary,
  hint,
  disabled,
}: {
  options: readonly { value: string; label: string; disabled?: boolean }[];
  values: readonly string[];
  onChange: (values: string[]) => void;
  limit?: number;
  moreLabel: (count: number) => string;
  title: string;
  summary?: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  const visible = Math.max(0, Math.floor(limit));
  const toggle = (value: string, selected: boolean) =>
    onChange(selected ? [...new Set([...values, value])] : values.filter((item) => item !== value));
  return (
    <div className={styles.chips} role="group" aria-label={title}>
      {options.slice(0, visible).map((option) => (
        <Chip
          key={option.value}
          label={option.label}
          pressed={values.includes(option.value)}
          disabled={disabled || option.disabled}
          onPressedChange={(selected) => toggle(option.value, selected)}
        />
      ))}
      {options.length > visible && (
        <Popover
          label={title}
          trigger={<Chip label={moreLabel(options.length - visible)} disabled={disabled} />}
        >
          <div className={styles.heading}>
            <strong>{title}</strong>
            {summary && <span>{summary}</span>}
          </div>
          <div className={styles.list}>
            {options.map((option, index) => (
              <label key={option.value} className={styles.option} htmlFor={`${id}-${index}`}>
                <Checkbox
                  id={`${id}-${index}`}
                  label={option.label}
                  checked={values.includes(option.value)}
                  disabled={disabled || option.disabled}
                  onCheckedChange={(checked) => toggle(option.value, checked === true)}
                />
                {option.label}
              </label>
            ))}
          </div>
          {hint && <p className={styles.hint}>{hint}</p>}
        </Popover>
      )}
    </div>
  );
}
