import type { ReactNode } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import styles from './DockTabs.module.css';

export function DockTabs({
  label,
  value,
  options,
  onChange,
  actions,
  collapsed,
  children,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string; count?: number }[];
  onChange: (value: string) => void;
  actions: ReactNode;
  collapsed: boolean;
  children: ReactNode;
}) {
  return (
    <Tabs.Root className={styles.root} value={value} onValueChange={onChange}>
      <div className={styles.bar}>
        <Tabs.List className={styles.tabs} aria-label={label}>
          {options.map((option) => (
            <Tabs.Trigger className={styles.tab} key={option.value} value={option.value}>
              {option.label}
              {option.count !== undefined && <span className={styles.count}>{option.count}</span>}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <div className={styles.actions}>{actions}</div>
      </div>
      <Tabs.Content className={styles.content} value={value} hidden={collapsed}>
        {children}
      </Tabs.Content>
    </Tabs.Root>
  );
}
