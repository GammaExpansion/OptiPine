import type { ComponentPropsWithRef } from 'react';
import { Icon, type IconName } from './Icon.tsx';
import { Tooltip } from './Tooltip.tsx';
import styles from './IconButton.module.css';

/**
 * An icon that leaves the app, drawn like `IconButton`. It is a real link, so the browser's own
 * link behaviours work; it opens in a new tab, without giving that page a handle on this one.
 */
export function IconLink({
  icon,
  label,
  href,
  className = '',
  ...props
}: Omit<ComponentPropsWithRef<'a'>, 'children' | 'target' | 'rel'> & {
  icon: IconName;
  label: string;
  href: string;
}) {
  return (
    <Tooltip content={label}>
      <a
        {...props}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${styles.button} ${className}`}
        aria-label={label}
      >
        <Icon name={icon} size={15} />
      </a>
    </Tooltip>
  );
}
