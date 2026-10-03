import type { ComponentPropsWithRef } from 'react';
import * as Primitive from '@radix-ui/react-switch';
import styles from './ToggleSwitch.module.css';

export function ToggleSwitch({
  label,
  className = '',
  ...props
}: ComponentPropsWithRef<typeof Primitive.Root> & { label: string }) {
  return (
    <Primitive.Root {...props} aria-label={label} className={`${styles.switch} ${className}`}>
      <Primitive.Thumb className={styles.thumb} />
    </Primitive.Root>
  );
}
