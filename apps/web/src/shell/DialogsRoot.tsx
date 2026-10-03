import type { ComponentType } from 'react';
import { useUiStore, type Dialog } from '../state/ui.ts';
import { MarketDataDialog } from '../dialogs/marketData/MarketDataDialog.tsx';
import { ScriptDialog } from '../dialogs/script/ScriptDialog.tsx';
import { DateRangeDialog } from '../dialogs/dateRange/DateRangeDialog.tsx';

/** Phase 2 supplies dialogs/ components here; open state and mounting have one owner. */
export function DialogsRoot({ slots = {} }: { slots?: Partial<Record<Dialog, ComponentType>> }) {
  const openDialogs = useUiStore((state) => state.openDialogs);
  const allSlots: Partial<Record<Dialog, ComponentType>> = {
    script: ScriptDialog,
    marketData: MarketDataDialog,
    dateRange: DateRangeDialog,
    ...slots,
  };
  return openDialogs.map((dialog) => {
    const Slot = allSlots[dialog];
    return Slot ? <Slot key={dialog} /> : null;
  });
}
