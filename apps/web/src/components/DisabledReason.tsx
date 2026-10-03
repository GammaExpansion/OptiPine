import { useId, type ReactNode } from 'react';
import { Tooltip } from './Tooltip.tsx';
import styles from './DisabledReason.module.css';

/** Native disabled controls remain inert; the wrapper makes their reason keyboard discoverable. */
export function DisabledReason({
  reason,
  children,
}: {
  reason?: string;
  children: (descriptionId?: string) => ReactNode;
}) {
  const id = useId();
  if (!reason) return children();
  return (
    <>
      <Tooltip content={reason}>
        <span className={styles.target} tabIndex={0} aria-describedby={id}>
          {children(id)}
        </span>
      </Tooltip>
      <span className={styles.hidden} id={id}>
        {reason}
      </span>
    </>
  );
}
