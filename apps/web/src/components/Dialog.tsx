import { useId, useRef, type ReactElement, type ReactNode } from 'react';
import * as Primitive from '@radix-ui/react-dialog';
import { IconButton } from './IconButton.tsx';
import styles from './Dialog.module.css';

export function Dialog({
  trigger,
  title,
  description,
  closeLabel,
  children,
  footer,
  open,
  onOpenChange,
  onEscapeKeyDown,
  size = 'medium',
}: {
  trigger?: ReactElement;
  title: string;
  description?: string;
  closeLabel: string;
  children: ReactNode;
  footer?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  size?: 'small' | 'medium' | 'large';
}) {
  const descriptionId = useId();
  const opener = useRef<HTMLElement | null>(null);
  return (
    <Primitive.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <Primitive.Trigger asChild>{trigger}</Primitive.Trigger>}
      <Primitive.Portal>
        <Primitive.Overlay className={styles.overlay} />
        <Primitive.Content
          onEscapeKeyDown={onEscapeKeyDown}
          className={`${styles.dialog} ${styles[size]}`}
          aria-describedby={description ? descriptionId : undefined}
          onOpenAutoFocus={() => {
            opener.current = document.activeElement as HTMLElement | null;
          }}
          onCloseAutoFocus={(event) => {
            // Store-driven dialogs have no Radix Trigger to restore focus to.
            if (!trigger && opener.current?.isConnected) {
              event.preventDefault();
              opener.current.focus();
            }
          }}
        >
          <div className={styles.header}>
            <div>
              <Primitive.Title className={styles.title}>{title}</Primitive.Title>
              {description && (
                <Primitive.Description id={descriptionId} className={styles.description}>
                  {description}
                </Primitive.Description>
              )}
            </div>
            <Primitive.Close asChild>
              <IconButton icon="close" label={closeLabel} tooltip={false} />
            </Primitive.Close>
          </div>
          <div className={styles.body}>{children}</div>
          {footer && <div className={styles.footer}>{footer}</div>}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
export const DialogClose = Primitive.Close;
