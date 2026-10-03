import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import type { FeedRequest } from '@pine/market-data';
import type { DatasetInput } from '../workflows/backtest.ts';
import type { MarketDataState } from '../workflows/market-data.ts';
import { getServices, type AppServices } from './services.ts';

export type DatasetOrigin =
  | { readonly kind: 'provider'; readonly request: FeedRequest }
  | { readonly kind: 'csv'; readonly fileName: string };

function createMarketDataStore(services: AppServices) {
  const session = services.marketData;
  const actions = {
    fetch: session.fetch.bind(session),
    retry: session.retry.bind(session),
    cancel: session.cancel.bind(session),
    editSymbolInfo: session.editSymbolInfo.bind(session),
    /** Only acceptance changes the dataset and its provenance; a fetch is just a preview. */
    accept() {
      const accepted = session.accept();
      if (accepted) {
        store.setState({ origin: { kind: 'provider', request: accepted.request } });
        services.backtest.setDataset(accepted.input);
      }
      return accepted;
    },
    /** The CSV workflow validates the input before handing it to this action. */
    useCsv(input: DatasetInput, fileName: string) {
      session.cancel();
      store.setState({ origin: { kind: 'csv', fileName } });
      services.backtest.setDataset(input);
    },
  };
  const store = createStore<
    MarketDataState & { readonly origin: DatasetOrigin | null; readonly actions: typeof actions }
  >()(() => ({ ...session.getState(), origin: null, actions }));
  services.onDispose(session.subscribe((state) => store.setState(state)));
  return store;
}

type MarketDataStore = ReturnType<typeof createMarketDataStore>;
export type MarketDataStoreState = ReturnType<MarketDataStore['getState']>;
const stores = new WeakMap<AppServices, MarketDataStore>();

export function getMarketDataStore(services = getServices()): MarketDataStore {
  let store = stores.get(services);
  if (!store) {
    store = createMarketDataStore(services);
    stores.set(services, store);
  }
  return store;
}

export function useMarketDataStore<T>(selector: (state: MarketDataStoreState) => T): T {
  return useStore(getMarketDataStore(), selector);
}
