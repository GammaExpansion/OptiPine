import { Suspense, type ComponentType } from 'react';
import { lazyWithCatalog } from '../i18n/lazyWithCatalog.tsx';
import { useUiStore, type Dialog } from '../state/ui.ts';

// A dialog matters only once it opens, so each loads in a chunk of its own on first use.
const ScriptDialog = lazyWithCatalog('script', () =>
  import('../dialogs/script/ScriptDialog.tsx').then((module) => ({ default: module.ScriptDialog })),
);
const ReplaceScriptDialog = lazyWithCatalog('script', () =>
  import('../dialogs/script/ReplaceScriptDialog.tsx').then((module) => ({
    default: module.ReplaceScriptDialog,
  })),
);
const MarketDataDialog = lazyWithCatalog('data', () =>
  import('../dialogs/marketData/MarketDataDialog.tsx').then((module) => ({
    default: module.MarketDataDialog,
  })),
);
const DateRangeDialog = lazyWithCatalog('data', () =>
  import('../dialogs/dateRange/DateRangeDialog.tsx').then((module) => ({
    default: module.DateRangeDialog,
  })),
);
const LicensesDialog = lazyWithCatalog('licenses', () =>
  import('../dialogs/licenses/LicensesDialog.tsx').then((module) => ({
    default: module.LicensesDialog,
  })),
);

/** Every open dialog mounts here; `slots` adds the ones a page owns. Open state has one owner. */
export function DialogsRoot({ slots = {} }: { slots?: Partial<Record<Dialog, ComponentType>> }) {
  const openDialogs = useUiStore((state) => state.openDialogs);
  const allSlots: Partial<Record<Dialog, ComponentType>> = {
    script: ScriptDialog,
    replaceScript: ReplaceScriptDialog,
    marketData: MarketDataDialog,
    dateRange: DateRangeDialog,
    licenses: LicensesDialog,
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
