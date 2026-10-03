import { useId, type ReactNode } from 'react';
import styles from './FieldRow.module.css';

export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}
export function FieldRow({
  id: suppliedId,
  label,
  hint,
  error,
  inline = false,
  children,
  className = '',
}: {
  id?: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  inline?: boolean;
  children: ReactNode | ((props: FieldControlProps) => ReactNode);
  className?: string;
}) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const description =
    [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`${styles.row} ${inline ? styles.inline : ''} ${className}`}>
      <div className={styles.heading}>
        <label htmlFor={id}>{label}</label>
        {hint && (
          <span className={styles.hint} id={`${id}-hint`}>
            {hint}
          </span>
        )}
      </div>
      <div className={styles.control}>
        {typeof children === 'function'
          ? children({
              id,
              'aria-describedby': description,
              'aria-invalid': error ? true : undefined,
            })
          : children}
        {error && (
          <div id={`${id}-error`} className={styles.error} role="alert">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
