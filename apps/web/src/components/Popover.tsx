import type { ReactElement, ReactNode, ComponentPropsWithoutRef } from 'react';
import * as Primitive from '@radix-ui/react-popover';
import menu from '../styles/menu.module.css';
import styles from './Popover.module.css';

export function Popover({
  trigger,
  label,
  children,
  open,
  onOpenChange,
  defaultOpen,
  className = '',
  ...props
}: Pick<
  ComponentPropsWithoutRef<typeof Primitive.Content>,
  'side' | 'align' | 'onOpenAutoFocus' | 'onCloseAutoFocus'
> & {
  trigger: ReactElement;
  label: string;
  children: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}) {
  return (
    <Primitive.Root open={open} onOpenChange={onOpenChange} defaultOpen={defaultOpen}>
      <Primitive.Trigger asChild>{trigger}</Primitive.Trigger>
      <Primitive.Portal>
        <Primitive.Content
          {...props}
          aria-label={label}
          className={`${menu.menu} ${styles.content} ${className}`}
          sideOffset={6}
          collisionPadding={8}
        >
          {children}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
export const PopoverClose = Primitive.Close;
