import { lazy, Suspense, type ComponentType } from 'react';
import { useUiStore, type Dialog } from '../state/ui.ts';

// A dialog matters only once it opens, so each loads in a chunk of its own on first use.
const ScriptDialog = lazy(() =>
  import('../dialogs/script/ScriptDialog.tsx').then((module) => ({ default: module.ScriptDialog })),
);
const MarketDataDialog = lazy(() =>
  import('../dialogs/marketData/MarketDataDialog.tsx').then((module) => ({
    default: module.MarketDataDialog,
  })),
);
const DateRangeDialog = lazy(() =>
  import('../dialogs/dateRange/DateRangeDialog.tsx').then((module) => ({
    default: module.DateRangeDialog,
  })),
);

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
    return Slot ? (
      <Suspense key={dialog} fallback={null}>
        <Slot />
      </Suspense>
    ) : null;
  });
}
