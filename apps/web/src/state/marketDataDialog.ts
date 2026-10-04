import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import {
  restoreSelection,
  selectionFrom,
  selectionKey,
  type Selection,
} from '../workflows/market-selection.ts';
import { SymbolSearchSession, type SymbolSearchState } from '../workflows/symbol-search.ts';
import { getMarketDataStore } from './marketData.ts';
import { getServices, type AppServices } from './services.ts';

interface SelectionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const browserStorage: SelectionStorage = {
  getItem: (key) => globalThis.localStorage?.getItem(key) ?? null,
  setItem: (key, value) => globalThis.localStorage?.setItem(key, value),
};

/** Loaded with the dialog so search and saved-selection logic stay out of the first chunk. */
export function createMarketDataDialogStore(
  services: AppServices,
  storage: SelectionStorage = browserStorage,
) {
  const search = new SymbolSearchSession(services.feed);
  const market = getMarketDataStore(services);
  const actions = {
    search: search.search.bind(search),
    cancelSearch: search.cancel.bind(search),
    resetSearch: search.reset.bind(search),
    /** An incoming refetch wins over the accepted provider, then the remembered selection. */
    initialSelection() {
      const now = services.now();
      const { fetch, origin } = market.getState();
      if ('request' in fetch) return { now, selection: selectionFrom(fetch.request, now) };
      if (origin?.kind === 'provider')
        return { now, selection: selectionFrom(origin.request, now) };
      let raw: string | null = null;
      try {
        raw = storage.getItem(selectionKey);
      } catch {
        // Private browsing or disabled storage must not prevent opening the dialog.
      }
      return { now, selection: restoreSelection(raw, now) };
    },
    /** Persist only a successfully accepted dialog selection, using the existing plain JSON. */
    accept(selection: Selection) {
      const accepted = market.getState().actions.accept();
      if (accepted) {
        try {
          storage.setItem(selectionKey, JSON.stringify(selection));
        } catch {
          // Persistence is optional; the accepted dataset remains usable in memory.
        }
      }
      return accepted;
    },
  };
  const store = createStore<SymbolSearchState & { readonly actions: typeof actions }>()(() => ({
    ...search.getState(),
    actions,
  }));
  const unsubscribe = search.subscribe((state) => store.setState(state));
  services.onDispose(() => {
    unsubscribe();
    search.reset();
  });
  return store;
}

type MarketDataDialogStore = ReturnType<typeof createMarketDataDialogStore>;
type MarketDataDialogState = ReturnType<MarketDataDialogStore['getState']>;
const stores = new WeakMap<AppServices, MarketDataDialogStore>();

export function getMarketDataDialogStore(services = getServices()): MarketDataDialogStore {
  let store = stores.get(services);
  if (!store) {
    store = createMarketDataDialogStore(services);
    stores.set(services, store);
  }
  return store;
}

export function useMarketDataDialogStore<T>(selector: (state: MarketDataDialogState) => T): T {
  return useStore(getMarketDataDialogStore(), selector);
}
