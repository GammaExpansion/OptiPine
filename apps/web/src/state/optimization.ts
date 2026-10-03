import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import type { OptimizationState } from '../workflows/optimize-session.ts';
import { getServices, type AppServices } from './services.ts';

function createOptimizationStore(services: AppServices) {
  const session = services.optimization;
  const actions = {
    setSearched: session.setSearched.bind(session),
    setRange: session.setRange.bind(session),
    setValueKept: session.setValueKept.bind(session),
    setFixedValue: session.setFixedValue.bind(session),
    setSampling: session.setSampling.bind(session),
    setValidation: session.setValidation.bind(session),
    setObjective: session.setObjective.bind(session),
    setDirection: session.setDirection.bind(session),
    addFilter: session.addFilter.bind(session),
    removeFilter: session.removeFilter.bind(session),
    setDraftFilter: session.setDraftFilter.bind(session),
    setAxis: session.setAxis.bind(session),
    setSlice: session.setSlice.bind(session),
    setSmooth: session.setSmooth.bind(session),
    setSurface: session.setSurface.bind(session),
    select: session.select.bind(session),
    setPage: session.setPage.bind(session),
    start: session.start.bind(session),
    cancel: session.cancel.bind(session),
  };
  const store = createStore<OptimizationState & { readonly actions: typeof actions }>()(() => ({
    ...session.getState(),
    actions,
  }));
  services.onDispose(session.subscribe((state) => store.setState(state)));
  return store;
}

type OptimizationStore = ReturnType<typeof createOptimizationStore>;
export type OptimizationStoreState = ReturnType<OptimizationStore['getState']>;
const stores = new WeakMap<AppServices, OptimizationStore>();

export function getOptimizationStore(services = getServices()): OptimizationStore {
  let store = stores.get(services);
  if (!store) {
    store = createOptimizationStore(services);
    stores.set(services, store);
  }
  return store;
}

export function useOptimizationStore<T>(selector: (state: OptimizationStoreState) => T): T {
  return useStore(getOptimizationStore(), selector);
}
