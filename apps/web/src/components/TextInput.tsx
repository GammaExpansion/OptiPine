import type { ComponentPropsWithRef, ReactNode } from 'react';
import styles from './TextInput.module.css';

export function TextInput({
  className = '',
  icon,
  compact,
  ...props
}: ComponentPropsWithRef<'input'> & { icon?: ReactNode; compact?: boolean }) {
  return (
    <span
      className={`${styles.field} ${compact ? styles.compact : ''} ${className}`}
      data-invalid={props['aria-invalid']}
      data-disabled={props.disabled || props.readOnly || undefined}
    >
      {icon && <span className={styles.icon}>{icon}</span>}
      <input {...props} className={styles.input} />
    </span>
  );
}
