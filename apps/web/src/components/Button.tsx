import type { ComponentPropsWithRef, ReactNode } from 'react';
import { DisabledReason } from './DisabledReason.tsx';
import { Icon } from './Icon.tsx';
import styles from './Button.module.css';

export function Button({
  variant = 'secondary',
  className = '',
  type = 'button',
  tone = 'neutral',
  disabled,
  disabledReason,
  loading = false,
  icon,
  shortcut,
  children,
  onClick,
  ...props
}: ComponentPropsWithRef<'button'> & {
  variant?: 'primary' | 'secondary' | 'toolbar' | 'link';
  tone?: 'neutral' | 'amber' | 'danger';
  disabledReason?: string;
  loading?: boolean;
  icon?: ReactNode;
  shortcut?: string;
}) {
  const blocked =
    disabled || loading || props['aria-disabled'] === true || props['aria-disabled'] === 'true';
  return (
    <DisabledReason reason={disabled ? disabledReason : undefined}>
      {(descriptionId) => (
        <button
          {...props}
          type={type}
          disabled={disabled || loading}
          aria-busy={loading || undefined}
          aria-describedby={
            [props['aria-describedby'], descriptionId].filter(Boolean).join(' ') || undefined
          }
          onClick={(event) => {
            if (blocked) {
              event.preventDefault();
              return;
            }
            onClick?.(event);
          }}
          className={`${styles.button} ${styles[variant]} ${styles[tone]} ${className}`}
        >
          {loading ? <Icon name="spinner" /> : icon}
          {children}
          {shortcut && <kbd>{shortcut}</kbd>}
        </button>
      )}
    </DisabledReason>
  );
}
