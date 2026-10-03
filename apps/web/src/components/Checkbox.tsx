import type { ComponentPropsWithRef } from 'react';
import * as Primitive from '@radix-ui/react-checkbox';
import { Icon } from './Icon.tsx';
import styles from './Checkbox.module.css';

export function Checkbox({
  label,
  className = '',
  ...props
}: ComponentPropsWithRef<typeof Primitive.Root> & { label: string }) {
  return (
    <Primitive.Root {...props} aria-label={label} className={`${styles.checkbox} ${className}`}>
      <Primitive.Indicator className={styles.indicator}>
        <Icon name="minus" className={styles.mixed} size={10} />
        <Icon name="check" className={styles.checked} size={10} />
      </Primitive.Indicator>
    </Primitive.Root>
  );
}
