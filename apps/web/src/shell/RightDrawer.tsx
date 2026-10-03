import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { useUiStore } from '../state/ui.ts';
import { drawerToggleId } from './layout.ts';
import styles from './RightDrawer.module.css';

/**
 * The right panel as a drawer over the page from 768 to 1279 px (G2), opened by the header's
 * toggle; it loads with the first tablet layout. Focus stays inside while it is open; Escape and a click outside close it, and focus
 * returns to the toggle.
 */
export function RightDrawer({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const open = useUiStore((state) => state.drawerOpen);
  const setOpen = useUiStore((state) => state.setDrawerOpen);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Content
          className={styles.drawer}
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            document.getElementById(drawerToggleId)?.focus();
          }}
        >
          <Dialog.Title className={styles.title}>{t('layout.rightPanel')}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
