import type { ReactNode } from 'react';
import * as Primitive from '@radix-ui/react-tabs';
import styles from './Tabs.module.css';

export function Tabs({
  label,
  value,
  onChange,
  options,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string; description?: string; disabled?: boolean }[];
  children: ReactNode;
}) {
  return (
    <Primitive.Root value={value} onValueChange={onChange} className={styles.root}>
      <Primitive.List className={styles.list} aria-label={label}>
        {options.map((option) => (
          <Primitive.Trigger
            className={styles.tab}
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            <span className={styles.label} title={option.label}>
              {option.label}
            </span>
            {option.description && (
              <span className={styles.description} title={option.description}>
                {option.description}
              </span>
            )}
          </Primitive.Trigger>
        ))}
      </Primitive.List>
      {options.map((option) => (
        <Primitive.Content key={option.value} value={option.value} className={styles.content}>
          {value === option.value ? children : null}
        </Primitive.Content>
      ))}
    </Primitive.Root>
  );
}
