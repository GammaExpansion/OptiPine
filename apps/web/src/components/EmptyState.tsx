import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

export function EmptyState({
  title,
  children,
  actions,
  icon,
}: {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className={styles.empty}>
      {icon}
      <h2 className={styles.title}>{title}</h2>
      {children && <div className={styles.body}>{children}</div>}
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
