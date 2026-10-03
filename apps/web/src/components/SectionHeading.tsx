import type { ReactNode } from 'react';
import styles from './SectionHeading.module.css';

export function SectionHeading({
  children,
  action,
  level = 2,
}: {
  children: ReactNode;
  action?: ReactNode;
  level?: 2 | 3 | 4;
}) {
  const Heading = level === 2 ? 'h2' : level === 3 ? 'h3' : 'h4';
  return (
    <div className={styles.section}>
      <Heading className={styles.title}>{children}</Heading>
      {action}
    </div>
  );
}
