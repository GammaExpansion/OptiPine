import type { ComponentPropsWithRef } from 'react';
import styles from './Table.module.css';

/** Callers supply semantic head/body cells and real buttons for row actions; this is not a grid. */
export function Table({
  variant = 'plain',
  compact = false,
  caption,
  className = '',
  children,
  ...props
}: ComponentPropsWithRef<'table'> & {
  variant?: 'plain' | 'leaderboard';
  compact?: boolean;
  caption?: string;
}) {
  return (
    <div
      className={styles.scroll}
      tabIndex={0}
      role="region"
      aria-label={caption ?? props['aria-label']}
    >
      <table
        {...props}
        className={`${styles.table} ${styles[variant]} ${compact ? styles.compact : ''} ${className}`}
      >
        {caption && <caption className={styles.caption}>{caption}</caption>}
        {children}
      </table>
    </div>
  );
}
