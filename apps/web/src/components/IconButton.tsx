import type { ButtonHTMLAttributes } from 'react';
import { Icon, type IconName } from './Icon.tsx';
import styles from './IconButton.module.css';

export function IconButton({
  icon,
  label,
  className = '',
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & { icon: IconName; label: string }) {
  return (
    <button
      type="button"
      className={`${styles.button} ${className}`}
      aria-label={label}
      title={label}
      {...props}
    >
      <Icon name={icon} size={15} />
    </button>
  );
}
