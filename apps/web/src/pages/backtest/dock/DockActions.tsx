import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** The element in the dock bar that holds the active tab's actions; null while collapsed. */
export const DockActionsHost = createContext<HTMLElement | null>(null);

/**
 * A dock tab's own actions, shown at the right of the dock bar before maximize and collapse:
 * B1's report download, B2's trades export, B3's compile status. Render it anywhere inside the
 * tab; only the active tab is mounted, so its actions show while it is active, and none show
 * while the dock is collapsed (B15).
 *
 * ```tsx
 * <DockActions>
 *   <IconButton icon="download" label={t('…')} onClick={exportCsv} />
 * </DockActions>
 * ```
 */
export function DockActions({ children }: { children: ReactNode }) {
  const host = useContext(DockActionsHost);
  return host ? createPortal(children, host) : null;
}
