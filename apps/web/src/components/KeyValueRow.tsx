import type { ReactNode } from 'react';
import styles from './KeyValueRow.module.css';

export function KeyValueRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{children}</span>
    </div>
  );
}
