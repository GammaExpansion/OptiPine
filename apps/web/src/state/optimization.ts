import { useEffect } from 'react';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import type { OptimizationSession, OptimizationState } from '../workflows/optimize-session.ts';
import { getServices, type AppServices } from './services.ts';

/**
 * The optimization store bridges a session that loads on first need (`services.loadOptimization`).
 * Components of the Optimize page render inside `useOptimizationLoaded`, so the store exists
 * whenever they read it; the shell reads `useOptimizationPresence` instead, which stays false until
 * the session exists, without loading it.
 */
function createOptimizationStore(services: AppServices, session: OptimizationSession) {
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
    selectWindow: session.selectWindow.bind(session),
    setWindowMapSurface: session.setWindowMapSurface.bind(session),
    setStabilityTolerance: session.setStabilityTolerance.bind(session),
    previewWindow: session.previewWindow.bind(session),
    applyFixedParameters: session.applyFixedParameters.bind(session),
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

/** The store of a loaded session; reading it before `loadOptimization` resolves is an error. */
export function getOptimizationStore(services = getServices()): OptimizationStore {
  let store = stores.get(services);
  if (!store) {
    const session = services.optimization?.session;
    if (!session) throw new Error('Read the optimization store after loadOptimization resolves');
    store = createOptimizationStore(services, session);
    stores.set(services, store);
  }
  return store;
}

export function useOptimizationStore<T>(selector: (state: OptimizationStoreState) => T): T {
  return useStore(getOptimizationStore(), selector);
}

/** What the shell reads about the optimization side, all false until it loads. */
export interface OptimizationPresence {
  readonly loaded: boolean;
  /** Complete results exist, outdated or not: the Optimize page switch is marked (R1, R5). */
  readonly hasResults: boolean;
}

function createPresenceStore(services: AppServices) {
  const store = createStore<OptimizationPresence>()(() => ({ loaded: false, hasResults: false }));
  services.onDispose(
    services.onOptimization(({ session }) => {
      const update = (state: OptimizationState) =>
        store.setState({ loaded: true, hasResults: state.results !== null });
      update(session.getState());
      services.onDispose(session.subscribe(update));
    }),
  );
  return store;
}

const presences = new WeakMap<AppServices, ReturnType<typeof createPresenceStore>>();

export function getOptimizationPresence(services = getServices()) {
  let store = presences.get(services);
  if (!store) {
    store = createPresenceStore(services);
    presences.set(services, store);
  }
  return store;
}

/** Reads the optimization side's presence without loading it. */
export function useOptimizationPresence<T>(selector: (presence: OptimizationPresence) => T): T {
  return useStore(getOptimizationPresence(), selector);
}

/** Whether the optimization side has loaded; a component that asks starts loading it. */
export function useOptimizationLoaded(): boolean {
  const loaded = useOptimizationPresence((presence) => presence.loaded);
  useEffect(() => {
    if (!loaded) void getServices().loadOptimization();
  }, [loaded]);
  return loaded;
}
