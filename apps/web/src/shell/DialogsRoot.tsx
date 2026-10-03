import type { ComponentType } from 'react';
import { useUiStore, type Dialog } from '../state/ui.ts';

/** Phase 2 supplies dialogs/ components here; open state and mounting have one owner. */
export function DialogsRoot({ slots = {} }: { slots?: Partial<Record<Dialog, ComponentType>> }) {
  const openDialogs = useUiStore((state) => state.openDialogs);
  return openDialogs.map((dialog) => {
    const Slot = slots[dialog];
    return Slot ? <Slot key={dialog} /> : null;
  });
}
