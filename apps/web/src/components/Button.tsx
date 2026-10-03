import type { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

export function Button({
  variant = 'secondary',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'toolbar' | 'link';
}) {
  return (
    <button type={type} className={`${styles.button} ${styles[variant]} ${className}`} {...props} />
  );
}
