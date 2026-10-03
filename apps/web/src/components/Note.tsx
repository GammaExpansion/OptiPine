import type { ComponentPropsWithRef, ReactNode } from 'react';
import styles from './Note.module.css';

export function Note({
  tone = 'neutral',
  icon,
  children,
  className = '',
  ...props
}: ComponentPropsWithRef<'div'> & { tone?: 'neutral' | 'amber' | 'danger'; icon?: ReactNode }) {
  return (
    <div {...props} className={`${styles.note} ${styles[tone]} ${className}`}>
      {icon}
      <div className={styles.body}>{children}</div>
    </div>
  );
}
