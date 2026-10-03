import type { ComponentPropsWithRef } from 'react';
import styles from './Tag.module.css';

export function Tag({
  tone = 'neutral',
  className = '',
  ...props
}: ComponentPropsWithRef<'span'> & { tone?: 'neutral' | 'amber' | 'danger' | 'blue' }) {
  return <span {...props} className={`${styles.tag} ${styles[tone]} ${className}`} />;
}
