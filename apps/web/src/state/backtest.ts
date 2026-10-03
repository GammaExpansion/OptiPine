import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { examples, type ExampleId } from '../../examples/index.ts';
import trendBreakout from '../../examples/trend-breakout.pine?raw';
import rsiReversal from '../../examples/rsi-reversal.pine?raw';
import maCross from '../../examples/ma-cross.pine?raw';
import type { BacktestState } from '../workflows/backtest.ts';
import { exampleRequest } from '../workflows/market-data.ts';
import { getMarketDataStore } from './marketData.ts';
import { getServices, type AppServices } from './services.ts';
import { uiStore } from './ui.ts';

export type ScriptOrigin =
  | { readonly kind: 'pasted' }
  | { readonly kind: 'file' }
  | { readonly kind: 'example'; readonly id: ExampleId };

export interface OpenScript {
  readonly source: string;
  readonly fileName: string | null;
  readonly origin: ScriptOrigin;
}

const exampleSources: Record<ExampleId, string> = {
  'trend-breakout': trendBreakout,
  'rsi-reversal': rsiReversal,
  'ma-cross': maCross,
};

function createBacktestStore(services: AppServices) {
  const session = services.backtest;
  let openVersion = 0;
  const actions = {
    setSource: session.setSource.bind(session),
    setInput: session.setInput.bind(session),
    resetInputs: session.resetInputs.bind(session),
    restoreResultInputs: session.restoreResultInputs.bind(session),
    setProperty: session.setProperty.bind(session),
    resetProperties: session.resetProperties.bind(session),
    resetProperty: session.resetProperty.bind(session),
    run: session.run.bind(session),
    cancel: session.cancel.bind(session),
    preview: session.preview.bind(session),
    backToOptimization: session.backToOptimization.bind(session),
    setPreviewAsCurrent: session.setPreviewAsCurrent.bind(session),
    applyParameters: session.applyParameters.bind(session),
    undoApply: session.undoApply.bind(session),
    openScript({ source, fileName, origin }: OpenScript) {
      openVersion++;
      store.setState({ fileName, origin });
      session.setSource(source);
    },
    async loadExample(id: ExampleId) {
      const example = examples.find((item) => item.id === id)!;
      actions.openScript({
        source: exampleSources[id],
        fileName: example.fileName,
        origin: { kind: 'example', id },
      });
      const version = openVersion;
      const request = exampleRequest(services.now());
      const market = getMarketDataStore(services);
      await market.getState().actions.fetch(request);
      // A different script or market selection may have superseded this example while fetching.
      const state = market.getState().fetch;
      if (version !== openVersion || !('request' in state) || state.request !== request) return;
      if (state.status === 'preview') market.getState().actions.accept();
      else if (state.status === 'unavailable' || state.status === 'refused')
        uiStore.getState().setDialogOpen('marketData', true);
    },
  };
  const store = createStore<
    BacktestState & {
      readonly fileName: string | null;
      readonly origin: ScriptOrigin | null;
      readonly actions: typeof actions;
    }
  >()(() => ({ ...session.getState(), fileName: null, origin: null, actions }));
  services.onDispose(session.subscribe((state) => store.setState(state)));
  services.onDispose(() => openVersion++);
  return store;
}

type BacktestStore = ReturnType<typeof createBacktestStore>;
export type BacktestStoreState = ReturnType<BacktestStore['getState']>;
const stores = new WeakMap<AppServices, BacktestStore>();

export function getBacktestStore(services = getServices()): BacktestStore {
  let store = stores.get(services);
  if (!store) {
    store = createBacktestStore(services);
    stores.set(services, store);
  }
  return store;
}

export function useBacktestStore<T>(selector: (state: BacktestStoreState) => T): T {
  return useStore(getBacktestStore(), selector);
}

export function openScript(script: OpenScript): void {
  getBacktestStore().getState().actions.openScript(script);
}

export function loadExample(id: ExampleId): Promise<void> {
  return getBacktestStore().getState().actions.loadExample(id);
}
