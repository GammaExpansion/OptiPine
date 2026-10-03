import type { ComponentPropsWithRef } from 'react';
import { Icon } from './Icon.tsx';
import styles from './Chip.module.css';

type ChipProps = Omit<ComponentPropsWithRef<'button'>, 'children'> & {
  label: string;
  bad?: boolean;
  dashed?: boolean;
  pressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
} & ({ onRemove: () => void; removeLabel: string } | { onRemove?: never; removeLabel?: never });

export function Chip({
  label,
  bad,
  dashed,
  pressed,
  onPressedChange,
  onRemove,
  removeLabel,
  className = '',
  onClick,
  disabled,
  ...props
}: ChipProps) {
  const chipClass = `${styles.chip} ${bad ? styles.bad : ''} ${pressed ? styles.on : ''} ${dashed ? styles.dashed : ''} ${className}`;
  if (onRemove)
    return (
      <span className={chipClass} data-disabled={disabled || undefined}>
        {label}
        <button
          {...props}
          className={styles.remove}
          type="button"
          aria-label={removeLabel}
          disabled={disabled}
          onClick={onRemove}
        >
          <Icon name="close" size={10} />
        </button>
      </span>
    );
  return (
    <button
      {...props}
      className={chipClass}
      type="button"
      disabled={disabled}
      aria-pressed={pressed}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onPressedChange?.(!pressed);
      }}
    >
      {label}
    </button>
  );
}
