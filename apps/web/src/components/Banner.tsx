import type { ComponentPropsWithRef, ReactNode } from 'react';
import styles from './Banner.module.css';

export function Banner({
  tone = 'amber',
  title,
  children,
  icon,
  actions,
  className = '',
  ...props
}: Omit<ComponentPropsWithRef<'div'>, 'title'> & {
  tone?: 'neutral' | 'amber' | 'danger';
  title?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div {...props} className={`${styles.banner} ${styles[tone]} ${className}`}>
      {icon}
      <div className={styles.copy}>
        {title && <div className={styles.title}>{title}</div>}
        {children && <div className={styles.body}>{children}</div>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
