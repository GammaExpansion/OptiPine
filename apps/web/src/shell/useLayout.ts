import { useSyncExternalStore } from 'react';
import { currentLayout, watchLayout, type Layout } from './layout.ts';

const subscribe = (listener: () => void) => watchLayout(listener);
const snapshot = () => currentLayout();
const serverSnapshot = (): Layout => 'desktop';

/** The page layout for the viewport's width (WEB.md 2.7), following it as the window resizes. */
export function useLayout(): Layout {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
