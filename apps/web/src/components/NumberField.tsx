import { useId, type ComponentPropsWithRef } from 'react';
import { Icon } from './Icon.tsx';
import { stepNumber } from './number-step.ts';
import styles from './NumberField.module.css';

export interface NumberFieldProps extends Omit<
  ComponentPropsWithRef<'input'>,
  'type' | 'value' | 'onChange' | 'min' | 'max' | 'step' | 'size'
> {
  value: number | string;
  /** Raw text preserves empty and invalid drafts for the caller's validation. */
  onChange: (value: string) => void;
  label: string;
  decrementLabel: string;
  incrementLabel: string;
  min?: number;
  max?: number;
  step?: number;
  error?: string;
  hint?: string;
  compact?: boolean;
  stepper?: boolean;
}
export function NumberField({
  value,
  onChange,
  label,
  decrementLabel,
  incrementLabel,
  min,
  max,
  step = 1,
  error,
  hint,
  compact = false,
  stepper = true,
  readOnly,
  disabled,
  id: suppliedId,
  className = '',
  onKeyDown,
  ...props
}: NumberFieldProps) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const parsed = String(value).trim() ? Number(value) : NaN;
  const describedBy =
    [props['aria-describedby'], hint ? `${id}-hint` : '', error ? `${id}-error` : '']
      .filter(Boolean)
      .join(' ') || undefined;
  const move = (direction: -1 | 1, page = false) => {
    if (disabled || readOnly) return;
    const next = stepNumber(value, direction, page, { min, max, step });
    if (next !== undefined && next !== parsed) onChange(String(next));
  };
  return (
    <div className={`${styles.root} ${className}`}>
      <div
        className={`${styles.field} ${compact ? styles.compact : ''}`}
        data-invalid={!!error || props['aria-invalid'] || undefined}
        data-disabled={disabled || readOnly || undefined}
      >
        {stepper && !readOnly && (
          <button
            type="button"
            className={styles.step}
            aria-label={decrementLabel}
            disabled={disabled || (min !== undefined && parsed <= min)}
            onClick={() => move(-1)}
          >
            <Icon name="minus" size={12} />
          </button>
        )}
        <input
          {...props}
          id={id}
          className={styles.input}
          type="text"
          inputMode="decimal"
          role="spinbutton"
          value={value}
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={Number.isFinite(parsed) ? parsed : undefined}
          aria-invalid={error ? true : props['aria-invalid']}
          aria-describedby={describedBy}
          readOnly={readOnly}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            onKeyDown?.(event);
            if (
              event.defaultPrevented ||
              readOnly ||
              disabled ||
              event.altKey ||
              event.ctrlKey ||
              event.metaKey
            )
              return;
            if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(event.key)) {
              event.preventDefault();
              move(
                event.key === 'ArrowUp' || event.key === 'PageUp' ? 1 : -1,
                event.key.startsWith('Page'),
              );
            }
          }}
        />
        {stepper && !readOnly && (
          <button
            type="button"
            className={styles.step}
            aria-label={incrementLabel}
            disabled={disabled || (max !== undefined && parsed >= max)}
            onClick={() => move(1)}
          >
            <Icon name="plus" size={12} />
          </button>
        )}
      </div>
      {hint && (
        <span id={`${id}-hint`} className={styles.hint}>
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-error`} className={styles.error} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
