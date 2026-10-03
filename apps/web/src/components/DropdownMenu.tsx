import type { ReactElement, ReactNode } from 'react';
import * as Primitive from '@radix-ui/react-dropdown-menu';
import menu from '../styles/menu.module.css';
import styles from './DropdownMenu.module.css';

export type MenuEntry = { id: string } & (
  | { type: 'heading'; label: string }
  | { type: 'separator' }
  | {
      type?: 'item';
      label: string;
      icon?: ReactNode;
      detail?: string;
      disabled?: boolean;
      tone?: 'danger';
      onSelect: () => void;
    }
);
export function DropdownMenu({
  trigger,
  entries,
  label,
  open,
  onOpenChange,
}: {
  trigger: ReactElement;
  entries: readonly MenuEntry[];
  label: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Primitive.Root open={open} onOpenChange={onOpenChange}>
      <Primitive.Trigger asChild>{trigger}</Primitive.Trigger>
      <Primitive.Portal>
        <Primitive.Content
          className={`${menu.menu} ${styles.content}`}
          aria-label={label}
          sideOffset={6}
          collisionPadding={8}
        >
          {entries.map((entry) =>
            entry.type === 'heading' ? (
              <Primitive.Label className={menu.heading} key={entry.id}>
                {entry.label}
              </Primitive.Label>
            ) : entry.type === 'separator' ? (
              <Primitive.Separator key={entry.id} className={menu.separator} />
            ) : (
              <Primitive.Item
                key={entry.id}
                disabled={entry.disabled}
                onSelect={entry.onSelect}
                className={`${menu.item} ${entry.tone === 'danger' ? menu.danger : ''}`}
              >
                {entry.icon}
                <span className={menu.label}>{entry.label}</span>
                {entry.detail && <span className={menu.detail}>{entry.detail}</span>}
              </Primitive.Item>
            ),
          )}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
